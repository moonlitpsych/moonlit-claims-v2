/**
 * Backfill IntakeQ Claims Script
 * Imports existing claims from IntakeQ into our database
 *
 * Usage: npx tsx scripts/backfill-intakeq-claims.ts [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { fetchAllIntakeQClaims, mapIntakeQStatus, getIntakeQStatusName, IntakeQClaim } from '../services/intakeq/claims';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

if (!process.env.INTAKEQ_API_KEY) {
  console.error('❌ Missing INTAKEQ_API_KEY');
  console.error('Make sure INTAKEQ_API_KEY is set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface BackfillStats {
  totalClaims: number;
  imported: number;
  skipped: number;
  errors: number;
  statusBreakdown: Record<string, number>;
}

async function backfillClaims() {
  console.log('🚀 Starting IntakeQ Claims Backfill...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let startDate: string | undefined;
  let endDate: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start-date' && args[i + 1]) {
      startDate = args[i + 1];
    }
    if (args[i] === '--end-date' && args[i + 1]) {
      endDate = args[i + 1];
    }
  }

  console.log('📅 Date Range:', {
    startDate: startDate || 'All time',
    endDate: endDate || 'Now',
  });

  // Fetch claims from IntakeQ
  console.log('\n📥 Fetching claims from IntakeQ...');
  const result = await fetchAllIntakeQClaims({ startDate, endDate });

  if (!result.success || !result.claims) {
    console.error('❌ Failed to fetch claims:', result.error);
    process.exit(1);
  }

  const stats: BackfillStats = {
    totalClaims: result.claims.length,
    imported: 0,
    skipped: 0,
    errors: 0,
    statusBreakdown: {},
  };

  console.log(`✅ Found ${result.claims.length} claims\n`);

  // Import each claim
  for (const claim of result.claims) {
    const statusName = getIntakeQStatusName(claim.Status);
    stats.statusBreakdown[statusName] = (stats.statusBreakdown[statusName] || 0) + 1;

    try {
      // Use first procedure's appointment ID as the claim's appointment
      const appointmentId = claim.Procedures[0]?.AppointmentId || '';

      if (!appointmentId) {
        console.log(`⏭️  Skipping claim ${claim.PatientAccountNumber} (no appointment ID)`);
        stats.skipped++;
        continue;
      }

      // Check if claim already exists by account number (our claim ID)
      const { data: existing } = await supabase
        .from('claims')
        .select('id')
        .eq('intakeq_claim_id', claim.PatientAccountNumber)
        .single();

      if (existing) {
        console.log(`⏭️  Skipping claim ${claim.PatientAccountNumber} (already exists)`);
        stats.skipped++;
        continue;
      }

      // Map IntakeQ status to our enum
      const mappedStatus = mapIntakeQStatus(claim.Status);

      // Extract diagnosis codes
      const diagnosisCodes = claim.Diagnosis
        .filter(code => code && code.trim() !== '')
        .map((code, index) => ({
          code,
          description: '', // We don't have descriptions from IntakeQ
          isPrimary: index === 0,
        }));

      // Extract service lines from Procedures array
      const serviceLines = claim.Procedures.map(proc => ({
        cptCode: proc.Procedure,
        modifiers: proc.Modifiers,
        units: proc.Units,
        chargeAmount: proc.Charges,
        dateOfService: new Date(proc.Date).toISOString().split('T')[0], // Convert unix timestamp to YYYY-MM-DD
        placeOfService: proc.PlaceOfService,
      }));

      // Calculate total charge amount
      const totalChargeAmount = claim.Procedures.reduce((sum, proc) => sum + proc.Charges, 0);

      // Convert unix timestamps to dates
      const patientDOB = new Date(claim.PatientDateOfBirth).toISOString().split('T')[0];
      const subscriberDOB = new Date(claim.InsuredDateOfBirth).toISOString().split('T')[0];

      // Insert claim into database
      const { error } = await supabase.from('claims').insert({
        // IntakeQ references
        intakeq_claim_id: claim.PatientAccountNumber, // This is the claim ID (e.g., C84P133)
        intakeq_appointment_id: appointmentId,
        intakeq_client_id: '', // We don't have direct client ID in claims response
        intakeq_practitioner_id: claim.PractitionerId,

        // Patient info
        patient_first_name: claim.PatientFirstName,
        patient_last_name: claim.PatientLastName,
        patient_date_of_birth: patientDOB,
        patient_address: {
          street: claim.PatientStreetAddress,
          city: claim.PatientCity,
          state: claim.PatientState,
          zip: claim.PatientZip,
        },

        // Insurance info
        insurance_info: {
          carrier: claim.PayerName,
          memberId: claim.InsuredId,
          groupNumber: claim.InsuredGroupId || '',
          subscriberFirstName: claim.InsuredFirstName,
          subscriberLastName: claim.InsuredLastName,
          subscriberDateOfBirth: subscriberDOB,
          relationshipToSubscriber: claim.ClientRelationshipToInsured || 'self',
        },

        // Clinical data
        diagnosis_codes: diagnosisCodes,
        service_lines: serviceLines,

        // Status
        status: mappedStatus,
        submission_date: claim.Status >= 2 ? new Date().toISOString() : null, // If submitted or beyond

        // Financial
        total_charge_amount: totalChargeAmount,

        // Metadata
        ai_coding_used: false,
        created_by: 'intakeq_backfill',

        // Office Ally control number
        office_ally_control_number: claim.PatientAccountNumber,
      });

      if (error) {
        console.error(`❌ Error importing claim ${claim.PatientAccountNumber}:`, error.message);
        stats.errors++;
      } else {
        console.log(
          `✅ Imported claim ${claim.PatientAccountNumber} - Appointment: ${appointmentId} - Status: ${statusName} (${mappedStatus})`
        );
        stats.imported++;
      }
    } catch (error) {
      console.error(`❌ Exception importing claim ${claim.PatientAccountNumber}:`, error);
      stats.errors++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Backfill Summary');
  console.log('='.repeat(60));
  console.log(`Total Claims Found:    ${stats.totalClaims}`);
  console.log(`✅ Imported:           ${stats.imported}`);
  console.log(`⏭️  Skipped (existing):  ${stats.skipped}`);
  console.log(`❌ Errors:             ${stats.errors}`);
  console.log('\n📈 Status Breakdown:');
  Object.entries(stats.statusBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`   ${status.padEnd(25)} ${count}`);
    });
  console.log('='.repeat(60));

  if (stats.errors > 0) {
    console.log('\n⚠️  Some claims failed to import. Check the logs above for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 Backfill completed successfully!');
    process.exit(0);
  }
}

// Run the backfill
backfillClaims().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

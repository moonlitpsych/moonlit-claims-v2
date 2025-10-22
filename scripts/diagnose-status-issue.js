/**
 * Comprehensive diagnostic script to identify why claim statuses aren't showing
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('\n=== CLAIM STATUS DIAGNOSTIC ===\n');

  // Test 1: Check if we have any claims in the database
  console.log('Test 1: Checking for claims in database...');
  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .limit(10);

  if (claimsError) {
    console.log('❌ Error fetching claims:', claimsError.message);
  } else if (!claims || claims.length === 0) {
    console.log('⚠️  No claims found in database');
    console.log('   This is why statuses aren\'t showing - no claims have been created yet!');
  } else {
    console.log(`✅ Found ${claims.length} claim(s) in database`);
    claims.forEach((claim, i) => {
      console.log(`\n   Claim ${i + 1}:`);
      console.log(`     ID: ${claim.id}`);
      console.log(`     IntakeQ Appointment ID: ${claim.intakeq_appointment_id}`);
      console.log(`     Status: ${claim.status}`);
      console.log(`     Submission Date: ${claim.submission_date || 'Not submitted'}`);
    });
  }

  // Test 2: Check if we have any status updates
  console.log('\n\nTest 2: Checking for claim status updates...');
  const { data: updates, error: updatesError } = await supabase
    .from('claim_status_updates')
    .select('*')
    .limit(10);

  if (updatesError) {
    console.log('❌ Error fetching status updates:', updatesError.message);
  } else if (!updates || updates.length === 0) {
    console.log('⚠️  No status updates found');
    console.log('   No 277 responses have been processed yet');
  } else {
    console.log(`✅ Found ${updates.length} status update(s)`);
    updates.forEach((update, i) => {
      console.log(`\n   Update ${i + 1}:`);
      console.log(`     Claim ID: ${update.claim_id}`);
      console.log(`     Status: ${update.status}`);
      console.log(`     Status Code: ${update.status_code}`);
      console.log(`     Date: ${update.created_at}`);
    });
  }

  // Test 3: Check the AppointmentCard component expectations
  console.log('\n\nTest 3: Checking dashboard expectations...');
  console.log('The dashboard expects:');
  console.log('  - Claims with field: intakeq_appointment_id');
  console.log('  - Status map format: { [appointmentId]: claimStatus }');
  console.log('  - ClaimStatus values: "draft" | "validated" | "submitted" | "accepted" | "rejected" | "paid"');

  // Test 4: Check if API route is working
  console.log('\n\nTest 4: Testing /api/claims endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/claims?includeStatuses=true');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API endpoint responds successfully');
      console.log(`   Claims returned: ${data.data ? data.data.length : 0}`);
      if (data.data && data.data.length > 0) {
        console.log('\n   Sample claim from API:');
        console.log('   ', JSON.stringify(data.data[0], null, 2).split('\n').join('\n   '));
      }
    } else {
      console.log('❌ API endpoint returned error:', response.status);
      const text = await response.text();
      console.log('   Response:', text.substring(0, 200));
    }
  } catch (err) {
    console.log('❌ Could not reach API endpoint:', err.message);
    console.log('   Make sure dev server is running on port 3000');
  }

  // Test 5: Summary and recommendations
  console.log('\n\n=== DIAGNOSIS SUMMARY ===\n');

  if (!claims || claims.length === 0) {
    console.log('🔍 ROOT CAUSE: No claims exist in the database yet');
    console.log('\n📋 TO FIX:');
    console.log('   1. Go to http://localhost:3000/dashboard');
    console.log('   2. Click "Make My Claim" on any completed appointment');
    console.log('   3. Fill out the form and click "Submit Claim"');
    console.log('   4. The claim will be saved to the database');
    console.log('   5. After Office Ally sends a 277 response, the status will update');
    console.log('\n⚠️  NOTE: The automatic status polling is currently disabled');
    console.log('   You can manually check for 277 files with:');
    console.log('   node scripts/test-277-download.js');
  } else if (!updates || updates.length === 0) {
    console.log('🔍 ROOT CAUSE: Claims exist but no 277 responses processed yet');
    console.log('\n📋 TO FIX:');
    console.log('   1. Claims need to be submitted to Office Ally first');
    console.log('   2. Office Ally will send 277 responses (usually within 24-48 hours)');
    console.log('   3. Run: node scripts/test-277-download.js');
    console.log('   4. This will download and parse 277 files from SFTP');
    console.log('   5. Statuses will then appear on the dashboard');
  } else {
    console.log('✅ Claims and status updates exist!');
    console.log('\n🔍 If statuses still aren\'t showing on dashboard:');
    console.log('   1. Check browser console for JavaScript errors');
    console.log('   2. Verify claim status fetching code is uncommented in dashboard');
    console.log('   3. Check that intakeq_appointment_id matches between claims and appointments');
  }

  console.log('\n');
}

diagnose().catch(console.error);

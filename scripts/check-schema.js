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

async function checkSchema() {
  console.log('\n=== Checking Claims Table Schema ===\n');

  // Try to query the claims table structure
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .limit(0);

  if (error) {
    console.error('Error querying claims table:', error.message);
  } else {
    console.log('Claims table exists and is queryable');

    // Try to insert a test row to see what columns are required
    console.log('\nAttempting test insert to check schema...\n');

    const testClaim = {
      intakeq_appointment_id: 'TEST123',
      intakeq_client_id: 'CLIENT123',
      intakeq_practitioner_id: 'PRAC123',
      patient_first_name: 'Test',
      patient_last_name: 'Patient',
      patient_date_of_birth: '1990-01-01',
      patient_address: { street: '123 Test St', city: 'Test', state: 'UT', zip: '84101' },
      insurance_info: { carrier: 'Test Insurance', memberId: '123456' },
      diagnosis_codes: [{ code: 'F41.1', description: 'Test', isPrimary: true }],
      service_lines: [{ cptCode: '99214', units: 1, chargeAmount: 200 }]
    };

    const { data: insertData, error: insertError } = await supabase
      .from('claims')
      .insert(testClaim)
      .select();

    if (insertError) {
      console.error('❌ Test insert failed:', insertError.message);
      console.log('\nThis tells us the schema is not correct yet.');
    } else {
      console.log('✅ Test insert succeeded!');
      console.log('Schema is correct. Deleting test record...');

      // Delete the test record
      await supabase
        .from('claims')
        .delete()
        .eq('intakeq_appointment_id', 'TEST123');

      console.log('✅ Test record deleted.');
    }
  }

  console.log('\n');
}

checkSchema().catch(console.error);

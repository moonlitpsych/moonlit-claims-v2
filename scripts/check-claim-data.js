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

async function checkData() {
  console.log('\n=== Checking for Existing Data ===\n');

  const tables = [
    'claims',
    'claim_submissions',
    'claim_status_updates',
    'ai_coding_log',
    'eligibility_checks',
    'audit_log'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`⚠️  ${table}: Error checking - ${error.message}`);
      } else {
        if (count === 0) {
          console.log(`✅ ${table}: EMPTY (safe to drop)`);
        } else {
          console.log(`⚠️  ${table}: HAS ${count} RECORDS`);
        }
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err.message}`);
    }
  }

  console.log('\n=== Tables that will NOT be touched ===\n');

  const safeTables = ['providers', 'payers'];
  for (const table of safeTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        console.log(`🔒 ${table}: ${count} records (SAFE - not in migration)`);
      }
    } catch (err) {
      console.log(`🔒 ${table}: ${err.message}`);
    }
  }

  console.log('\n');
}

checkData().catch(console.error);

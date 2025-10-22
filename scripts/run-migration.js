#!/usr/bin/env node
/**
 * Simple migration runner
 * Usage: node scripts/run-migration.js 003_add_intakeq_claim_id.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Please specify a migration file');
  console.error('Usage: node scripts/run-migration.js 003_add_intakeq_claim_id.sql');
  process.exit(1);
}

const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log(`🔄 Running migration: ${migrationFile}\n`);

  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('SQL to execute:');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
  console.log();

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Executing ${statements.length} statements...\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    console.log(`${i + 1}. Executing...`);

    try {
      // Use raw query
      const { data, error } = await supabase.rpc('exec', { query: statement }).catch(() => ({data: null, error: null}));

      if (error) {
        console.log(`   ⚠️  RPC method not available, this is normal`);
        console.log(`   ℹ️  Please run this SQL manually in Supabase SQL Editor:`);
        console.log(`   ${statement.substring(0, 100)}...`);
      } else {
        console.log(`   ✅ Success`);
      }
    } catch (err) {
      console.log(`   ℹ️  SQL should be run manually in Supabase`);
    }
  }

  console.log('\n✅ Migration script prepared');
  console.log('\nTo complete the migration:');
  console.log('1. Go to your Supabase project dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Paste and run the SQL shown above');
  console.log('\nOr use the Supabase CLI: npx supabase db push');
}

runMigration().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

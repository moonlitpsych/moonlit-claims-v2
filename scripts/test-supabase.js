/**
 * Test Supabase connection with current credentials
 * Run with: node scripts/test-supabase.js
 */

// Load environment variables
const fs = require('fs');
const path = require('path');

try {
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
} catch (error) {
  console.error('Could not load .env.local:', error.message);
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');

async function testSupabaseConnection() {
  console.log('\n=== Supabase Connection Test ===\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Environment Variables:');
  console.log(`  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
  console.log(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('\n❌ Missing required Supabase credentials');
    console.log('\nPlease ensure the following are set in .env.local:');
    console.log('  - NEXT_PUBLIC_SUPABASE_URL');
    console.log('  - NEXT_PUBLIC_SUPABASE_ANON_KEY');
    console.log('  - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)');
    process.exit(1);
  }

  console.log('\n--- Testing Anonymous Client ---');
  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);

    // Test connection by listing tables
    const { data, error } = await anonClient.from('claims').select('count', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Anonymous client failed:', error.message);

      if (error.message.includes('relation "public.claims" does not exist')) {
        console.log('\n⚠️  The claims table does not exist yet.');
        console.log('   Run the migration in SETUP_SUPABASE.md to create tables.');
      }
    } else {
      console.log('✅ Anonymous client connection successful');
      console.log(`   Claims table exists (found ${data || 0} records)`);
    }
  } catch (err) {
    console.error('❌ Anonymous client error:', err.message);
  }

  console.log('\n--- Testing Service Role Client ---');
  try {
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Test connection by listing tables
    const { data, error } = await serviceClient.from('claims').select('count', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Service role client failed:', error.message);

      if (error.message.includes('relation "public.claims" does not exist')) {
        console.log('\n⚠️  The claims table does not exist yet.');
        console.log('   Run the migration in SETUP_SUPABASE.md to create tables.');
      }
    } else {
      console.log('✅ Service role client connection successful');
      console.log(`   Claims table exists (found ${data || 0} records)`);
    }
  } catch (err) {
    console.error('❌ Service role client error:', err.message);
  }

  console.log('\n--- Connection Test Complete ---\n');
}

// Run test
testSupabaseConnection().catch(console.error);

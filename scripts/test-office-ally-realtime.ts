/**
 * Test script for Office Ally REALTIME API
 * Tests both SFTP connection and 276/277 claim status inquiry
 */

import { officeAllySFTP } from '../services/officeAlly/sftpClient';
import { officeAllyRealtime } from '../services/officeAlly/realtimeClient';

async function testSFTPConnection() {
  console.log('\n=== Testing SFTP Connection ===\n');

  try {
    const result = await officeAllySFTP.testConnection();

    if (result) {
      console.log('✅ SFTP connection successful!');
      return true;
    } else {
      console.log('❌ SFTP connection failed');
      return false;
    }
  } catch (error) {
    console.error('❌ SFTP connection error:', error);
    return false;
  }
}

async function testRealtimeAPI() {
  console.log('\n=== Testing REALTIME API (276/277) ===\n');

  // Test with sample claim data
  const testRequest = {
    claimId: 'TEST-001',
    patientFirstName: 'John',
    patientLastName: 'Doe',
    patientDateOfBirth: '1980-01-01',
    subscriberMemberId: 'TEST123456',
    providerNPI: '1275348807', // Moonlit's NPI
    payerId: 'SKUT0', // Utah Medicaid (from previous testing)
    dateOfService: '2025-10-01',
    claimAmount: '150.00',
  };

  console.log('Test request:', JSON.stringify(testRequest, null, 2));
  console.log('\nSubmitting 276 claim status inquiry...\n');

  try {
    const result = await officeAllyRealtime.checkClaimStatus(testRequest);

    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ REALTIME API call successful!');
      console.log(`Status: ${result.claimStatus}`);
      console.log(`Status Code: ${result.statusCode}`);

      if (result.raw277) {
        console.log('\n--- Raw X12 277 Response ---');
        console.log(result.raw277);
        console.log('--- End Raw Response ---\n');
      }

      return true;
    } else {
      console.log('\n❌ REALTIME API call failed');
      console.log(`Error: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('\n❌ REALTIME API error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return false;
  }
}

async function testOfficeAllyConfig() {
  console.log('\n=== Office Ally Configuration Test ===');
  console.log('Testing SFTP and REALTIME API connectivity\n');

  // Check environment variables
  console.log('Checking environment variables...');
  const requiredVars = [
    'OFFICE_ALLY_SFTP_HOST',
    'OFFICE_ALLY_SFTP_USERNAME',
    'OFFICE_ALLY_SFTP_PASSWORD',
    'OFFICE_ALLY_ENDPOINT',
    'OFFICE_ALLY_USERNAME',
    'OFFICE_ALLY_PASSWORD',
    'OFFICE_ALLY_SENDER_ID',
  ];

  let allVarsPresent = true;
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      console.log(`✅ ${varName}: configured`);
    } else {
      console.log(`❌ ${varName}: MISSING`);
      allVarsPresent = false;
    }
  }

  if (!allVarsPresent) {
    console.log('\n❌ Some required environment variables are missing!');
    return;
  }

  console.log('\n✅ All environment variables are configured\n');

  // Test SFTP
  const sftpResult = await testSFTPConnection();

  // Test REALTIME API
  const realtimeResult = await testRealtimeAPI();

  // Summary
  console.log('\n=== Test Summary ===\n');
  console.log(`SFTP Connection: ${sftpResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`REALTIME API (276/277): ${realtimeResult ? '✅ PASS' : '❌ FAIL'}`);

  if (sftpResult && !realtimeResult) {
    console.log('\n⚠️  SFTP works but REALTIME API failed.');
    console.log('This likely means:');
    console.log('1. Office Ally has not enabled 276/277 transactions for your account, OR');
    console.log('2. There is an issue with the SOAP request format');
    console.log('\nYou mentioned contacting REALTIME support - that was the right call!');
  } else if (!sftpResult && !realtimeResult) {
    console.log('\n❌ Both SFTP and REALTIME failed.');
    console.log('Check your credentials in .env.local');
  } else if (sftpResult && realtimeResult) {
    console.log('\n✅ All systems operational!');
  }
}

// Run the tests
testOfficeAllyConfig().catch(console.error);

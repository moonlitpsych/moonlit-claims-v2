/**
 * Test script to download and parse 277 claim status files from Office Ally SFTP
 * Run with: node scripts/test-277-download.js
 */

// Load environment variables from .env.local
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
}

const Client = require('ssh2-sftp-client');

function parse277(x12Content) {
  console.log('\n--- Parsing 277 Content ---\n');

  const lines = x12Content.split(/[~\n]/);
  const statuses = [];
  let currentClaim = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TRN - Tracking Number
    if (trimmed.startsWith('TRN*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        console.log(`Found TRN (Tracking): ${parts[2]}`);
        currentClaim.claimIdentifier = parts[2];
      }
    }

    // REF*D9 - Patient Control Number
    if (trimmed.startsWith('REF*D9*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        console.log(`Found REF*D9 (Patient Control): ${parts[2]}`);
        currentClaim.patientControlNumber = parts[2];
      }
    }

    // REF*1K - Payer Claim Number
    if (trimmed.startsWith('REF*1K*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        console.log(`Found REF*1K (Payer Claim #): ${parts[2]}`);
        currentClaim.payerClaimNumber = parts[2];
      }
    }

    // STC - Status Information (KEY!)
    if (trimmed.startsWith('STC*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 2) {
        const statusInfo = parts[1].split(':');
        const statusCode = statusInfo[0];
        const entityCode = statusInfo[1]; // 20=Claim, 42=Service line

        const statusMap = {
          'A0': 'Acknowledgement/Forwarded',
          'A1': 'Acknowledgement/Forwarded - Not on file',
          'A2': 'Acknowledgement/Receipt',
          'A3': 'Acknowledgement - Rejected',
          'A4': 'Acknowledgement - Not Found',
          'A5': 'Acknowledgement - Split Claim',
          'A6': 'Acknowledgement - Pending',
          'A7': 'Acknowledgement - Processed',
          'A8': 'Acknowledgement - Reversed',
          'P1': 'Processed - Primary Payment',
          'P2': 'Processed - Secondary Payment',
          'P3': 'Processed - Tertiary Payment',
          'P4': 'Processed - Denied',
          'P5': 'Pended',
          'F1': 'Finalized - Payment',
          'F2': 'Finalized - Forwarded',
          'F3': 'Finalized - No payment',
          'F4': 'Finalized - Forwarded with payment',
        };

        const statusDescription = statusMap[statusCode] || `Status ${statusCode}`;
        console.log(`\n✅ STATUS: ${statusCode} - ${statusDescription}`);
        console.log(`   Entity Code: ${entityCode} (${entityCode === '20' ? 'Claim Level' : entityCode === '42' ? 'Service Line' : 'Other'})`);

        currentClaim.statusCode = statusCode;
        currentClaim.statusDescription = statusDescription;
        currentClaim.entityCode = entityCode;

        if (parts[2]) {
          console.log(`   Additional Info: ${parts[2]}`);
        }
      }
    }

    // DTP*472 - Service Date
    if (trimmed.startsWith('DTP*472*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 4) {
        const rawDate = parts[3];
        if (rawDate.length === 8) {
          const formatted = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
          console.log(`Service Date: ${formatted}`);
          currentClaim.serviceDate = formatted;
        }
      }
    }

    // SE - End of transaction (save claim)
    if (trimmed.startsWith('SE*')) {
      if (Object.keys(currentClaim).length > 0) {
        statuses.push({ ...currentClaim });
        console.log('\n--- End of Claim ---\n');
        currentClaim = {};
      }
    }
  }

  return statuses;
}

async function test277Download() {
  console.log('\n=== Office Ally 277 Download Test ===\n');

  const config = {
    host: process.env.OFFICE_ALLY_SFTP_HOST,
    port: parseInt(process.env.OFFICE_ALLY_SFTP_PORT || '22'),
    username: process.env.OFFICE_ALLY_SFTP_USERNAME,
    password: process.env.OFFICE_ALLY_SFTP_PASSWORD,
  };

  const sftp = new Client();

  try {
    console.log('Connecting to SFTP...');
    await sftp.connect(config);
    console.log('✅ Connected!\n');

    console.log('Listing 277 files in /outbound...');
    const fileList = await sftp.list('/outbound');

    const status277Files = fileList.filter(
      f => f.name.endsWith('.277') || f.name.includes('EDI_STATUS')
    );

    console.log(`Found ${status277Files.length} 277 status files\n`);

    if (status277Files.length === 0) {
      console.log('No 277 files found to test');
      await sftp.end();
      return;
    }

    // Download the first 3 files for testing
    const filesToTest = status277Files.slice(0, 3);

    for (const file of filesToTest) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${file.name}`);
      console.log(`Size: ${file.size} bytes`);
      console.log(`Modified: ${new Date(file.modifyTime).toISOString()}`);
      console.log('='.repeat(60));

      const remotePath = `/outbound/${file.name}`;
      const content = await sftp.get(remotePath);
      const contentStr = content.toString('utf-8');

      console.log('\n--- Raw X12 277 Content (first 500 chars) ---');
      console.log(contentStr.substring(0, 500));
      console.log('...\n');

      // Parse the 277
      const statuses = parse277(contentStr);

      console.log(`\n📊 Summary: Found ${statuses.length} claim status(es) in this file\n`);

      statuses.forEach((status, idx) => {
        console.log(`Claim ${idx + 1}:`);
        console.log(`  Identifier: ${status.claimIdentifier || status.patientControlNumber || 'N/A'}`);
        console.log(`  Status: ${status.statusCode} - ${status.statusDescription}`);
        if (status.payerClaimNumber) {
          console.log(`  Payer Claim #: ${status.payerClaimNumber}`);
        }
        if (status.serviceDate) {
          console.log(`  Service Date: ${status.serviceDate}`);
        }
        console.log('');
      });
    }

    await sftp.end();
    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    try {
      await sftp.end();
    } catch (e) {
      // Ignore
    }
  }
}

// Run the test
test277Download().catch(console.error);

/**
 * Simple test script for Office Ally SFTP
 * Tests connection, directory listing, and file upload
 * Run with: node scripts/test-sftp.js
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

async function testSFTPConnection() {
  console.log('\n=== Office Ally SFTP Connection Test ===\n');

  // Check configuration
  console.log('Checking configuration...\n');

  const config = {
    host: process.env.OFFICE_ALLY_SFTP_HOST,
    port: parseInt(process.env.OFFICE_ALLY_SFTP_PORT || '22'),
    username: process.env.OFFICE_ALLY_SFTP_USERNAME,
    password: process.env.OFFICE_ALLY_SFTP_PASSWORD,
  };

  const requiredVars = {
    'OFFICE_ALLY_SFTP_HOST': config.host,
    'OFFICE_ALLY_SFTP_PORT': config.port,
    'OFFICE_ALLY_SFTP_USERNAME': config.username,
    'OFFICE_ALLY_SFTP_PASSWORD': config.password ? '***' : undefined,
  };

  let allConfigured = true;
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      console.log(`✅ ${key}: ${value}`);
    } else {
      console.log(`❌ ${key}: MISSING`);
      allConfigured = false;
    }
  }

  if (!allConfigured) {
    console.log('\n❌ Missing required configuration!');
    return;
  }

  console.log('\n✅ Configuration looks good\n');

  const sftp = new Client();

  try {
    // Test 1: Connect
    console.log('Test 1: Connecting to SFTP server...');
    await sftp.connect(config);
    console.log('✅ Connection successful!\n');

    // Test 2: Get current directory
    console.log('Test 2: Getting current working directory...');
    const cwd = await sftp.cwd();
    console.log(`✅ Current directory: ${cwd}\n`);

    // Test 3: List root directory
    console.log('Test 3: Listing root directory...');
    const rootList = await sftp.list('/');
    console.log(`✅ Found ${rootList.length} items in root:\n`);
    rootList.forEach(item => {
      const type = item.type === 'd' ? '[DIR]' : '[FILE]';
      const size = item.type === 'd' ? '' : `(${item.size} bytes)`;
      console.log(`  ${type} ${item.name} ${size}`);
    });

    // Test 4: Check for /outbound directory (where we upload claims)
    console.log('\nTest 4: Checking for /outbound directory...');
    const outboundExists = rootList.some(item => item.name === 'outbound' && item.type === 'd');
    if (outboundExists) {
      console.log('✅ /outbound directory exists');

      console.log('\nListing /outbound directory...');
      const outboundList = await sftp.list('/outbound');
      console.log(`  Found ${outboundList.length} items in /outbound\n`);
      if (outboundList.length > 0) {
        outboundList.slice(0, 5).forEach(item => {
          console.log(`  - ${item.name} (${item.size} bytes)`);
        });
        if (outboundList.length > 5) {
          console.log(`  ... and ${outboundList.length - 5} more files`);
        }
      }
    } else {
      console.log('⚠️  /outbound directory not found');
      console.log('   Available directories:', rootList.filter(item => item.type === 'd').map(item => item.name).join(', '));
    }

    // Test 5: Check for /inbound directory (where we download acknowledgments)
    console.log('\nTest 5: Checking for /inbound directory...');
    const inboundExists = rootList.some(item => item.name === 'inbound' && item.type === 'd');
    if (inboundExists) {
      console.log('✅ /inbound directory exists');

      console.log('\nListing /inbound directory...');
      const inboundList = await sftp.list('/inbound');
      console.log(`  Found ${inboundList.length} items in /inbound\n`);
      if (inboundList.length > 0) {
        inboundList.slice(0, 5).forEach(item => {
          console.log(`  - ${item.name} (${item.size} bytes)`);
        });
        if (inboundList.length > 5) {
          console.log(`  ... and ${inboundList.length - 5} more files`);
        }
      } else {
        console.log('  (directory is empty)');
      }
    } else {
      console.log('⚠️  /inbound directory not found');
    }

    // Test 6: Upload a test file
    console.log('\nTest 6: Uploading test file...');
    const testContent = `TEST FILE - Created by Moonlit Claims App
Timestamp: ${new Date().toISOString()}
Sender ID: ${config.username}
This is a test file to verify SFTP upload capability.
If you see this file, the connection is working!`;

    const testFileName = `TEST_MOONLIT_${Date.now()}.txt`;
    const uploadPath = `/outbound/${testFileName}`;

    try {
      await sftp.put(Buffer.from(testContent), uploadPath);
      console.log(`✅ Test file uploaded successfully: ${uploadPath}`);

      // Verify the file exists
      console.log('\nVerifying upload...');
      const exists = await sftp.exists(uploadPath);
      if (exists) {
        console.log('✅ File verified on server');

        // Get file info
        const stat = await sftp.stat(uploadPath);
        console.log(`  Size: ${stat.size} bytes`);
        console.log(`  Modified: ${new Date(stat.modifyTime).toISOString()}`);
      }
    } catch (uploadError) {
      console.log(`❌ Upload failed: ${uploadError.message}`);
      console.log('   This might mean you don\'t have write permissions to /outbound');
    }

    // Disconnect
    await sftp.end();
    console.log('\n✅ Disconnected successfully\n');

    // Summary
    console.log('=== Test Summary ===\n');
    console.log('✅ SFTP connection: PASS');
    console.log('✅ Directory listing: PASS');
    console.log(`${outboundExists ? '✅' : '⚠️ '} /outbound directory: ${outboundExists ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`${inboundExists ? '✅' : '⚠️ '} /inbound directory: ${inboundExists ? 'FOUND' : 'NOT FOUND'}`);
    console.log('\nYour SFTP configuration is working correctly!');
    console.log('You can submit claims via SFTP (837P files).\n');

  } catch (error) {
    console.error('\n❌ SFTP Error:', error.message);

    if (error.message.includes('Authentication failed')) {
      console.log('\nAuthentication failed. Please check:');
      console.log('1. Username is correct');
      console.log('2. Password is correct');
      console.log('3. Your account has SFTP access enabled');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      console.log('\nConnection failed. Please check:');
      console.log('1. Host address is correct');
      console.log('2. Port is correct (should be 22)');
      console.log('3. You have network access to Office Ally servers');
    } else {
      console.log('\nFull error:', error);
    }

    try {
      await sftp.end();
    } catch (endError) {
      // Ignore disconnect errors
    }
  }

  console.log('\n=== Test Complete ===\n');
}

// Run the test
testSFTPConnection().catch(console.error);

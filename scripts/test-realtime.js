/**
 * Simple test script for Office Ally REALTIME API
 * Run with: node scripts/test-realtime.js
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

function generateX12_276() {
  const now = new Date();
  const controlNumber = Math.floor(100000000 + Math.random() * 900000000).toString();

  const formatDate = (date, format) => {
    const year = format === 'YYMMDD'
      ? date.getFullYear().toString().slice(-2)
      : date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const formatTime = (date, format = 'HHMMss') => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    if (format === 'HHMM') return `${hours}${minutes}`;
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}${minutes}${seconds}`;
  };

  const padRight = (str, length) => {
    return (str + ' '.repeat(length)).substring(0, length);
  };

  const senderId = process.env.OFFICE_ALLY_SENDER_ID || '1161680';
  const receiverId = 'OFFALLY';

  const segments = [];

  // ISA
  segments.push(
    `ISA*00*          *00*          *30*${padRight(senderId, 15)}*30*${padRight(
      receiverId,
      15
    )}*${formatDate(now, 'YYMMDD')}*${formatTime(now)}*^*00501*${controlNumber}*0*P*:~`
  );

  // GS
  segments.push(
    `GS*HS*${senderId}*${receiverId}*${formatDate(now, 'YYYYMMDD')}*${formatTime(
      now,
      'HHMM'
    )}*${controlNumber}*X*005010X212~`
  );

  // ST
  segments.push(`ST*276*${controlNumber}*005010X212~`);

  // BHT
  segments.push(
    `BHT*0010*13*${controlNumber}*${formatDate(now, 'YYYYMMDD')}*${formatTime(now, 'HHMM')}~`
  );

  // 2000A - Payer
  segments.push(`HL*1**20*1~`);
  segments.push(`NM1*PR*2*UTAH MEDICAID*****PI*SKUT0~`);

  // 2000B - Provider
  segments.push(`HL*2*1*21*1~`);
  segments.push(`NM1*1P*2*MOONLIT PLLC*****XX*1275348807~`);

  // 2000C - Service Provider
  segments.push(`HL*3*2*19*1~`);
  segments.push(`NM1*1P*2*MOONLIT PLLC*****XX*1275348807~`);

  // 2000D - Subscriber
  segments.push(`HL*4*3*22*0~`);
  segments.push(`NM1*IL*1*DOE*JOHN***MI*TEST123~`);

  // 2200D - Tracking
  segments.push(`TRN*1*TEST001*${senderId}~`);

  // 2300D - Claim Info
  segments.push(`REF*D9*TEST001~`);
  segments.push(`DTP*472*D8*20251001~`);
  segments.push(`AMT*T3*150.00~`);

  // SE
  const segmentCount = segments.length + 1;
  segments.push(`SE*${segmentCount}*${controlNumber}~`);

  // GE
  segments.push(`GE*1*${controlNumber}~`);

  // IEA
  segments.push(`IEA*1*${controlNumber}~`);

  return segments.join('');
}

async function submitToRealtime(x12Content) {
  const endpoint = process.env.OFFICE_ALLY_ENDPOINT;
  const username = process.env.OFFICE_ALLY_USERNAME;
  const password = process.env.OFFICE_ALLY_PASSWORD;

  const escapeXml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <ProcessRequest xmlns="http://www.officeally.com/">
      <username>${username}</username>
      <password>${password}</password>
      <payload>${escapeXml(x12Content)}</payload>
    </ProcessRequest>
  </soap:Body>
</soap:Envelope>`;

  console.log('\n--- SOAP Request ---');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Username: ${username}`);
  console.log('SOAP Envelope length:', soapEnvelope.length, 'bytes');
  console.log('---\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.officeally.com/ProcessRequest',
    },
    body: soapEnvelope,
  });

  console.log('Response status:', response.status, response.statusText);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  const responseText = await response.text();
  console.log('\n--- SOAP Response ---');
  console.log(responseText);
  console.log('---\n');

  return { status: response.status, body: responseText };
}

async function testRealtimeAPI() {
  console.log('\n=== Office Ally REALTIME API Test ===\n');

  // Check environment variables
  console.log('Checking configuration...\n');

  const requiredVars = {
    'OFFICE_ALLY_ENDPOINT': process.env.OFFICE_ALLY_ENDPOINT,
    'OFFICE_ALLY_USERNAME': process.env.OFFICE_ALLY_USERNAME,
    'OFFICE_ALLY_PASSWORD': process.env.OFFICE_ALLY_PASSWORD ? '***' : undefined,
    'OFFICE_ALLY_SENDER_ID': process.env.OFFICE_ALLY_SENDER_ID,
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

  // Generate X12 276
  console.log('Generating X12 276 claim status inquiry...\n');
  const x12_276 = generateX12_276();

  console.log('--- X12 276 Content ---');
  console.log(x12_276);
  console.log('---\n');

  // Submit to REALTIME API
  console.log('Submitting to Office Ally REALTIME API...\n');

  try {
    const result = await submitToRealtime(x12_276);

    if (result.status === 200) {
      console.log('\n✅ Request successful (HTTP 200)');

      // Try to extract X12 277 from response
      const x12Match = result.body.match(/<ProcessRequestResult>([\s\S]*?)<\/ProcessRequestResult>/);
      if (x12Match) {
        const x12_277 = x12Match[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");

        console.log('\n--- X12 277 Response ---');
        console.log(x12_277);
        console.log('---\n');

        // Basic parsing
        if (x12_277.includes('STC*')) {
          console.log('✅ Received X12 277 response with status codes');
        }
      } else {
        console.log('⚠️  No X12 277 found in response');
      }
    } else {
      console.log(`\n❌ Request failed with HTTP ${result.status}`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }

  console.log('\n=== Test Complete ===\n');
}

// Run the test
testRealtimeAPI().catch(console.error);

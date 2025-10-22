// test-jeremy-montoya.js
// Test script to verify X12 271 parser with Jeremy Montoya sample data

const fs = require('fs');
const path = require('path');

// Import the parser from our service
const { parseX12_271Enhanced } = require('./services/eligibility-service/officeAlly');

// Read the Jeremy Montoya sample X12 271 response
const sampleFile = path.join(__dirname, 'test-data', 'raw_x12_271_jeremy_montoya_sample.txt');
const x12Data = fs.readFileSync(sampleFile, 'utf8');

console.log('==================================================');
console.log('CM BILLING SYSTEM - X12 271 PARSER TEST');
console.log('Patient: Jeremy Montoya (DOB: 1984-07-17)');
console.log('==================================================\n');

// Parse the X12 271 response
const result = parseX12_271Enhanced(x12Data);

// Display results
console.log('PARSING RESULTS:');
console.log('----------------');
console.log(`✓ Qualifies for CM: ${result.qualifiesForCM ? '✅ YES' : '❌ NO'}`);
console.log(`✓ Enrolled: ${result.enrolled ? '✅ YES' : '❌ NO'}`);
console.log(`✓ Program: ${result.program || 'Not detected'}`);
console.log(`✓ Plan Type: ${result.planType || 'Not detected'}`);
console.log(`✓ Verification Status: ${result.verified ? 'Verified' : 'Not Verified'}`);
console.log('');

console.log('PATIENT INFORMATION:');
console.log('--------------------');
console.log(`✓ Name: ${result.patientInfo?.firstName} ${result.patientInfo?.lastName}`);
console.log(`✓ Medicaid ID: ${result.patientInfo?.medicaidId || 'Not found'}`);
console.log('');

console.log('QUALIFICATION DETAILS:');
console.log('-----------------------');
console.log(result.details || 'No details available');
console.log('');

// Test specific X12 segments
console.log('X12 271 SEGMENT ANALYSIS:');
console.log('-------------------------');

const lines = x12Data.split(/[~\n]/);
let hasTargetedAdult = false;
let hasManagedCare = false;

for (const line of lines) {
    if (line.includes('*MC*TARGETED ADULT MEDICAID')) {
        hasTargetedAdult = true;
        console.log('✓ Found: TARGETED ADULT MEDICAID segment');
    }
    if (line.includes('*HM*')) {
        hasManagedCare = true;
        console.log('⚠ Found: HM (Managed Care) segment');
    }
    if (line.includes('NM1*IL*1*')) {
        const segments = line.split('*');
        const lastName = segments[3];
        const firstName = segments[4];
        const medicaidId = segments[9]?.replace('~', '');
        console.log(`✓ Patient: ${firstName} ${lastName}, Medicaid ID: ${medicaidId}`);
    }
}

console.log('');
console.log('FINAL DETERMINATION:');
console.log('--------------------');

if (result.qualifiesForCM) {
    console.log('✅ SUCCESS: Jeremy Montoya QUALIFIES for CM Program');
    console.log('   - Enrolled in Targeted Adult Medicaid (Traditional FFS)');
    console.log('   - No managed care indicators detected');
    console.log('   - Eligible for H0038 billing');
} else if (result.enrolled) {
    console.log('⚠️ WARNING: Jeremy Montoya is enrolled but DOES NOT QUALIFY');
    console.log('   - May be enrolled in managed care plan');
    console.log('   - Not eligible for CM program');
} else {
    console.log('❌ ERROR: Jeremy Montoya is NOT ENROLLED in Utah Medicaid');
}

console.log('');
console.log('==================================================');
console.log('TEST COMPLETE');
console.log('==================================================');

// Expected result for Jeremy Montoya
const expectedResult = {
    qualifiesForCM: true,
    planType: 'TRADITIONAL_FFS',
    program: 'Targeted Adult Medicaid'
};

// Verify test results
if (result.qualifiesForCM === expectedResult.qualifiesForCM &&
    result.planType === expectedResult.planType) {
    console.log('\n✅ TEST PASSED: Parser correctly identified Jeremy Montoya as qualified for CM');
    process.exit(0);
} else {
    console.log('\n❌ TEST FAILED: Parser did not correctly identify Jeremy Montoya');
    console.log('Expected:', expectedResult);
    console.log('Got:', {
        qualifiesForCM: result.qualifiesForCM,
        planType: result.planType,
        program: result.program
    });
    process.exit(1);
}
// services/eligibility-service/officeAlly.js
// Office Ally X12 270/271 integration for eligibility checking

require('dotenv').config({ path: '.env.local' });

const OFFICE_ALLY_CONFIG = {
    endpoint: process.env.OFFICE_ALLY_ENDPOINT || 'https://wsd.officeally.com/TransactionService/rtx.svc',
    receiverID: process.env.OFFICE_ALLY_RECEIVER_ID || 'OFFALLY',
    senderID: process.env.OFFICE_ALLY_SENDER_ID,
    username: process.env.OFFICE_ALLY_USERNAME,
    password: process.env.OFFICE_ALLY_PASSWORD,
    providerNPI: process.env.PROVIDER_NPI,
    providerName: process.env.PROVIDER_NAME,
    isa06: process.env.OFFICE_ALLY_SENDER_ID,
    isa08: process.env.OFFICE_ALLY_RECEIVER_ID || 'OFFALLY',
    gs02: process.env.OFFICE_ALLY_SENDER_ID,
    gs03: process.env.OFFICE_ALLY_RECEIVER_ID || 'OFFALLY'
};

// Validate required Office Ally credentials
function validateOfficeAllyConfig() {
    const required = ['senderID', 'username', 'password', 'providerNPI', 'providerName'];
    const missing = required.filter(key => !OFFICE_ALLY_CONFIG[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required Office Ally configuration: ${missing.join(', ')}. Please check your .env.local file.`);
    }
}

// Generate X12 270 request for Office Ally
function generateOfficeAllyX12_270(patient, payerId = 'UTMCD') {
    const controlNumber = Date.now().toString().slice(-9);
    const formattedDOB = patient.dob.replace(/-/g, '');
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '').slice(2);
    const timeStr = timestamp.toISOString().slice(11, 16).replace(':', '');
    const fullDateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');

    // Get payer name
    const payerName = payerId === 'UTMCD' ? 'MEDICAID UTAH' : payerId;

    // X12 270 format based on working example
    return `ISA*00*          *00*          *ZZ*${OFFICE_ALLY_CONFIG.isa06.padEnd(15)}*01*${OFFICE_ALLY_CONFIG.isa08.padEnd(15)}*${dateStr}*${timeStr}*^*00501*${controlNumber}*0*P*:~GS*HS*${OFFICE_ALLY_CONFIG.gs02}*${OFFICE_ALLY_CONFIG.gs03}*${fullDateStr}*${timeStr}*${controlNumber}*X*005010X279A1~ST*270*0001*005010X279A1~BHT*0022*13*MOONLIT-${controlNumber}*${fullDateStr}*${timeStr}~HL*1**20*1~NM1*PR*2*${payerName}*****PI*${payerId}~HL*2*1*21*1~NM1*1P*2*${OFFICE_ALLY_CONFIG.providerName}*****XX*${OFFICE_ALLY_CONFIG.providerNPI}~HL*3*2*22*0~TRN*1*${controlNumber}*${OFFICE_ALLY_CONFIG.providerNPI}*ELIGIBILITY~NM1*IL*1*${patient.last.toUpperCase()}*${patient.first.toUpperCase()}~DMG*D8*${formattedDOB}*${patient.gender || 'U'}~DTP*291*D8*${fullDateStr}~EQ*30~SE*13*0001~GE*1*${controlNumber}~IEA*1*${controlNumber}~`;
}

// Generate SOAP envelope for Office Ally
function generateOfficeAllySOAPRequest(x12Payload) {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const payloadID = generateUUID();

    return `<soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope">
<soapenv:Header>
<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
<wsse:UsernameToken>
<wsse:Username>${OFFICE_ALLY_CONFIG.username}</wsse:Username>
<wsse:Password>${OFFICE_ALLY_CONFIG.password}</wsse:Password>
</wsse:UsernameToken>
</wsse:Security>
</soapenv:Header>
<soapenv:Body>
<ns1:COREEnvelopeRealTimeRequest xmlns:ns1="http://www.caqh.org/SOAP/WSDL/CORERule2.2.0.xsd">
<PayloadType>X12_270_Request_005010X279A1</PayloadType>
<ProcessingMode>RealTime</ProcessingMode>
<PayloadID>${payloadID}</PayloadID>
<TimeStamp>${timestamp}</TimeStamp>
<SenderID>${OFFICE_ALLY_CONFIG.senderID}</SenderID>
<ReceiverID>${OFFICE_ALLY_CONFIG.receiverID}</ReceiverID>
<CORERuleVersion>2.2.0</CORERuleVersion>
<Payload>
<![CDATA[${x12Payload}]]>
</Payload>
</ns1:COREEnvelopeRealTimeRequest>
</soapenv:Body>
</soapenv:Envelope>`;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Send request to Office Ally
async function sendOfficeAllyRequest(soapRequest) {
    try {
        const response = await fetch(OFFICE_ALLY_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8;action=RealTimeTransaction;',
                'Action': 'RealTimeTransaction'
            },
            body: soapRequest
        });

        if (!response.ok) {
            throw new Error(`Office Ally API error: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();
        return responseText;
    } catch (error) {
        console.error('Office Ally request failed:', error);
        throw error;
    }
}

// Parse Office Ally SOAP response
function parseOfficeAllySOAPResponse(soapResponse) {
    try {
        const payloadMatch = soapResponse.match(/<Payload[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/Payload>/s) ||
                             soapResponse.match(/<Payload[^>]*>(.*?)<\/Payload>/s) ||
                             soapResponse.match(/<ns1:Payload[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/ns1:Payload>/s) ||
                             soapResponse.match(/<ns1:Payload[^>]*>(.*?)<\/ns1:Payload>/s);

        if (!payloadMatch) {
            console.log('Office Ally SOAP Response (first 500 chars):', soapResponse.substring(0, 500));
            throw new Error('No payload found in Office Ally SOAP response');
        }

        return payloadMatch[1].trim();
    } catch (error) {
        console.error('Office Ally SOAP parsing error:', error);
        throw new Error('Unable to parse Office Ally SOAP response');
    }
}

// Enhanced X12 271 parser for Traditional FFS detection
function parseX12_271Enhanced(x12Data) {
    const lines = x12Data.split(/[~\n]/);

    try {
        const result = {
            qualifiesForCM: false,
            enrolled: false,
            program: '',
            planType: '',
            effectiveDate: '',
            details: '',
            verified: true,
            error: '',
            patientInfo: {},
            coverageDetails: {}
        };

        let hasUtahMedicaid = false;
        let hasTargetedAdultMedicaid = false;
        let hasManagedCareIndicators = false;
        let patientName = { first: '', last: '' };
        let medicaidId = '';

        // Parse X12 271 response line by line
        for (const line of lines) {
            // Check for Utah Medicaid payer
            if (line.includes('NM1*PR*2*MEDICAID UTAH') && line.includes('PI*UTMCD')) {
                hasUtahMedicaid = true;
                result.program = 'Utah Medicaid';
            }

            // Check for patient information
            if (line.startsWith('NM1*IL*1*')) {
                const segments = line.split('*');
                patientName.last = segments[3] || '';
                patientName.first = segments[4] || '';
                if (segments[8] === 'MI' && segments[9]) {
                    medicaidId = segments[9].replace('~', '');
                }
            }

            // Check for Targeted Adult Medicaid (Traditional FFS)
            if (line.includes('*MC*TARGETED ADULT MEDICAID')) {
                hasTargetedAdultMedicaid = true;
                result.program = 'Targeted Adult Medicaid';
            }

            // Check for managed care indicators
            // Note: HM can mean different things in different contexts
            // We need to check if it's actually a managed care plan
            // vs just a benefit type (like NON EMERGENCY TRANSPORTATION)
            if (line.includes('*HM*') && !line.includes('NON EMERGENCY TRANSPORTATION')) {
                // Only mark as managed care if it's not related to transportation benefits
                // Check the full line context
                const segments = line.split('*');
                // EB*3*IND*30^60*HM*NON EMERGENCY TRANSPORTATION - MC~ is NOT managed care
                // It's just a transportation benefit
                if (!line.includes('TRANSPORTATION') && !line.includes('MODIVCARE')) {
                    hasManagedCareIndicators = true;
                }
            }

            // Check for specific managed care organizations
            const managedCareOrgs = ['MOLINA', 'SELECTHEALTH', 'ANTHEM', 'HEALTHY U', 'UNITED HEALTHCARE'];
            for (const org of managedCareOrgs) {
                if (line.toUpperCase().includes(org)) {
                    hasManagedCareIndicators = true;
                    result.details = `Enrolled in ${org} (Managed Care)`;
                }
            }

            // Check for active eligibility (EB segments)
            if (line.startsWith('EB*1*IND*') || line.startsWith('EB*6*IND*')) {
                result.enrolled = true;
            }

            // Check for rejection codes (AAA segments)
            if (line.startsWith('AAA*') && line.includes('*N*')) {
                result.enrolled = false;
                result.error = 'No active coverage found';
            }
        }

        // Determine qualification for CM program
        result.qualifiesForCM = hasUtahMedicaid && hasTargetedAdultMedicaid && !hasManagedCareIndicators;

        // Set plan type
        if (hasManagedCareIndicators) {
            result.planType = 'MANAGED_CARE';
        } else if (hasTargetedAdultMedicaid) {
            result.planType = 'TRADITIONAL_FFS';
        } else if (hasUtahMedicaid) {
            result.planType = 'MEDICAID_OTHER';
        } else {
            result.planType = 'NOT_ENROLLED';
        }

        // Set patient info
        result.patientInfo = {
            firstName: patientName.first,
            lastName: patientName.last,
            medicaidId: medicaidId
        };

        // Set detailed status message
        if (result.qualifiesForCM) {
            result.details = 'Enrolled in Utah Targeted Adult Medicaid (Traditional FFS) - QUALIFIES for CM Program';
        } else if (hasManagedCareIndicators) {
            result.details = 'Enrolled in Managed Care plan - DOES NOT QUALIFY for CM Program';
        } else if (!hasUtahMedicaid) {
            result.details = 'Not enrolled in Utah Medicaid';
        }

        return result;
    } catch (error) {
        console.error('X12 271 parsing error:', error);
        return {
            qualifiesForCM: false,
            enrolled: false,
            error: 'Unable to parse eligibility response',
            verified: true,
            planType: 'ERROR'
        };
    }
}

// Main eligibility check function
async function checkEligibility(patient) {
    const startTime = Date.now();
    console.log(`Checking eligibility for ${patient.firstName} ${patient.lastName} via Office Ally`);

    try {
        // Validate configuration
        validateOfficeAllyConfig();

        // Generate X12 270 request
        const x12_270 = generateOfficeAllyX12_270({
            first: patient.firstName.trim(),
            last: patient.lastName.trim(),
            dob: patient.dateOfBirth,
            gender: patient.gender || 'U'
        }, 'UTMCD');

        // Generate SOAP request
        const soapRequest = generateOfficeAllySOAPRequest(x12_270);

        console.log('Sending request to Office Ally...');

        // Send request
        const soapResponse = await sendOfficeAllyRequest(soapRequest);
        console.log('Received response from Office Ally');

        // Parse response
        const x12_271 = parseOfficeAllySOAPResponse(soapResponse);
        const eligibilityResult = parseX12_271Enhanced(x12_271);

        // Add processing time
        eligibilityResult.processingTimeMs = Date.now() - startTime;

        // Log the X12 271 response for debugging (optional)
        if (process.env.NODE_ENV === 'development') {
            const fs = require('fs').promises;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const patientName = `${patient.firstName.replace(/\s+/g, '_')}_${patient.lastName.replace(/\s+/g, '_')}`;
            const filename = `test-data/x12_271_${patientName}_${timestamp}.txt`;
            fs.writeFile(filename, x12_271).catch(err =>
                console.log('Could not save X12 271 file:', err.message)
            );
        }

        console.log(`Eligibility check complete: ${eligibilityResult.qualifiesForCM ? 'QUALIFIES' : 'DOES NOT QUALIFY'}`);

        return eligibilityResult;

    } catch (error) {
        console.error('Office Ally eligibility check failed:', error);

        return {
            qualifiesForCM: false,
            enrolled: false,
            error: 'Unable to verify eligibility at this time. Please try again or verify manually.',
            verified: false,
            planType: 'ERROR'
        };
    }
}

module.exports = {
    checkEligibility,
    parseX12_271Enhanced,
    generateOfficeAllyX12_270,
    OFFICE_ALLY_CONFIG
};
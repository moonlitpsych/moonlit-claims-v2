/**
 * Office Ally REALTIME API Client
 * Handles real-time transactions: 276/277 (claim status), 270/271 (eligibility)
 * Average turnaround: ~4 seconds
 */

import { logger } from '@/utils/logger';

export interface RealtimeConfig {
  endpoint: string;
  username: string;
  password: string;
  senderId: string;
  receiverId: string;
}

export interface ClaimStatusRequest {
  claimId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDateOfBirth: string; // YYYY-MM-DD
  subscriberMemberId: string;
  providerNPI: string;
  payerId: string;
  dateOfService: string; // YYYY-MM-DD
  claimAmount: string;
}

export interface ClaimStatusResponse {
  success: boolean;
  claimStatus?: string;
  statusCode?: string;
  statusDescription?: string;
  payerClaimNumber?: string;
  serviceDate?: string;
  raw277?: string;
  error?: string;
}

export interface EligibilityInquiryRequest {
  patientFirstName: string;
  patientLastName: string;
  patientDateOfBirth: string; // YYYY-MM-DD
  subscriberMemberId: string;
  providerNPI: string;
  payerId: string;
  serviceDate?: string; // YYYY-MM-DD (optional, defaults to today)
  patientGender?: 'M' | 'F' | 'U'; // Optional gender
}

export interface EligibilityInquiryResponse {
  success: boolean;
  coverageStatus?: 'active' | 'inactive' | 'unknown';
  copayAmount?: number;
  deductibleInfo?: {
    individual?: number;
    family?: number;
    remaining?: number;
  };
  benefitsData?: {
    mentalHealth?: {
      active: boolean;
      copay?: number;
      coinsurance?: number;
      limitations?: string;
    };
  };
  raw271?: string;
  error?: string;
}

class OfficeAllyRealtimeClient {
  private config: RealtimeConfig;

  constructor() {
    this.config = {
      endpoint: process.env.OFFICE_ALLY_ENDPOINT || '',
      username: process.env.OFFICE_ALLY_USERNAME || '',
      password: process.env.OFFICE_ALLY_PASSWORD || '',
      senderId: process.env.OFFICE_ALLY_SENDER_ID || '',
      receiverId: process.env.OFFICE_ALLY_RECEIVER_ID || 'OFFALLY',
    };

    if (!this.config.endpoint || !this.config.username || !this.config.password) {
      throw new Error('Office Ally REALTIME credentials not configured');
    }
  }

  /**
   * Submit 276 Claim Status Inquiry and receive 277 response
   * Real-time transaction with ~4 second turnaround
   */
  async checkClaimStatus(request: ClaimStatusRequest): Promise<ClaimStatusResponse> {
    try {
      logger.info('Submitting 276 claim status inquiry', {
        claimId: request.claimId,
        providerNPI: request.providerNPI,
      });

      // Generate X12 276 content
      const x12_276 = this.generateX12_276(request);

      // Submit to Office Ally REALTIME endpoint
      const response = await this.submitRealtime(x12_276);

      // Parse X12 277 response
      const parsedResponse = this.parseX12_277(response);

      logger.info('277 claim status response received', {
        claimId: request.claimId,
        status: parsedResponse.claimStatus,
      });

      return {
        success: true,
        ...parsedResponse,
      };
    } catch (error) {
      logger.error('Claim status inquiry failed', {
        claimId: request.claimId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claim status inquiry failed',
      };
    }
  }

  /**
   * Submit 270 Eligibility Inquiry and receive 271 response
   * Real-time transaction with ~4 second turnaround
   */
  async checkEligibility(request: EligibilityInquiryRequest): Promise<EligibilityInquiryResponse> {
    try {
      logger.info('Submitting 270 eligibility inquiry', {
        patientName: `${request.patientFirstName} ${request.patientLastName}`,
        providerNPI: request.providerNPI,
        payerId: request.payerId,
      });

      // Generate X12 270 content
      const x12_270 = this.generateX12_270(request);

      // Submit to Office Ally REALTIME endpoint
      const response = await this.submitRealtime(x12_270);

      // Parse X12 271 response
      const parsedResponse = this.parseX12_271(response);

      logger.info('271 eligibility response received', {
        coverageStatus: parsedResponse.coverageStatus,
        copayAmount: parsedResponse.copayAmount,
      });

      return {
        success: true,
        ...parsedResponse,
      };
    } catch (error) {
      logger.error('Eligibility inquiry failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Eligibility inquiry failed',
      };
    }
  }

  /**
   * Generate X12 270 Eligibility Inquiry
   * Format matches working medicaid-eligibility-checker implementation
   */
  private generateX12_270(request: EligibilityInquiryRequest): string {
    // Control number
    const controlNumber = Date.now().toString().slice(-9);

    const now = new Date();

    // Use local date/time to avoid timezone issues
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const dateStr = `${String(year).slice(2)}${month}${day}`; // YYMMDD
    const timeStr = `${hours}${minutes}`; // HHMM
    const fullDateStr = `${year}${month}${day}`; // YYYYMMDD

    // Format patient DOB
    const formattedDOB = request.patientDateOfBirth.replace(/-/g, '');

    // Use provider name from env or default
    const providerName = process.env.OFFICE_ALLY_PROVIDER_NAME || 'MOONLIT_PLLC';

    // Map payer IDs to payer names (for NM1*PR segment)
    const payerNameMap: Record<string, string> = {
      'UTMCD': 'MEDICAID UTAH',
      'SKUT0': 'MEDICAID UTAH',
      'UNIV-UTHP': 'UNIVERSITY OF UTAH HEALTH PLANS',
      'SLHUT': 'SELECT HEALTH',
      'MOLIN': 'MOLINA HEALTHCARE',
      '60054': 'AETNA HEALTHCARE',
    };

    const payerName = payerNameMap[request.payerId] || request.payerId;

    // Gender is required for some payers (like UUHP), optional for others
    const gender = request.patientGender || 'M';

    // Some payers (like UUHP) require member ID in NM1 segment
    // Format: NM1*IL*1*LAST*FIRST****MI*MEMBERID
    const hasMemberId = request.subscriberMemberId && request.subscriberMemberId.length > 0;
    const nm1Segment = hasMemberId
      ? `NM1*IL*1*${request.patientLastName.toUpperCase()}*${request.patientFirstName.toUpperCase()}****MI*${request.subscriberMemberId}`
      : `NM1*IL*1*${request.patientLastName.toUpperCase()}*${request.patientFirstName.toUpperCase()}`;

    // Build X12 270 in single line format (matching working implementation)
    return `ISA*00*          *00*          *ZZ*${this.config.senderId.padEnd(15)}*01*${this.config.receiverId.padEnd(15)}*${dateStr}*${timeStr}*^*00501*${controlNumber}*0*P*:~GS*HS*${this.config.senderId}*${this.config.receiverId}*${fullDateStr}*${timeStr}*${controlNumber}*X*005010X279A1~ST*270*0001*005010X279A1~BHT*0022*13*MOONLIT-${controlNumber}*${fullDateStr}*${timeStr}~HL*1**20*1~NM1*PR*2*${payerName}*****PI*${request.payerId}~HL*2*1*21*1~NM1*1P*2*${providerName}*****XX*${request.providerNPI}~HL*3*2*22*0~TRN*1*${controlNumber}*${request.providerNPI}*ELIGIBILITY~${nm1Segment}~DMG*D8*${formattedDOB}*${gender}~DTP*291*D8*${fullDateStr}~EQ*30~SE*13*0001~GE*1*${controlNumber}~IEA*1*${controlNumber}~`;
  }

  /**
   * Parse X12 271 Eligibility Response
   */
  private parseX12_271(x12Content: string): Omit<EligibilityInquiryResponse, 'success'> {
    logger.info('Parsing X12 271 response', {
      contentLength: x12Content.length,
    });

    const lines = x12Content.split(/[~\n]/);

    let coverageStatus: 'active' | 'inactive' | 'unknown' = 'unknown';
    let copayAmount: number | undefined;
    const deductibleInfo: { individual?: number; family?: number; remaining?: number } = {};
    const benefitsData: {
      mentalHealth?: {
        active: boolean;
        copay?: number;
        coinsurance?: number;
        limitations?: string;
      };
    } = {};

    for (const line of lines) {
      // EB - Eligibility or Benefit Information
      // Example: EB*1*IND**30~  (Active Coverage)
      // Example: EB*C*IND**30~  (Copayment)
      // Example: EB*G*IND**30*****29*50~  (Deductible - $50)
      if (line.startsWith('EB*')) {
        const parts = line.split('*');

        // parts[1] = Eligibility or Benefit Code
        const benefitCode = parts[1];

        // parts[3] = Service Type Code (30 = Health Benefit Plan Coverage, etc.)
        const serviceType = parts[3];

        // Check for active coverage (EB*1 = Active Coverage)
        if (benefitCode === '1') {
          coverageStatus = 'active';

          // If this is specifically for mental health services
          if (serviceType === 'MH' || line.includes('MENTAL HEALTH')) {
            if (!benefitsData.mentalHealth) {
              benefitsData.mentalHealth = { active: true };
            }
          }
        }

        // Check for inactive coverage
        if (benefitCode === '6' || benefitCode === '7') {
          coverageStatus = 'inactive';
        }

        // Copayment information (EB*B or EB*C)
        if (benefitCode === 'B' || benefitCode === 'C') {
          // parts[9] usually contains the amount
          const amount = parts[9];
          if (amount && !isNaN(parseFloat(amount))) {
            const copay = parseFloat(amount);

            // Set general copay amount
            if (!copayAmount || copay > 0) {
              copayAmount = copay;
            }

            // Set mental health copay if service type indicates mental health
            if (serviceType === 'MH' || serviceType === '30') {
              if (!benefitsData.mentalHealth) {
                benefitsData.mentalHealth = { active: true };
              }
              benefitsData.mentalHealth.copay = copay;
            }
          }
        }

        // Deductible information (EB*G)
        if (benefitCode === 'G') {
          const amount = parts[9];
          if (amount && !isNaN(parseFloat(amount))) {
            const deductible = parseFloat(amount);

            // parts[7] might indicate individual vs family
            const coverageLevel = parts[7];
            if (coverageLevel === 'IND') {
              deductibleInfo.individual = deductible;
            } else if (coverageLevel === 'FAM') {
              deductibleInfo.family = deductible;
            } else {
              deductibleInfo.individual = deductible; // Default to individual
            }
          }
        }

        // Coinsurance (EB*A)
        if (benefitCode === 'A') {
          const percentage = parts[8];
          if (percentage && !isNaN(parseFloat(percentage))) {
            if (!benefitsData.mentalHealth) {
              benefitsData.mentalHealth = { active: coverageStatus === 'active' };
            }
            benefitsData.mentalHealth.coinsurance = parseFloat(percentage);
          }
        }
      }

      // MSG - Message Text (may contain limitations or additional info)
      if (line.startsWith('MSG*')) {
        const message = line.substring(4).trim();
        if (message && benefitsData.mentalHealth) {
          benefitsData.mentalHealth.limitations = message;
        }
      }
    }

    // Smart coverage status inference:
    // If we got detailed benefit information (deductibles, copays, etc.) but no explicit EB*1,
    // the coverage is likely active. Only mark as unknown if we truly got no useful data.
    if (coverageStatus === 'unknown') {
      const hasBenefitData =
        Object.keys(deductibleInfo).length > 0 ||
        copayAmount !== undefined ||
        Object.keys(benefitsData).length > 0;

      if (hasBenefitData) {
        coverageStatus = 'active';
      }
    }

    return {
      coverageStatus,
      copayAmount,
      deductibleInfo: Object.keys(deductibleInfo).length > 0 ? deductibleInfo : undefined,
      benefitsData: Object.keys(benefitsData).length > 0 ? benefitsData : undefined,
      raw271: x12Content,
    };
  }

  /**
   * Generate X12 276 Claim Status Inquiry
   */
  private generateX12_276(request: ClaimStatusRequest): string {
    const segments: string[] = [];

    // Control numbers
    const interchangeControlNumber = this.generateControlNumber();
    const groupControlNumber = this.generateControlNumber();
    const transactionControlNumber = this.generateControlNumber();

    const now = new Date();
    const date = this.formatDate(now, 'YYMMDD');
    const time = this.formatTime(now);

    // ISA - Interchange Control Header
    segments.push(
      `ISA*00*          *00*          *30*${this.padRight(this.config.senderId, 15)}*30*${this.padRight(
        this.config.receiverId,
        15
      )}*${date}*${time}*^*00501*${interchangeControlNumber}*0*P*:~`
    );

    // GS - Functional Group Header
    segments.push(
      `GS*HS*${this.config.senderId}*${this.config.receiverId}*${this.formatDate(
        now,
        'YYYYMMDD'
      )}*${this.formatTime(now, 'HHMM')}*${groupControlNumber}*X*005010X212~`
    );

    // ST - Transaction Set Header (276)
    segments.push(`ST*276*${transactionControlNumber}*005010X212~`);

    // BHT - Beginning of Hierarchical Transaction
    segments.push(
      `BHT*0010*13*${transactionControlNumber}*${this.formatDate(now, 'YYYYMMDD')}*${this.formatTime(
        now,
        'HHMM'
      )}~`
    );

    // 2000A - Information Source (Payer) Level
    segments.push(`HL*1**20*1~`);

    // 2100A - Payer Name
    segments.push(`NM1*PR*2*${request.payerId}*****PI*${request.payerId}~`);

    // 2000B - Information Receiver (Provider) Level
    segments.push(`HL*2*1*21*1~`);

    // 2100B - Information Receiver Name (Provider)
    segments.push(`NM1*1P*2*MOONLIT PLLC*****XX*${request.providerNPI}~`);

    // 2000C - Service Provider Level
    segments.push(`HL*3*2*19*1~`);

    // 2100C - Service Provider Name
    segments.push(`NM1*1P*2*MOONLIT PLLC*****XX*${request.providerNPI}~`);

    // 2000D - Subscriber Level
    segments.push(`HL*4*3*22*0~`);

    // 2100D - Subscriber Name
    segments.push(
      `NM1*IL*1*${request.patientLastName}*${request.patientFirstName}***MI*${request.subscriberMemberId}~`
    );

    // 2200D - Claim Status Tracking Number
    segments.push(`TRN*1*${request.claimId}*${this.config.senderId}~`);

    // 2300D - Claim Information
    segments.push(
      `REF*D9*${request.claimId}~` // Claim reference number
    );
    segments.push(
      `DTP*472*D8*${this.formatDate(new Date(request.dateOfService), 'YYYYMMDD')}~`
    );
    segments.push(`AMT*T3*${request.claimAmount}~`); // Total claim amount

    // SE - Transaction Set Trailer
    const segmentCount = segments.length + 1;
    segments.push(`SE*${segmentCount}*${transactionControlNumber}~`);

    // GE - Functional Group Trailer
    segments.push(`GE*1*${groupControlNumber}~`);

    // IEA - Interchange Control Trailer
    segments.push(`IEA*1*${interchangeControlNumber}~`);

    return segments.join('');
  }

  /**
   * Submit X12 content to Office Ally REALTIME endpoint
   * Using SOAP/XML wrapper around X12 content
   */
  private async submitRealtime(x12Content: string): Promise<string> {
    // Generate unique payload ID and timestamp
    const payloadID = this.generateUUID();
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    // Office Ally REALTIME uses CAQH CORE-compliant SOAP envelope
    const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope">
<soapenv:Header>
<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
<wsse:UsernameToken>
<wsse:Username>${this.config.username}</wsse:Username>
<wsse:Password>${this.config.password}</wsse:Password>
</wsse:UsernameToken>
</wsse:Security>
</soapenv:Header>
<soapenv:Body>
<ns1:COREEnvelopeRealTimeRequest xmlns:ns1="http://www.caqh.org/SOAP/WSDL/CORERule2.2.0.xsd">
<PayloadType>X12_270_Request_005010X279A1</PayloadType>
<ProcessingMode>RealTime</ProcessingMode>
<PayloadID>${payloadID}</PayloadID>
<TimeStamp>${timestamp}</TimeStamp>
<SenderID>${this.config.senderId}</SenderID>
<ReceiverID>${this.config.receiverId}</ReceiverID>
<CORERuleVersion>2.2.0</CORERuleVersion>
<Payload>
<![CDATA[${x12Content}]]>
</Payload>
</ns1:COREEnvelopeRealTimeRequest>
</soapenv:Body>
</soapenv:Envelope>`;

    logger.info('Submitting REALTIME request to Office Ally', {
      endpoint: this.config.endpoint,
      payloadLength: x12Content.length,
      payloadID,
    });

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8;action=RealTimeTransaction;',
        'Action': 'RealTimeTransaction',
      },
      body: soapEnvelope,
    });

    if (!response.ok) {
      throw new Error(`REALTIME API error: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();

    // Extract X12 271 content from CAQH CORE SOAP response
    const x12Match = responseText.match(/<Payload[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/Payload>/s) ||
                     responseText.match(/<Payload[^>]*>(.*?)<\/Payload>/s) ||
                     responseText.match(/<ns1:Payload[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/ns1:Payload>/s) ||
                     responseText.match(/<ns1:Payload[^>]*>(.*?)<\/ns1:Payload>/s);

    if (!x12Match) {
      logger.error('Could not extract X12 from SOAP response', {
        responsePreview: responseText.substring(0, 500),
      });
      throw new Error('Could not extract X12 271 from SOAP response');
    }

    return x12Match[1].trim();
  }

  /**
   * Parse X12 277 Claim Status Response
   */
  private parseX12_277(x12Content: string): Omit<ClaimStatusResponse, 'success'> {
    logger.info('Parsing X12 277 response', {
      contentLength: x12Content.length,
    });

    const lines = x12Content.split(/[~\n]/);

    let claimStatus = 'Unknown';
    let statusCode = '';
    let statusDescription = '';
    let payerClaimNumber = '';
    let serviceDate = '';

    for (const line of lines) {
      // STC - Status Information
      // Example: STC*A1:20*20241015~
      if (line.startsWith('STC*')) {
        const parts = line.split('*');
        if (parts.length >= 2) {
          const statusInfo = parts[1].split(':');
          statusCode = statusInfo[0] || '';

          // Map status codes to descriptions
          const statusMap: Record<string, string> = {
            'A1': 'Acknowledgement/Forwarded',
            'A2': 'Acknowledgement/Receipt',
            'A3': 'Rejected',
            'A4': 'Not Found',
            'A5': 'Split Claim',
            'A6': 'Pending',
            'A7': 'Processed',
            'A8': 'Reversed',
            'P1': 'Processed - Primary Payment',
            'P2': 'Processed - Secondary Payment',
            'P3': 'Processed - Tertiary Payment',
            'P4': 'Denied',
            'P5': 'Pended',
          };

          claimStatus = statusMap[statusCode] || 'Unknown Status';
          statusDescription = parts[2] || '';
        }
      }

      // REF*1K - Payer Claim Number
      if (line.startsWith('REF*1K*')) {
        payerClaimNumber = line.split('*')[2] || '';
      }

      // REF*D9 - Claim Identifier
      if (line.startsWith('REF*D9*')) {
        // Original claim identifier
      }

      // DTP*472 - Service Date
      if (line.startsWith('DTP*472*')) {
        const parts = line.split('*');
        if (parts.length >= 4) {
          const rawDate = parts[3];
          // Format: YYYYMMDD -> YYYY-MM-DD
          if (rawDate.length === 8) {
            serviceDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
          }
        }
      }
    }

    return {
      claimStatus,
      statusCode,
      statusDescription,
      payerClaimNumber,
      serviceDate,
      raw277: x12Content,
    };
  }

  /**
   * Helper functions
   */

  private generateControlNumber(): string {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private padRight(str: string, length: number): string {
    return (str + ' '.repeat(length)).substring(0, length);
  }

  private formatDate(date: Date, format: 'YYMMDD' | 'YYYYMMDD'): string {
    const year =
      format === 'YYMMDD' ? date.getFullYear().toString().slice(-2) : date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private formatTime(date: Date, format: 'HHMM' | 'HHMMss' = 'HHMMss'): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    if (format === 'HHMM') {
      return `${hours}${minutes}`;
    }
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}${minutes}${seconds}`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private unescapeXml(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}

// Export singleton instance
export const officeAllyRealtime = new OfficeAllyRealtimeClient();

/**
 * Office Ally API Client
 * Handles SFTP uploads and REALTIME API calls
 *
 * IMPORTANT: This module uses native Node.js bindings and can ONLY run on the server.
 * Never import this directly in client-side code or Next.js pages.
 * Use API routes to call these functions.
 *
 * SFTP: For EDI file submission (X12 837P)
 * REALTIME API: For eligibility verification (X12 270/271)
 */

// @ts-ignore - Dynamic import to avoid bundling in client
const Client = require('ssh2-sftp-client');

import axios from 'axios';
import { logger } from '@/utils/logger';
import type { APIResponse, EligibilityCheck } from '@/types';
import { readFile } from 'fs/promises';

class OfficeAllyService {
  private sftpConfig: {
    host: string;
    port: number;
    username: string;
    password: string;
  };

  private realtimeConfig: {
    endpoint: string;
    apiKey: string;
    senderId: string;
    providerNPI: string;
  };

  constructor() {
    // SFTP Configuration
    this.sftpConfig = {
      host: process.env.OFFICE_ALLY_SFTP_HOST || '',
      port: parseInt(process.env.OFFICE_ALLY_SFTP_PORT || '22'),
      username: process.env.OFFICE_ALLY_SFTP_USER || '',
      password: process.env.OFFICE_ALLY_SFTP_PASSWORD || '',
    };

    // REALTIME API Configuration
    this.realtimeConfig = {
      endpoint: process.env.OFFICE_ALLY_REALTIME_ENDPOINT || '',
      apiKey: process.env.OFFICE_ALLY_REALTIME_API_KEY || '',
      senderId: process.env.OFFICE_ALLY_SENDER_ID || '',
      providerNPI: process.env.OFFICE_ALLY_PROVIDER_NPI || '',
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.sftpConfig.host || !this.sftpConfig.username) {
      logger.warn('Office Ally SFTP configuration incomplete');
    }

    if (!this.realtimeConfig.endpoint) {
      logger.warn('Office Ally REALTIME configuration incomplete');
    }
  }

  /**
   * Submit EDI file via SFTP
   * File naming convention: [ClientID]_[Timestamp].837
   */
  async submitClaim(
    ediFilePath: string,
    claimId: string
  ): Promise<APIResponse<{ transactionId: string }>> {
    const sftp = new Client();

    try {
      logger.info('Connecting to Office Ally SFTP', { claimId });

      await sftp.connect(this.sftpConfig);

      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const remoteFileName = `MOONLIT_${timestamp}_${claimId}.837`;
      const remotePath = `/outbound/${remoteFileName}`;

      // Read EDI file
      const ediContent = await readFile(ediFilePath, 'utf-8');

      // Upload file
      await sftp.put(Buffer.from(ediContent), remotePath);

      logger.info('Successfully submitted claim to Office Ally', {
        claimId,
        fileName: remoteFileName,
      });

      await sftp.end();

      return {
        success: true,
        data: {
          transactionId: remoteFileName,
        },
      };
    } catch (error) {
      logger.error('Failed to submit claim via SFTP', {
        claimId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await sftp.end();

      return {
        success: false,
        error: {
          message: 'Failed to submit claim via SFTP',
          code: 'SFTP_ERROR',
          retryable: true,
        },
      };
    }
  }

  /**
   * Check patient eligibility via REALTIME API
   * Sends X12 270 request, receives X12 271 response
   */
  async checkEligibility(params: {
    payerId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    serviceDate: string;
  }): Promise<APIResponse<Partial<EligibilityCheck>>> {
    try {
      logger.info('Checking eligibility via Office Ally REALTIME', {
        payerId: params.payerId,
        // Don't log PHI
      });

      // Generate X12 270 request
      const x12Request = this.generateX12_270(params);

      // Call REALTIME API
      const response = await axios.post(
        this.realtimeConfig.endpoint,
        {
          request: x12Request,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.realtimeConfig.apiKey}`,
          },
          timeout: 30000,
        }
      );

      // Parse X12 271 response
      const eligibilityData = this.parseX12_271(response.data.response);

      logger.info('Eligibility check completed', {
        coverageStatus: eligibilityData.coverageStatus,
      });

      return {
        success: true,
        data: eligibilityData,
      };
    } catch (error) {
      logger.error('Eligibility check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          message: 'Failed to check eligibility',
          code: 'REALTIME_ERROR',
          retryable: true,
        },
      };
    }
  }

  /**
   * Generate X12 270 eligibility inquiry
   */
  private generateX12_270(params: {
    payerId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    serviceDate: string;
  }): string {
    // This is a simplified example. Real X12 270 generation requires
    // proper segment formatting and control numbers.

    const dob = params.dateOfBirth.replace(/-/g, '');
    const serviceDate = params.serviceDate.replace(/-/g, '');

    return `ISA*00*          *00*          *ZZ*${this.realtimeConfig.senderId.padEnd(15)}*ZZ*${params.payerId.padEnd(15)}*${new Date().toISOString().split('T')[0].replace(/-/g, '')}*${new Date().toTimeString().slice(0, 4)}*^*00501*000000001*0*P*:~
GS*HS*${this.realtimeConfig.senderId}*${params.payerId}*${new Date().toISOString().split('T')[0].replace(/-/g, '')}*${new Date().toTimeString().slice(0, 4)}*1*X*005010X279A1~
ST*270*0001*005010X279A1~
BHT*0022*13*${Date.now()}*${new Date().toISOString().split('T')[0].replace(/-/g, '')}*${new Date().toTimeString().slice(0, 4)}~
HL*1**20*1~
NM1*PR*2*${params.payerId}*****PI*${params.payerId}~
HL*2*1*21*1~
NM1*1P*1*****XX*${this.realtimeConfig.providerNPI}~
HL*3*2*22*0~
TRN*1*${Date.now()}~
NM1*IL*1*${params.lastName}*${params.firstName}****MI*${params.memberId}~
DMG*D8*${dob}~
DTP*291*D8*${serviceDate}~
EQ*30~
SE*14*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  /**
   * Parse X12 271 eligibility response
   */
  private parseX12_271(x12Data: string): Partial<EligibilityCheck> {
    // This is a simplified parser. Real X12 271 parsing requires
    // proper segment parsing and loop handling.

    const coverageActive = x12Data.includes('EB*1') || x12Data.includes('*1*IND');

    return {
      coverageStatus: coverageActive ? 'active' : 'inactive',
      benefitsData: {
        mentalHealth: {
          active: coverageActive,
        },
      },
      officeAllyResponse: {
        rawX12: x12Data,
      },
    };
  }

  /**
   * Download acknowledgment files (997, 999)
   */
  async downloadAcknowledgments(): Promise<APIResponse<string[]>> {
    const sftp = new Client();

    try {
      await sftp.connect(this.sftpConfig);

      const files = await sftp.list('/inbound');
      const ackFiles = files.filter(
        (file: any) => file.name.endsWith('.997') || file.name.endsWith('.999')
      );

      logger.info('Downloaded acknowledgment files', {
        count: ackFiles.length,
      });

      await sftp.end();

      return {
        success: true,
        data: ackFiles.map((f: any) => f.name),
      };
    } catch (error) {
      logger.error('Failed to download acknowledgments', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await sftp.end();

      return {
        success: false,
        error: {
          message: 'Failed to download acknowledgments',
          code: 'SFTP_ERROR',
          retryable: true,
        },
      };
    }
  }

  /**
   * Test SFTP connection
   */
  async testSFTPConnection(): Promise<boolean> {
    const sftp = new Client();

    try {
      await sftp.connect(this.sftpConfig);
      await sftp.list('/');
      await sftp.end();

      logger.info('Office Ally SFTP connection test successful');
      return true;
    } catch (error) {
      logger.error('Office Ally SFTP connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await sftp.end();
      return false;
    }
  }
}

// Export singleton instance
export const officeAllyService = new OfficeAllyService();

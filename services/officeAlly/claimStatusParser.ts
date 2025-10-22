/**
 * X12 277 Claim Status Response Parser
 * Parses 277 files downloaded from Office Ally SFTP /outbound directory
 */

import { logger } from '@/utils/logger';

export interface ClaimStatusResult {
  success: boolean;
  claimIdentifier?: string; // Our claim ID from TRN or REF segments
  claimStatus?: string;
  statusCode?: string;
  statusDescription?: string;
  payerClaimNumber?: string;
  patientControlNumber?: string;
  serviceDate?: string;
  rawContent?: string;
  error?: string;
}

/**
 * Parse X12 277 Claim Status Response
 * Office Ally delivers these via SFTP to /outbound directory
 */
export function parseX12_277(x12Content: string): ClaimStatusResult[] {
  logger.info('Parsing X12 277 claim status response', {
    contentLength: x12Content.length,
  });

  const results: ClaimStatusResult[] = [];
  const lines = x12Content.split(/[~\n]/);

  // Track current claim being processed
  let currentClaim: Partial<ClaimStatusResult> = {};
  let inClaimLoop = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // HL - Hierarchical Level (marks new claim)
    // HL*4*3*22*0~ indicates patient level (claim level)
    if (trimmed.startsWith('HL*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 4 && parts[3] === '22') {
        // Save previous claim if exists
        if (currentClaim.claimIdentifier) {
          results.push({
            success: true,
            rawContent: x12Content,
            ...currentClaim,
          } as ClaimStatusResult);
        }
        // Start new claim
        currentClaim = {};
        inClaimLoop = true;
      }
    }

    // TRN - Claim Status Tracking Number
    // TRN*2*ClaimID*ProviderID~ (our original claim reference)
    if (trimmed.startsWith('TRN*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        currentClaim.claimIdentifier = parts[2];
      }
    }

    // REF*D9 - Patient Control Number (alternative claim identifier)
    if (trimmed.startsWith('REF*D9*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        currentClaim.patientControlNumber = parts[2];
        // Use this as identifier if TRN not found
        if (!currentClaim.claimIdentifier) {
          currentClaim.claimIdentifier = parts[2];
        }
      }
    }

    // REF*1K - Payer Claim Control Number
    if (trimmed.startsWith('REF*1K*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 3) {
        currentClaim.payerClaimNumber = parts[2];
      }
    }

    // STC - Status Information (THE KEY SEGMENT!)
    // Example: STC*A1:20*20241015~
    // Example: STC*A7:42*20250502~
    if (trimmed.startsWith('STC*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 2) {
        const statusInfo = parts[1].split(':');
        const statusCode = statusInfo[0] || '';
        const entityCode = statusInfo[1] || ''; // 20=Claim, 42=Service line

        // Map status codes to descriptions
        const statusMap: Record<string, string> = {
          // Level 1 - Acknowledgement
          'A0': 'Acknowledgement/Forwarded',
          'A1': 'Acknowledgement/Forwarded - Not on file',
          'A2': 'Acknowledgement/Receipt',
          'A3': 'Acknowledgement - Rejected',
          'A4': 'Acknowledgement - Not Found',
          'A5': 'Acknowledgement - Split Claim',
          'A6': 'Acknowledgement - Pending',
          'A7': 'Acknowledgement - Processed',
          'A8': 'Acknowledgement - Reversed',

          // Level 2 - Pended
          'P1': 'Processed - Primary Payment',
          'P2': 'Processed - Secondary Payment',
          'P3': 'Processed - Tertiary Payment',
          'P4': 'Processed - Denied',
          'P5': 'Pended',

          // Level 3 - Finalized
          'F1': 'Finalized - Payment',
          'F2': 'Finalized - Forwarded to entity',
          'F3': 'Finalized - No payment',
          'F4': 'Finalized - Forwarded to entity with payment',
        };

        const claimStatus = statusMap[statusCode] || `Status ${statusCode}`;
        const statusDescription = parts[2] || '';

        // Store status info
        currentClaim.statusCode = statusCode;
        currentClaim.claimStatus = claimStatus;
        if (statusDescription) {
          currentClaim.statusDescription = statusDescription;
        }

        logger.info('Found claim status', {
          statusCode,
          claimStatus,
          entityCode,
          claimIdentifier: currentClaim.claimIdentifier,
        });
      }
    }

    // DTP*472 - Service Date
    if (trimmed.startsWith('DTP*472*')) {
      const parts = trimmed.split('*');
      if (parts.length >= 4) {
        const rawDate = parts[3];
        // Format: YYYYMMDD -> YYYY-MM-DD
        if (rawDate.length === 8) {
          currentClaim.serviceDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
        } else if (rawDate.includes('-')) {
          currentClaim.serviceDate = rawDate; // Already formatted
        }
      }
    }
  }

  // Save last claim if exists
  if (currentClaim.claimIdentifier) {
    results.push({
      success: true,
      rawContent: x12Content,
      ...currentClaim,
    } as ClaimStatusResult);
  }

  logger.info('Parsed 277 response', {
    claimsFound: results.length,
  });

  return results;
}

/**
 * Map 277 status codes to our internal claim status
 */
export function mapStatusToClaimStatus(statusCode?: string): string {
  if (!statusCode) return 'unknown';

  const code = statusCode.toUpperCase();

  // Acknowledgement codes
  if (code === 'A0' || code === 'A1' || code === 'A2') return 'submitted';
  if (code === 'A3' || code === 'P4') return 'rejected';
  if (code === 'A4') return 'not_found';
  if (code === 'A6' || code === 'P5') return 'pending';
  if (code === 'A7' || code.startsWith('P1') || code.startsWith('P2') || code.startsWith('P3'))
    return 'accepted';
  if (code === 'A8') return 'reversed';

  // Finalized codes
  if (code === 'F1' || code === 'F4') return 'paid';
  if (code === 'F2' || code === 'F3') return 'processed';

  return 'unknown';
}

/**
 * Parse multiple 277 files and aggregate results
 */
export function parseMultiple277Files(files: Array<{ fileName: string; content: string }>): ClaimStatusResult[] {
  const allResults: ClaimStatusResult[] = [];

  for (const file of files) {
    try {
      const results = parseX12_277(file.content);
      allResults.push(...results);

      logger.info('Parsed 277 file', {
        fileName: file.fileName,
        claimsFound: results.length,
      });
    } catch (error) {
      logger.error('Failed to parse 277 file', {
        fileName: file.fileName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return allResults;
}

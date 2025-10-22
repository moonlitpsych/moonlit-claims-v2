/**
 * X12 997/999 Functional Acknowledgment Parser
 * Parses EDI acknowledgments from Office Ally confirming receipt of 837P claims
 */

import { logger } from '@/utils/logger';

export interface AcknowledgmentResult {
  success: boolean;
  acknowledgmentType: '997' | '999';
  accepted: boolean;
  interchangeControlNumber?: string;
  groupControlNumber?: string;
  transactionControlNumber?: string;
  functionalGroupAcknowledgmentCode?: string; // A=Accepted, E=Accepted with errors, R=Rejected
  transactionSetAcknowledgmentCode?: string; // A=Accepted, E=Accepted with errors, R=Rejected
  errors?: AcknowledgmentError[];
  rawContent?: string;
}

export interface AcknowledgmentError {
  segmentId: string;
  elementPosition?: string;
  errorCode: string;
  errorDescription: string;
}

/**
 * Parse X12 997 Functional Acknowledgment
 * 997 is sent by Office Ally to confirm they received our 837P claim
 */
export function parseX12_997(x12Content: string): AcknowledgmentResult {
  logger.info('Parsing X12 997 acknowledgment', {
    contentLength: x12Content.length,
  });

  const lines = x12Content.split(/[~\n]/);

  let interchangeControlNumber = '';
  let groupControlNumber = '';
  let transactionControlNumber = '';
  let functionalGroupAckCode = '';
  let transactionSetAckCode = '';
  const errors: AcknowledgmentError[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // ISA segment - extract interchange control number
    if (trimmedLine.startsWith('ISA*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 14) {
        interchangeControlNumber = parts[13];
      }
    }

    // GS segment - extract group control number
    if (trimmedLine.startsWith('GS*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 7) {
        groupControlNumber = parts[6];
      }
    }

    // ST segment - extract transaction control number
    if (trimmedLine.startsWith('ST*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 3) {
        transactionControlNumber = parts[2];
      }
    }

    // AK1 - Functional Group Response Header
    // Example: AK1*HC*12345~
    if (trimmedLine.startsWith('AK1*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 3) {
        groupControlNumber = parts[2];
      }
    }

    // AK9 - Functional Group Response Trailer
    // Example: AK9*A*1*1*1~
    // Format: AK9*FunctionalGroupAcknowledgeCode*NumberOfTransactionSetsIncluded*NumberOfReceivedTransactionSets*NumberOfAcceptedTransactionSets~
    if (trimmedLine.startsWith('AK9*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        functionalGroupAckCode = parts[1];
        // A = Accepted
        // E = Accepted but errors were noted
        // R = Rejected
      }
    }

    // AK2 - Transaction Set Response Header
    // Example: AK2*837*0001~
    if (trimmedLine.startsWith('AK2*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 3) {
        transactionControlNumber = parts[2];
      }
    }

    // AK5 - Transaction Set Response Trailer
    // Example: AK5*A~
    if (trimmedLine.startsWith('AK5*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        transactionSetAckCode = parts[1];
        // A = Accepted
        // E = Accepted but errors were noted
        // R = Rejected
      }
    }

    // AK3 - Data Segment Note (Error details)
    // Example: AK3*CLM*5~
    if (trimmedLine.startsWith('AK3*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        const segmentId = parts[1];
        errors.push({
          segmentId,
          errorCode: 'SEGMENT_ERROR',
          errorDescription: `Error in segment: ${segmentId}`,
        });
      }
    }

    // AK4 - Data Element Note (Specific element error)
    // Example: AK4*3*782*8~
    if (trimmedLine.startsWith('AK4*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 4) {
        const elementPosition = parts[1];
        const errorCode = parts[3];

        const errorDescriptionMap: Record<string, string> = {
          '1': 'Mandatory data element missing',
          '2': 'Conditional required data element missing',
          '3': 'Too many data elements',
          '4': 'Data element too short',
          '5': 'Data element too long',
          '6': 'Invalid character in data element',
          '7': 'Invalid code value',
          '8': 'Invalid date',
          '9': 'Invalid time',
          '10': 'Exclusion condition violated',
        };

        const lastError = errors[errors.length - 1];
        if (lastError) {
          lastError.elementPosition = elementPosition;
          lastError.errorCode = errorCode;
          lastError.errorDescription =
            errorDescriptionMap[errorCode] || `Error code: ${errorCode}`;
        }
      }
    }
  }

  // Determine if accepted
  const accepted =
    functionalGroupAckCode === 'A' &&
    (transactionSetAckCode === 'A' || transactionSetAckCode === '');

  logger.info('997 acknowledgment parsed', {
    accepted,
    functionalGroupAckCode,
    transactionSetAckCode,
    errorCount: errors.length,
  });

  return {
    success: true,
    acknowledgmentType: '997',
    accepted,
    interchangeControlNumber,
    groupControlNumber,
    transactionControlNumber,
    functionalGroupAcknowledgmentCode: functionalGroupAckCode,
    transactionSetAcknowledgmentCode: transactionSetAckCode,
    errors: errors.length > 0 ? errors : undefined,
    rawContent: x12Content,
  };
}

/**
 * Parse X12 999 Implementation Acknowledgment
 * 999 is similar to 997 but includes more detailed error information
 */
export function parseX12_999(x12Content: string): AcknowledgmentResult {
  logger.info('Parsing X12 999 acknowledgment', {
    contentLength: x12Content.length,
  });

  const lines = x12Content.split(/[~\n]/);

  let interchangeControlNumber = '';
  let groupControlNumber = '';
  let transactionControlNumber = '';
  let functionalGroupAckCode = '';
  let implementationAckCode = '';
  const errors: AcknowledgmentError[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // ISA segment
    if (trimmedLine.startsWith('ISA*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 14) {
        interchangeControlNumber = parts[13];
      }
    }

    // GS segment
    if (trimmedLine.startsWith('GS*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 7) {
        groupControlNumber = parts[6];
      }
    }

    // ST segment
    if (trimmedLine.startsWith('ST*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 3) {
        transactionControlNumber = parts[2];
      }
    }

    // AK1 - Functional Group Response Header
    if (trimmedLine.startsWith('AK1*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 3) {
        groupControlNumber = parts[2];
      }
    }

    // AK9 - Functional Group Response Trailer
    if (trimmedLine.startsWith('AK9*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        functionalGroupAckCode = parts[1];
      }
    }

    // IK5 - Implementation Transaction Set Response Trailer (999-specific)
    // Example: IK5*A~
    if (trimmedLine.startsWith('IK5*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        implementationAckCode = parts[1];
        // A = Accepted
        // E = Accepted but errors were noted
        // R = Rejected
      }
    }

    // IK3 - Implementation Data Segment Note (999-specific)
    if (trimmedLine.startsWith('IK3*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 2) {
        const segmentId = parts[1];
        errors.push({
          segmentId,
          errorCode: 'SEGMENT_ERROR',
          errorDescription: `Error in segment: ${segmentId}`,
        });
      }
    }

    // IK4 - Implementation Data Element Note (999-specific)
    if (trimmedLine.startsWith('IK4*')) {
      const parts = trimmedLine.split('*');
      if (parts.length >= 4) {
        const elementPosition = parts[1];
        const errorCode = parts[3];

        const errorDescriptionMap: Record<string, string> = {
          '1': 'Mandatory data element missing',
          '2': 'Conditional required data element missing',
          '3': 'Too many data elements',
          '4': 'Data element too short',
          '5': 'Data element too long',
          '6': 'Invalid character in data element',
          '7': 'Invalid code value',
          '8': 'Invalid date',
          '9': 'Invalid time',
          '10': 'Exclusion condition violated',
        };

        const lastError = errors[errors.length - 1];
        if (lastError) {
          lastError.elementPosition = elementPosition;
          lastError.errorCode = errorCode;
          lastError.errorDescription =
            errorDescriptionMap[errorCode] || `Error code: ${errorCode}`;
        }
      }
    }
  }

  // Determine if accepted
  const accepted =
    functionalGroupAckCode === 'A' && (implementationAckCode === 'A' || implementationAckCode === '');

  logger.info('999 acknowledgment parsed', {
    accepted,
    functionalGroupAckCode,
    implementationAckCode,
    errorCount: errors.length,
  });

  return {
    success: true,
    acknowledgmentType: '999',
    accepted,
    interchangeControlNumber,
    groupControlNumber,
    transactionControlNumber,
    functionalGroupAcknowledgmentCode: functionalGroupAckCode,
    transactionSetAcknowledgmentCode: implementationAckCode,
    errors: errors.length > 0 ? errors : undefined,
    rawContent: x12Content,
  };
}

/**
 * Auto-detect acknowledgment type and parse accordingly
 */
export function parseAcknowledgment(x12Content: string): AcknowledgmentResult {
  // Check ST segment to determine type
  const stMatch = x12Content.match(/ST\*(\d{3})\*/);

  if (!stMatch) {
    logger.error('Could not determine acknowledgment type - no ST segment found');
    return {
      success: false,
      acknowledgmentType: '997',
      accepted: false,
      errors: [
        {
          segmentId: 'ST',
          errorCode: 'MISSING_ST',
          errorDescription: 'Could not find ST segment',
        },
      ],
    };
  }

  const transactionSetId = stMatch[1];

  if (transactionSetId === '997') {
    return parseX12_997(x12Content);
  } else if (transactionSetId === '999') {
    return parseX12_999(x12Content);
  } else {
    logger.error('Unknown acknowledgment type', { transactionSetId });
    return {
      success: false,
      acknowledgmentType: '997',
      accepted: false,
      errors: [
        {
          segmentId: 'ST',
          errorCode: 'UNKNOWN_TYPE',
          errorDescription: `Unknown transaction set type: ${transactionSetId}`,
        },
      ],
    };
  }
}

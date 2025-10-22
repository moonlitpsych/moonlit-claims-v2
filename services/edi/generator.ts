/**
 * X12 837P EDI Generator
 * Converts CMS-1500 claim data to X12 837P format for Office Ally submission
 *
 * X12 837P Structure:
 * - ISA: Interchange Control Header
 * - GS: Functional Group Header
 * - ST: Transaction Set Header
 * - BHT: Beginning of Hierarchical Transaction
 * - NM1 loops: Name segments (submitter, receiver, billing provider, subscriber, patient)
 * - CLM: Claim Information
 * - HI: Health Care Diagnosis Code
 * - LX: Service Line Number
 * - SV1: Professional Service
 * - SE: Transaction Set Trailer
 * - GE: Functional Group Trailer
 * - IEA: Interchange Control Trailer
 */

import { X12Generator, X12Parser } from 'node-x12';
import { logger } from '@/utils/logger';
import { ValidationError } from '@/types';
import { validateClaim } from './validator';

export interface EDIClaimData {
  // Control Numbers
  interchangeControlNumber?: string;
  groupControlNumber?: string;
  transactionControlNumber?: string;

  // Submitter (Moonlit)
  submitterName: string;
  submitterNPI: string;
  submitterContactName?: string;
  submitterContactPhone?: string;

  // Receiver (Office Ally)
  receiverId: string; // Always "OFFALLY" for Office Ally

  // Payer
  payerId: string; // Office Ally Payer ID for specific insurance company
  payerName: string;

  // Billing Provider (Moonlit Organization)
  billingProviderName: string;
  billingProviderNPI: string;
  billingProviderTaxId?: string;
  billingProviderAddress: string;
  billingProviderCity: string;
  billingProviderState: string;
  billingProviderZip: string;
  billingProviderPhone?: string;

  // Rendering Provider (Individual physician)
  renderingProviderName: string;
  renderingProviderNPI: string;
  renderingProviderFirstName?: string;
  renderingProviderLastName?: string;

  // Subscriber (Insurance Policyholder)
  subscriberFirstName: string;
  subscriberLastName: string;
  subscriberMiddleName?: string;
  subscriberMemberId: string;
  subscriberGroupNumber?: string;
  subscriberDateOfBirth: string; // YYYY-MM-DD
  subscriberGender?: 'M' | 'F' | 'U';
  subscriberAddress?: string;
  subscriberCity?: string;
  subscriberState?: string;
  subscriberZip?: string;

  // Patient
  patientFirstName: string;
  patientLastName: string;
  patientMiddleName?: string;
  patientDateOfBirth: string; // YYYY-MM-DD
  patientGender?: 'M' | 'F' | 'U';
  patientAddress: string;
  patientCity: string;
  patientState: string;
  patientZip: string;
  patientRelationshipToSubscriber: '01' | '18' | '19' | 'G8'; // 01=Spouse, 18=Self, 19=Child, G8=Other

  // Claim Information
  claimFilingIndicatorCode?: string; // e.g., 'CI' for commercial insurance
  claimAmount: string; // Total charge amount
  placeOfServiceCode: string; // e.g., '11' for office, '02' for telehealth
  claimFrequencyCode?: string; // '1' = Original claim

  // Diagnosis Codes
  diagnosisCodes: string[]; // ICD-10 codes (e.g., ['F41.1', 'F33.1'])

  // Service Lines
  serviceLines: ServiceLine[];

  // Dates
  dateOfService: string; // YYYY-MM-DD
}

export interface ServiceLine {
  serviceLineNumber: number;
  cptCode: string;
  modifiers?: string[]; // e.g., ['95'] for telehealth
  chargeAmount: string;
  units: string;
  diagnosisPointer?: string; // Points to diagnosis code (1-4)
}

export interface EDIGenerationResult {
  success: boolean;
  ediContent?: string;
  validationErrors?: ValidationError[];
  error?: string;
}

/**
 * Generate X12 837P EDI content from claim data
 */
export async function generateEDI(claimData: EDIClaimData): Promise<EDIGenerationResult> {
  try {
    logger.info('Starting EDI generation', {
      patientName: `${claimData.patientFirstName} ${claimData.patientLastName}`,
      dateOfService: claimData.dateOfService,
    });

    // Validate claim data first
    const validationErrors = validateClaim({
      patientFirstName: claimData.patientFirstName,
      patientLastName: claimData.patientLastName,
      patientDateOfBirth: claimData.patientDateOfBirth,
      patientAddress: claimData.patientAddress,
      patientCity: claimData.patientCity,
      patientState: claimData.patientState,
      patientZip: claimData.patientZip,
      insuranceCompany: claimData.payerName,
      insuranceMemberId: claimData.subscriberMemberId,
      subscriberFirstName: claimData.subscriberFirstName,
      subscriberLastName: claimData.subscriberLastName,
      subscriberDateOfBirth: claimData.subscriberDateOfBirth,
      relationshipToInsured: claimData.patientRelationshipToSubscriber,
      renderingProviderNPI: claimData.renderingProviderNPI,
      billingProviderNPI: claimData.billingProviderNPI,
      cptCode: claimData.serviceLines[0]?.cptCode,
      cptAddOnCode: claimData.serviceLines[1]?.cptCode,
      diagnosisCodes: claimData.diagnosisCodes,
      dateOfService: claimData.dateOfService,
      placeOfService: claimData.placeOfServiceCode,
      charges: claimData.claimAmount,
      units: claimData.serviceLines[0]?.units,
    });

    const criticalErrors = validationErrors.filter((e) => e.severity === 'error');
    if (criticalErrors.length > 0) {
      logger.warn('Claim validation failed', {
        errorCount: criticalErrors.length,
        errors: criticalErrors.map((e) => e.message),
      });
      return {
        success: false,
        validationErrors: criticalErrors,
      };
    }

    // Generate control numbers if not provided
    const interchangeControlNumber =
      claimData.interchangeControlNumber || generateControlNumber();
    const groupControlNumber = claimData.groupControlNumber || generateControlNumber();
    const transactionControlNumber =
      claimData.transactionControlNumber || generateControlNumber();

    // Build X12 837P EDI content
    const ediContent = buildX12_837P(claimData, {
      interchangeControlNumber,
      groupControlNumber,
      transactionControlNumber,
    });

    logger.info('EDI generation successful', {
      interchangeControlNumber,
      segmentCount: ediContent.split('~').length,
    });

    return {
      success: true,
      ediContent,
    };
  } catch (error) {
    logger.error('EDI generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'EDI generation failed',
    };
  }
}

/**
 * Build X12 837P content
 * Each segment ends with ~
 * Elements separated by *
 * Sub-elements separated by :
 */
function buildX12_837P(
  data: EDIClaimData,
  controlNumbers: {
    interchangeControlNumber: string;
    groupControlNumber: string;
    transactionControlNumber: string;
  }
): string {
  const segments: string[] = [];

  // Get current date/time for timestamps
  const now = new Date();
  const date = formatDate(now, 'YYMMDD');
  const time = formatTime(now);

  // ISA - Interchange Control Header
  segments.push(
    `ISA*00*          *00*          *30*${padRight(data.submitterNPI, 15)}*30*${padRight(
      data.receiverId,
      15
    )}*${date}*${time}*^*00501*${controlNumbers.interchangeControlNumber}*0*P*:~`
  );

  // GS - Functional Group Header
  segments.push(
    `GS*HC*${data.submitterNPI}*${data.receiverId}*${formatDate(now, 'YYYYMMDD')}*${formatTime(
      now,
      'HHMM'
    )}*${controlNumbers.groupControlNumber}*X*005010X222A1~`
  );

  // ST - Transaction Set Header (837P)
  segments.push(
    `ST*837*${controlNumbers.transactionControlNumber}*005010X222A1~`
  );

  // BHT - Beginning of Hierarchical Transaction
  segments.push(
    `BHT*0019*00*${controlNumbers.transactionControlNumber}*${formatDate(
      now,
      'YYYYMMDD'
    )}*${formatTime(now, 'HHMM')}*CH~`
  );

  // 1000A - Submitter Name (Moonlit)
  segments.push(`NM1*41*2*${data.submitterName}*****46*${data.submitterNPI}~`);
  if (data.submitterContactName && data.submitterContactPhone) {
    segments.push(
      `PER*IC*${data.submitterContactName}*TE*${data.submitterContactPhone}~`
    );
  }

  // 1000B - Receiver Name (Office Ally)
  segments.push(`NM1*40*2*OFFICE ALLY*****46*${data.receiverId}~`);

  // 2000A - Billing Provider Hierarchical Level
  segments.push(`HL*1**20*1~`); // Parent hierarchical level

  // 2010AA - Billing Provider Name
  segments.push(
    `NM1*85*2*${data.billingProviderName}*****XX*${data.billingProviderNPI}~`
  );
  segments.push(
    `N3*${data.billingProviderAddress}~`
  );
  segments.push(
    `N4*${data.billingProviderCity}*${data.billingProviderState}*${data.billingProviderZip}~`
  );
  if (data.billingProviderTaxId) {
    segments.push(`REF*EI*${data.billingProviderTaxId}~`);
  }

  // 2000B - Subscriber Hierarchical Level
  segments.push(`HL*2*1*22*0~`); // Child of billing provider
  segments.push(`SBR*P*${data.patientRelationshipToSubscriber}******CI~`);

  // 2010BA - Subscriber Name
  segments.push(
    `NM1*IL*1*${data.subscriberLastName}*${data.subscriberFirstName}${
      data.subscriberMiddleName ? '*' + data.subscriberMiddleName : ''
    }***MI*${data.subscriberMemberId}~`
  );
  if (data.subscriberAddress) {
    segments.push(`N3*${data.subscriberAddress}~`);
    segments.push(
      `N4*${data.subscriberCity}*${data.subscriberState}*${data.subscriberZip}~`
    );
  }
  segments.push(
    `DMG*D8*${formatDate(new Date(data.subscriberDateOfBirth), 'YYYYMMDD')}${
      data.subscriberGender ? '*' + data.subscriberGender : ''
    }~`
  );

  // 2010BB - Payer Name
  segments.push(`NM1*PR*2*${data.payerName}*****PI*${data.payerId}~`);

  // 2300 - Claim Information
  segments.push(
    `CLM*${controlNumbers.transactionControlNumber}*${data.claimAmount}***${
      data.placeOfServiceCode
    }:B:1*Y*A*Y*Y~`
  );

  // 2310A - Referring Provider (if different from rendering)
  // Skip for now

  // 2310B - Rendering Provider
  segments.push(
    `NM1*82*1*${data.renderingProviderLastName || data.renderingProviderName.split(' ').slice(-1)[0]}*${
      data.renderingProviderFirstName || data.renderingProviderName.split(' ')[0]
    }****XX*${data.renderingProviderNPI}~`
  );

  // 2320 - Other Subscriber Information (skip for primary insurance)

  // 2400 - Service Line Information
  // HI - Health Care Diagnosis Code
  const diagnosisSegment = data.diagnosisCodes
    .map((code, index) => {
      const qualifier = index === 0 ? 'ABK' : 'ABF'; // Primary vs secondary
      return `${qualifier}:${code}`;
    })
    .join('*');
  segments.push(`HI*${diagnosisSegment}~`);

  // LX/SV1 - Service Lines
  data.serviceLines.forEach((line) => {
    segments.push(`LX*${line.serviceLineNumber}~`);

    const modifiers = line.modifiers && line.modifiers.length > 0
      ? ':' + line.modifiers.join(':')
      : '';

    segments.push(
      `SV1*HC:${line.cptCode}${modifiers}*${line.chargeAmount}*UN*${line.units}***${
        line.diagnosisPointer || '1'
      }~`
    );
    segments.push(
      `DTP*472*D8*${formatDate(new Date(data.dateOfService), 'YYYYMMDD')}~`
    );
  });

  // SE - Transaction Set Trailer
  const segmentCount = segments.length + 1; // +1 for SE itself
  segments.push(`SE*${segmentCount}*${controlNumbers.transactionControlNumber}~`);

  // GE - Functional Group Trailer
  segments.push(`GE*1*${controlNumbers.groupControlNumber}~`);

  // IEA - Interchange Control Trailer
  segments.push(`IEA*1*${controlNumbers.interchangeControlNumber}~`);

  return segments.join('');
}

/**
 * Helper functions
 */

function generateControlNumber(): string {
  // Generate 9-digit control number
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

function padRight(str: string, length: number): string {
  return (str + ' '.repeat(length)).substring(0, length);
}

function formatDate(date: Date, format: 'YYMMDD' | 'YYYYMMDD'): string {
  const year =
    format === 'YYMMDD'
      ? date.getFullYear().toString().slice(-2)
      : date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatTime(date: Date, format: 'HHMM' | 'HHMMss' = 'HHMMss'): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  if (format === 'HHMM') {
    return `${hours}${minutes}`;
  }
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

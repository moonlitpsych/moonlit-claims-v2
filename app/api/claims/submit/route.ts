/**
 * API endpoint for submitting claims to Office Ally
 * Validates, generates EDI, saves to database, and uploads via SFTP
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEDI } from '@/services/edi/generator';
import { getOfficeAllyPayerId, requiresSupervisingNPI } from '@/services/supabase/payerLookup';
import { createClaim, recordSubmission, updateClaimStatus } from '@/services/supabase/claimsService';
import { logger } from '@/utils/logger';
import { ClaimStatus } from '@/types';

// Force Node.js runtime (not Edge) to support native modules
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(request: NextRequest) {
  try {
    // Dynamic import of SFTP client to avoid webpack bundling issues
    const { officeAllySFTP } = await import('@/services/officeAlly/sftpClient');

    const body = await request.json();

    logger.info('Claim submission request received', {
      hasPatientInfo: !!body.patientFirstName,
      hasInsurance: !!body.insuranceCompany,
    });

    // Step 1: Look up Office Ally Payer ID
    const payerId = await getOfficeAllyPayerId(body.insuranceCompany);
    if (!payerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Could not find Office Ally Payer ID for ${body.insuranceCompany}. Please add this payer to the database.`,
            code: 'PAYER_NOT_FOUND',
          },
        },
        { status: 400 }
      );
    }

    // Step 2: Check if payer requires supervising NPI
    const needsSupervisingNPI = await requiresSupervisingNPI(body.insuranceCompany);

    // Step 3: Generate EDI content
    const ediResult = await generateEDI({
      // Submitter (Moonlit)
      submitterName: body.submitterName || 'MOONLIT PLLC',
      submitterNPI: body.submitterNPI || '1275348807',
      submitterContactName: body.submitterContactName || 'Billing Department',
      submitterContactPhone: body.submitterContactPhone || '8015551234',

      // Receiver (Office Ally)
      receiverId: 'OFFALLY',

      // Payer
      payerId: payerId,
      payerName: body.insuranceCompany,

      // Billing Provider
      billingProviderName: body.billingProviderName || 'MOONLIT PLLC',
      billingProviderNPI: body.billingProviderNPI || '1275348807',
      billingProviderTaxId: body.billingProviderTaxId,
      billingProviderAddress: body.billingProviderAddress || '123 Main St',
      billingProviderCity: body.billingProviderCity || 'Salt Lake City',
      billingProviderState: body.billingProviderState || 'UT',
      billingProviderZip: body.billingProviderZip || '84101',
      billingProviderPhone: body.billingProviderPhone,

      // Rendering Provider
      renderingProviderName: needsSupervisingNPI && body.supervisingProviderName
        ? body.supervisingProviderName
        : body.renderingProviderName,
      renderingProviderNPI: needsSupervisingNPI && body.supervisingProviderNPI
        ? body.supervisingProviderNPI
        : body.renderingProviderNPI,
      renderingProviderFirstName: body.renderingProviderFirstName,
      renderingProviderLastName: body.renderingProviderLastName,

      // Subscriber
      subscriberFirstName: body.subscriberFirstName,
      subscriberLastName: body.subscriberLastName,
      subscriberMiddleName: body.subscriberMiddleName,
      subscriberMemberId: body.subscriberMemberId,
      subscriberGroupNumber: body.subscriberGroupNumber,
      subscriberDateOfBirth: body.subscriberDateOfBirth,
      subscriberGender: body.subscriberGender,
      subscriberAddress: body.subscriberAddress,
      subscriberCity: body.subscriberCity,
      subscriberState: body.subscriberState,
      subscriberZip: body.subscriberZip,

      // Patient
      patientFirstName: body.patientFirstName,
      patientLastName: body.patientLastName,
      patientMiddleName: body.patientMiddleName,
      patientDateOfBirth: body.patientDateOfBirth,
      patientGender: body.patientGender,
      patientAddress: body.patientAddress,
      patientCity: body.patientCity,
      patientState: body.patientState,
      patientZip: body.patientZip,
      patientRelationshipToSubscriber: mapRelationshipCode(body.relationshipToInsured),

      // Claim Information
      claimFilingIndicatorCode: 'CI',
      claimAmount: body.charges,
      placeOfServiceCode: body.placeOfService || '11',
      claimFrequencyCode: '1',

      // Diagnosis Codes
      diagnosisCodes: body.diagnosisCodes || [],

      // Service Lines
      serviceLines: buildServiceLines(body),

      // Date
      dateOfService: body.dateOfService,
    });

    // If EDI generation failed, return validation errors
    if (!ediResult.success) {
      return NextResponse.json(
        {
          success: false,
          validationErrors: ediResult.validationErrors,
          error: ediResult.error,
        },
        { status: 400 }
      );
    }

    // Step 4: Save claim to database
    const claimResult = await createClaim({
      intakeqAppointmentId: body.intakeqAppointmentId,
      intakeqClientId: body.intakeqClientId,
      intakeqPractitionerId: body.intakeqPractitionerId,
      patientFirstName: body.patientFirstName,
      patientLastName: body.patientLastName,
      patientDateOfBirth: body.patientDateOfBirth,
      patientAddress: {
        street: body.patientAddress,
        city: body.patientCity,
        state: body.patientState,
        zip: body.patientZip,
      },
      insuranceInfo: {
        carrier: body.insuranceCompany,
        memberId: body.subscriberMemberId,
        groupNumber: body.subscriberGroupNumber,
        subscriberFirstName: body.subscriberFirstName,
        subscriberLastName: body.subscriberLastName,
        subscriberDateOfBirth: body.subscriberDateOfBirth,
        relationshipToSubscriber: body.relationshipToInsured,
      },
      diagnosisCodes: body.diagnosisCodes.map((code: string, index: number) => ({
        code,
        description: '', // TODO: Look up from ICD-10 database
        isPrimary: index === 0,
      })),
      serviceLines: buildServiceLines(body).map((line: any) => ({
        cptCode: line.cptCode,
        modifiers: line.modifiers,
        units: parseInt(line.units),
        chargeAmount: parseFloat(line.chargeAmount),
        dateOfService: body.dateOfService,
      })),
      ediContent: ediResult.ediContent,
      totalChargeAmount: parseFloat(body.charges),
      aiCodingUsed: body.aiCodingUsed || false,
      aiCodingDetails: body.aiCodingDetails,
      createdBy: body.createdBy || 'system',
    });

    if (!claimResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: claimResult.error || 'Failed to save claim',
            code: 'DATABASE_ERROR',
          },
        },
        { status: 500 }
      );
    }

    const claimId = claimResult.claimId!;

    // Step 5: Upload to Office Ally via SFTP
    const uploadResult = await officeAllySFTP.uploadClaim(ediResult.ediContent!, claimId);

    // Step 6: Record submission attempt
    await recordSubmission(claimId, {
      method: 'sftp',
      status: uploadResult.success ? 'success' : 'failed',
      sftpFileName: uploadResult.fileName,
      sftpRemotePath: uploadResult.remotePath,
      errorMessage: uploadResult.error,
      officeAllyResponse: uploadResult,
    });

    // Step 7: Update claim status
    if (uploadResult.success) {
      await updateClaimStatus(claimId, ClaimStatus.SUBMITTED, new Date());
    }

    // Return result
    if (uploadResult.success) {
      logger.info('Claim submitted successfully', {
        claimId,
        fileName: uploadResult.fileName,
      });

      return NextResponse.json({
        success: true,
        data: {
          claimId,
          fileName: uploadResult.fileName,
          remotePath: uploadResult.remotePath,
          status: 'submitted',
        },
      });
    } else {
      logger.error('SFTP upload failed', {
        claimId,
        error: uploadResult.error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Claim saved but SFTP upload failed: ${uploadResult.error}`,
            code: 'SFTP_ERROR',
            claimId, // Still return claimId so user knows it was saved
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error in claim submission endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to submit claim',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Build service lines from request body
 */
function buildServiceLines(body: any) {
  const serviceLines = [];

  if (body.cptCode) {
    serviceLines.push({
      serviceLineNumber: 1,
      cptCode: body.cptCode,
      modifiers: body.cptModifiers || [],
      chargeAmount: body.charges,
      units: body.units || '1',
      diagnosisPointer: '1',
    });
  }

  if (body.cptAddOnCode) {
    serviceLines.push({
      serviceLineNumber: 2,
      cptCode: body.cptAddOnCode,
      modifiers: body.cptAddOnModifiers || [],
      chargeAmount: body.cptAddOnCharges || '0.00',
      units: body.cptAddOnUnits || '1',
      diagnosisPointer: '1',
    });
  }

  return serviceLines;
}

/**
 * Map relationship description to X12 code
 */
function mapRelationshipCode(relationship: string): '01' | '18' | '19' | 'G8' {
  const rel = relationship?.toLowerCase() || '';

  if (rel.includes('self')) return '18';
  if (rel.includes('spouse')) return '01';
  if (rel.includes('child')) return '19';

  return 'G8';
}

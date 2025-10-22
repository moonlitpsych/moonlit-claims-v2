/**
 * API endpoint for generating X12 837P EDI content from claim data
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEDI, EDIClaimData } from '@/services/edi/generator';
import { getOfficeAllyPayerId, requiresSupervisingNPI } from '@/services/supabase/payerLookup';
import { logger } from '@/utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    logger.info('EDI generation request received', {
      hasPatientInfo: !!body.patientFirstName,
      hasInsurance: !!body.insuranceCompany,
    });

    // Look up Office Ally Payer ID
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

    // Check if payer requires supervising NPI
    const needsSupervisingNPI = await requiresSupervisingNPI(body.insuranceCompany);

    // Build EDI claim data
    const ediClaimData: EDIClaimData = {
      // Submitter (Moonlit)
      submitterName: body.submitterName || 'MOONLIT PLLC',
      submitterNPI: body.submitterNPI || '1275348807', // Moonlit's NPI
      submitterContactName: body.submitterContactName || 'Billing Department',
      submitterContactPhone: body.submitterContactPhone || '8015551234',

      // Receiver (Office Ally)
      receiverId: 'OFFALLY',

      // Payer
      payerId: payerId,
      payerName: body.insuranceCompany,

      // Billing Provider (Moonlit Organization)
      billingProviderName: body.billingProviderName || 'MOONLIT PLLC',
      billingProviderNPI: body.billingProviderNPI || '1275348807',
      billingProviderTaxId: body.billingProviderTaxId,
      billingProviderAddress: body.billingProviderAddress || '123 Main St',
      billingProviderCity: body.billingProviderCity || 'Salt Lake City',
      billingProviderState: body.billingProviderState || 'UT',
      billingProviderZip: body.billingProviderZip || '84101',
      billingProviderPhone: body.billingProviderPhone,

      // Rendering Provider (Individual physician)
      // Use supervising NPI if required by payer
      renderingProviderName: needsSupervisingNPI && body.supervisingProviderName
        ? body.supervisingProviderName
        : body.renderingProviderName,
      renderingProviderNPI: needsSupervisingNPI && body.supervisingProviderNPI
        ? body.supervisingProviderNPI
        : body.renderingProviderNPI,
      renderingProviderFirstName: body.renderingProviderFirstName,
      renderingProviderLastName: body.renderingProviderLastName,

      // Subscriber (Insurance Policyholder)
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
      claimFilingIndicatorCode: 'CI', // Commercial Insurance
      claimAmount: body.charges,
      placeOfServiceCode: body.placeOfService || '11',
      claimFrequencyCode: '1', // Original claim

      // Diagnosis Codes
      diagnosisCodes: body.diagnosisCodes || [],

      // Service Lines
      serviceLines: buildServiceLines(body),

      // Dates
      dateOfService: body.dateOfService,
    };

    // Generate EDI
    const result = await generateEDI(ediClaimData);

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          ediContent: result.ediContent,
          payerId: payerId,
          needsSupervisingNPI: needsSupervisingNPI,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          validationErrors: result.validationErrors,
          error: result.error,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('Error in EDI generation endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to generate EDI',
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

  // Primary CPT code
  if (body.cptCode) {
    serviceLines.push({
      serviceLineNumber: 1,
      cptCode: body.cptCode,
      modifiers: body.cptModifiers || [],
      chargeAmount: body.charges,
      units: body.units || '1',
      diagnosisPointer: '1', // Points to first diagnosis
    });
  }

  // Add-on CPT code (e.g., psychotherapy add-on)
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

  return 'G8'; // Other
}

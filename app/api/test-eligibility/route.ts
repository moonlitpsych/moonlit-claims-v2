/**
 * Test Office Ally REALTIME Eligibility Check
 * GET /api/test-eligibility?patientId=78
 */

import { NextRequest, NextResponse } from 'next/server';
import { officeAllyRealtime } from '@/services/officeAlly/realtimeClient';
import { logger } from '@/utils/logger';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId') || '78'; // Default to Hayden Cook

    logger.info('Testing eligibility check', { patientId });

    // Fetch patient data from IntakeQ
    const clientResponse = await axios.get('https://intakeq.com/api/v1/clients', {
      params: {
        search: patientId,
        includeProfile: true,
      },
      headers: {
        'X-Auth-Key': process.env.INTAKEQ_API_KEY,
      },
    });

    if (!clientResponse.data || clientResponse.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Patient ${patientId} not found in IntakeQ`,
        },
        { status: 404 }
      );
    }

    const patient = clientResponse.data[0];

    logger.info('Found patient in IntakeQ', {
      name: `${patient.FirstName} ${patient.LastName}`,
      insurance: patient.PrimaryInsuranceCompany,
    });

    // Check if patient has insurance
    if (!patient.PrimaryInsuranceCompany || !patient.PrimaryInsurancePolicyNumber) {
      return NextResponse.json({
        success: false,
        error: 'Patient does not have primary insurance information in IntakeQ',
        patientInfo: {
          name: `${patient.FirstName} ${patient.LastName}`,
          hasInsurance: false,
        },
      });
    }

    // Convert DOB from timestamp to YYYY-MM-DD
    const dobDate = new Date(patient.DateOfBirth);
    const dob = dobDate.toISOString().split('T')[0];

    // Determine payer ID
    // For testing, we'll use common payer IDs
    // Office Ally payer IDs for eligibility (270/271 transactions)
    const payerIdMap: Record<string, string> = {
      'University of Utah Health Plans': 'UNIV-UTHP', // UUHP Office Ally payer ID
      'UUHP': 'UNIV-UTHP',
      'Medicaid': 'UTMCD',
      'Select Health': 'SLHUT',
      'Molina': 'MOLIN',
      'Aetna': '60054',
      'AETNA': '60054',
      'Aetna Health, Inc.': '60054',
    };

    // Try exact match first, then check if company name contains a known payer
    let payerId = payerIdMap[patient.PrimaryInsuranceCompany];
    if (!payerId) {
      // Check for partial matches (case-insensitive)
      const companyLower = patient.PrimaryInsuranceCompany.toLowerCase();
      if (companyLower.includes('aetna')) {
        payerId = '60054';
      } else if (companyLower.includes('university of utah') || companyLower.includes('uuhp')) {
        payerId = 'UNIV-UTHP';
      } else {
        payerId = patient.PrimaryInsuranceCompany.substring(0, 5).toUpperCase();
      }
    }

    logger.info('Submitting eligibility inquiry to Office Ally', {
      payerId,
      patientName: `${patient.FirstName} ${patient.LastName}`,
    });

    // Submit eligibility inquiry
    const eligibilityResult = await officeAllyRealtime.checkEligibility({
      patientFirstName: patient.FirstName,
      patientLastName: patient.LastName,
      patientDateOfBirth: dob,
      subscriberMemberId: patient.PrimaryInsurancePolicyNumber,
      providerNPI: process.env.OFFICE_ALLY_PROVIDER_NPI || '1275348807',
      payerId: payerId,
    });

    logger.info('Eligibility check result', {
      success: eligibilityResult.success,
      coverageStatus: eligibilityResult.coverageStatus,
      copayAmount: eligibilityResult.copayAmount,
    });

    return NextResponse.json({
      success: true,
      patientInfo: {
        name: `${patient.FirstName} ${patient.LastName}`,
        dob: dob,
        insurance: patient.PrimaryInsuranceCompany,
        memberId: patient.PrimaryInsurancePolicyNumber,
        payerId: payerId,
      },
      eligibilityResult,
    });
  } catch (error) {
    logger.error('Eligibility test error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Eligibility check failed',
      },
      { status: 500 }
    );
  }
}

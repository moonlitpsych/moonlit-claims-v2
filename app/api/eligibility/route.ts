/**
 * Eligibility API Route
 * POST /api/eligibility - Check patient eligibility via Office Ally REALTIME 270/271
 */

import { NextRequest, NextResponse } from 'next/server';
import { officeAllyRealtime } from '@/services/officeAlly/realtimeClient';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import type { EligibilityRequest } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body: EligibilityRequest = await request.json();

    // Validate required fields
    if (
      !body.patientFirstName ||
      !body.patientLastName ||
      !body.patientDateOfBirth ||
      !body.subscriberMemberId ||
      !body.providerNPI ||
      !body.payerId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Missing required fields',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    logger.info('Eligibility check requested', {
      clientId: body.clientId,
      patientName: `${body.patientFirstName} ${body.patientLastName}`,
      payerId: body.payerId,
    });

    // Call Office Ally REALTIME 270/271
    const eligibilityResponse = await officeAllyRealtime.checkEligibility({
      patientFirstName: body.patientFirstName,
      patientLastName: body.patientLastName,
      patientDateOfBirth: body.patientDateOfBirth,
      subscriberMemberId: body.subscriberMemberId,
      providerNPI: body.providerNPI,
      payerId: body.payerId,
      serviceDate: body.serviceDate,
    });

    if (!eligibilityResponse.success) {
      logger.error('Eligibility check failed', {
        clientId: body.clientId,
        error: eligibilityResponse.error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: eligibilityResponse.error || 'Eligibility check failed',
            code: 'ELIGIBILITY_CHECK_FAILED',
          },
        },
        { status: 500 }
      );
    }

    // Store eligibility check result in database
    const { data: eligibilityCheck, error: dbError } = await supabase
      .from('eligibility_checks')
      .insert({
        intakeq_client_id: body.clientId,
        intakeq_appointment_id: body.appointmentId || null,
        payer_id: null, // TODO: Map payerId to payer UUID if needed
        check_date: new Date().toISOString(),
        coverage_status: eligibilityResponse.coverageStatus || 'unknown',
        benefits_data: {
          mentalHealth: eligibilityResponse.benefitsData?.mentalHealth,
        },
        copay_amount: eligibilityResponse.copayAmount,
        deductible_info: eligibilityResponse.deductibleInfo,
        office_ally_response: {
          raw271: eligibilityResponse.raw271,
        },
      })
      .select()
      .single();

    if (dbError) {
      logger.error('Failed to store eligibility check', {
        clientId: body.clientId,
        error: dbError.message,
      });
      // Continue anyway - don't fail the request
    }

    logger.info('Eligibility check completed', {
      clientId: body.clientId,
      coverageStatus: eligibilityResponse.coverageStatus,
      copayAmount: eligibilityResponse.copayAmount,
    });

    // Return eligibility response with database ID
    return NextResponse.json({
      success: true,
      data: {
        id: eligibilityCheck?.id,
        coverageStatus: eligibilityResponse.coverageStatus,
        copayAmount: eligibilityResponse.copayAmount,
        deductibleInfo: eligibilityResponse.deductibleInfo,
        benefitsData: eligibilityResponse.benefitsData,
        checkDate: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Eligibility API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Batch Eligibility API Route
 * POST /api/eligibility/batch - Check eligibility for multiple appointments at once
 * IMPORTANT: This costs ~$0.10 per eligibility check at Office Ally
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

// Rate limiting: Process eligibility checks with delays to avoid overwhelming Office Ally
const DELAY_BETWEEN_CHECKS_MS = 1000; // 1 second between checks
const MAX_BATCH_SIZE = 50; // Maximum appointments per batch

interface BatchEligibilityRequest {
  requests: EligibilityRequest[];
  confirmed?: boolean; // User must confirm cost
}

interface BatchEligibilityResult {
  appointmentId?: string;
  clientId: string;
  success: boolean;
  coverageStatus?: 'active' | 'inactive' | 'unknown';
  copayAmount?: number;
  error?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchEligibilityRequest = await request.json();

    // Validate input
    if (!body.requests || !Array.isArray(body.requests) || body.requests.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Missing or invalid requests array',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Check batch size limit
    if (body.requests.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`,
            code: 'BATCH_SIZE_EXCEEDED',
          },
        },
        { status: 400 }
      );
    }

    // Calculate estimated cost
    const estimatedCost = body.requests.length * 0.10;

    // Require confirmation for cost
    if (!body.confirmed) {
      return NextResponse.json({
        success: false,
        requiresConfirmation: true,
        message: `This will check eligibility for ${body.requests.length} appointments at approximately $${estimatedCost.toFixed(2)}. Please confirm to proceed.`,
        estimatedCost,
        requestCount: body.requests.length,
      });
    }

    logger.info('Batch eligibility check started', {
      requestCount: body.requests.length,
      estimatedCost,
    });

    const results: BatchEligibilityResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each request with rate limiting
    for (let i = 0; i < body.requests.length; i++) {
      const req = body.requests[i];

      try {
        logger.info(`Processing eligibility check ${i + 1}/${body.requests.length}`, {
          clientId: req.clientId,
        });

        // Call Office Ally REALTIME 270/271
        const eligibilityResponse = await officeAllyRealtime.checkEligibility({
          patientFirstName: req.patientFirstName,
          patientLastName: req.patientLastName,
          patientDateOfBirth: req.patientDateOfBirth,
          subscriberMemberId: req.subscriberMemberId,
          providerNPI: req.providerNPI,
          payerId: req.payerId,
          serviceDate: req.serviceDate,
        });

        if (eligibilityResponse.success) {
          // Store in database
          await supabase.from('eligibility_checks').insert({
            intakeq_client_id: req.clientId,
            intakeq_appointment_id: req.appointmentId || null,
            payer_id: null,
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
          });

          results.push({
            appointmentId: req.appointmentId,
            clientId: req.clientId,
            success: true,
            coverageStatus: eligibilityResponse.coverageStatus,
            copayAmount: eligibilityResponse.copayAmount,
          });

          successCount++;
        } else {
          results.push({
            appointmentId: req.appointmentId,
            clientId: req.clientId,
            success: false,
            error: eligibilityResponse.error,
          });

          failureCount++;
        }
      } catch (error) {
        logger.error('Batch eligibility check failed for request', {
          clientId: req.clientId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        results.push({
          appointmentId: req.appointmentId,
          clientId: req.clientId,
          success: false,
          error: error instanceof Error ? error.message : 'Eligibility check failed',
        });

        failureCount++;
      }

      // Add delay between requests (except after the last one)
      if (i < body.requests.length - 1) {
        await delay(DELAY_BETWEEN_CHECKS_MS);
      }
    }

    logger.info('Batch eligibility check completed', {
      total: body.requests.length,
      successCount,
      failureCount,
      estimatedCost,
    });

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          total: body.requests.length,
          successful: successCount,
          failed: failureCount,
          estimatedCost,
        },
      },
    });
  } catch (error) {
    logger.error('Batch eligibility API error', {
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

/**
 * IntakeQ Intake API Route
 * Fetches intake form data for claim auto-population
 */

import { NextRequest, NextResponse } from 'next/server';
import { intakeqService } from '@/services/intakeq/client';
import { logger } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { intakeId: string } }
) {
  try {
    const intakeId = params.intakeId;

    logger.info('Fetching intake from IntakeQ', { intakeId });

    const result = await intakeqService.getIntake(intakeId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error?.message || 'Failed to fetch intake',
            code: result.error?.code,
          },
        },
        { status: 500 }
      );
    }

    // Audit log
    await logger.audit({
      action: 'intake_viewed',
      resourceType: 'intake',
      resourceId: intakeId,
      ipAddress: request.headers.get('x-forwarded-for') || request.ip,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    logger.info('Successfully fetched intake', { intakeId });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Error in intakes API route', {
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

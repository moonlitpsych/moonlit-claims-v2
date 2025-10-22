/**
 * Appointments API Route
 * Fetches appointments from IntakeQ with optional filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { intakeqService } from '@/services/intakeq/client';
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const practitionerId = searchParams.get('practitionerId');
    const clientId = searchParams.get('clientId');

    logger.info('Fetching appointments', {
      startDate,
      endDate,
      practitionerId,
      clientId,
    });

    // Build filter parameters
    const params: {
      startDate?: string;
      endDate?: string;
      practitionerId?: string;
      clientId?: string;
    } = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (practitionerId) params.practitionerId = practitionerId;
    if (clientId) params.clientId = clientId;

    // Fetch from IntakeQ
    const result = await intakeqService.getAppointments(params);

    if (!result.success) {
      logger.error('Failed to fetch appointments', {
        error: result.error?.message,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Failed to fetch appointments',
            retryable: result.error?.retryable,
          },
        },
        { status: 500 }
      );
    }

    logger.info('Successfully fetched appointments', {
      count: result.data?.length || 0,
    });

    // Audit log
    await logger.audit({
      action: 'appointments_viewed',
      resourceType: 'appointment',
      ipAddress: request.headers.get('x-forwarded-for') || request.ip,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Appointments API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Internal server error',
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}

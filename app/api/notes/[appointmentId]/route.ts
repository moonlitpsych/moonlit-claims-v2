/**
 * Notes API Route
 * Fetches clinical note for a specific appointment
 */

import { NextRequest, NextResponse } from 'next/server';
import { intakeqService } from '@/services/intakeq/client';
import { logger } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { appointmentId: string } }
) {
  const { appointmentId } = params;

  try {
    logger.info('Fetching note for appointment', { appointmentId });

    const result = await intakeqService.getAppointmentNote(appointmentId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.error?.code === 'NOT_FOUND' ? 404 : 500 }
      );
    }
  } catch (error) {
    logger.error('Error fetching note', {
      appointmentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to fetch note',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

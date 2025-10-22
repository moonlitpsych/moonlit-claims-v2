/**
 * IntakeQ Client API Route
 * Fetches patient information for claim auto-population
 */

import { NextRequest, NextResponse } from 'next/server';
import { intakeqService } from '@/services/intakeq/client';
import { logger } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const clientId = params.clientId;

    logger.info('Fetching client from IntakeQ', { clientId });

    const result = await intakeqService.getClient(clientId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error?.message || 'Failed to fetch client',
            code: result.error?.code,
          },
        },
        { status: 500 }
      );
    }

    // Audit log (gracefully skips if Supabase not configured)
    await logger.audit({
      action: 'client_viewed',
      resourceType: 'client',
      resourceId: clientId,
      ipAddress: request.headers.get('x-forwarded-for') || request.ip,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    logger.info('Successfully fetched client', { clientId });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('Error in clients API route', {
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

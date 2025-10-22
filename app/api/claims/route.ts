/**
 * API endpoint for fetching claims with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClaims } from '@/services/supabase/claimsService';
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract filters from query params
    const filters: any = {};

    const status = searchParams.get('status');
    if (status) {
      filters.status = status;
    }

    const startDate = searchParams.get('startDate');
    if (startDate) {
      filters.startDate = startDate;
    }

    const endDate = searchParams.get('endDate');
    if (endDate) {
      filters.endDate = endDate;
    }

    const practitionerId = searchParams.get('practitionerId');
    if (practitionerId) {
      filters.practitionerId = practitionerId;
    }

    logger.info('Fetching claims', { filters });

    // Fetch claims from database
    const result = await getClaims(filters);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error || 'Failed to fetch claims',
            code: 'DATABASE_ERROR',
          },
        },
        { status: 500 }
      );
    }

    logger.info('Claims fetched successfully', {
      count: result.claims?.length || 0,
    });

    return NextResponse.json({
      success: true,
      data: result.claims || [],
    });
  } catch (error) {
    logger.error('Error fetching claims', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to fetch claims',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

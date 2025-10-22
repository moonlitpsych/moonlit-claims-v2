/**
 * AI Diagnosis Extraction API Route
 * Uses Gemini AI to extract diagnoses from clinical notes
 */

import { NextRequest, NextResponse } from 'next/server';
import { geminiService } from '@/services/gemini/client';
import { logger } from '@/utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteContent } = body;

    if (!noteContent || typeof noteContent !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'noteContent is required and must be a string',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    logger.info('Processing diagnosis extraction request', {
      noteLength: noteContent.length,
    });

    const result = await geminiService.extractDiagnoses(noteContent);

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
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error in diagnosis extraction endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to process diagnosis extraction',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

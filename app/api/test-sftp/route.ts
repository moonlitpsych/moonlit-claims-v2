/**
 * Test SFTP Connection to Office Ally
 * GET /api/test-sftp
 */

import { NextResponse } from 'next/server';
import { officeAllySFTP } from '@/services/officeAlly/sftpClient';
import { logger } from '@/utils/logger';

export async function GET() {
  try {
    logger.info('Testing SFTP connection to Office Ally');

    const success = await officeAllySFTP.testConnection();

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'SFTP connection successful',
        details: {
          host: process.env.OFFICE_ALLY_SFTP_HOST,
          port: process.env.OFFICE_ALLY_SFTP_PORT || '22',
          username: process.env.OFFICE_ALLY_SFTP_USERNAME,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'SFTP connection failed',
          message: 'Could not connect to Office Ally SFTP server',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('SFTP test error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'SFTP test failed',
      },
      { status: 500 }
    );
  }
}

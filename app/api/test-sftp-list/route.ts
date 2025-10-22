/**
 * Test SFTP Directory Listing
 * GET /api/test-sftp-list
 */

import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';

// @ts-ignore
const SftpClient = require('ssh2-sftp-client');

export async function GET() {
  const sftp = new SftpClient();

  try {
    logger.info('Testing SFTP directory listing');

    await sftp.connect({
      host: process.env.OFFICE_ALLY_SFTP_HOST,
      port: parseInt(process.env.OFFICE_ALLY_SFTP_PORT || '22'),
      username: process.env.OFFICE_ALLY_SFTP_USERNAME,
      password: process.env.OFFICE_ALLY_SFTP_PASSWORD,
    });

    logger.info('Connected, listing directories');

    // List root directory
    const rootFiles = await sftp.list('/');

    // Try to list common directories
    const directories: Record<string, any[]> = {
      root: rootFiles,
    };

    // Try /outbound
    try {
      const outboundFiles = await sftp.list('/outbound');
      directories.outbound = outboundFiles.slice(0, 10); // First 10 files
    } catch (e) {
      directories.outbound = ['Error: ' + (e as Error).message];
    }

    // Try /inbound
    try {
      const inboundFiles = await sftp.list('/inbound');
      directories.inbound = inboundFiles.slice(0, 10); // First 10 files
    } catch (e) {
      directories.inbound = ['Error: ' + (e as Error).message];
    }

    await sftp.end();

    return NextResponse.json({
      success: true,
      message: 'Successfully listed SFTP directories',
      directories: {
        root: directories.root.map((f: any) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          modifyTime: new Date(f.modifyTime).toISOString()
        })),
        outbound: Array.isArray(directories.outbound)
          ? directories.outbound.map((f: any) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              modifyTime: new Date(f.modifyTime).toISOString()
            }))
          : directories.outbound,
        inbound: Array.isArray(directories.inbound)
          ? directories.inbound.map((f: any) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              modifyTime: new Date(f.modifyTime).toISOString()
            }))
          : directories.inbound,
      },
    });
  } catch (error) {
    logger.error('SFTP listing test error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    try {
      await sftp.end();
    } catch (e) {
      // Ignore
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'SFTP listing failed',
      },
      { status: 500 }
    );
  }
}

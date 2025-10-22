/**
 * Office Ally SFTP Client
 * Handles EDI file uploads and acknowledgment downloads
 *
 * IMPORTANT: This module uses native Node.js bindings and can ONLY run on the server.
 * Never import this directly in client-side code or Next.js pages.
 * Use API routes to call these functions.
 */

// @ts-ignore - Dynamic import to avoid bundling in client
const SftpClient = require('ssh2-sftp-client');

import { logger } from '@/utils/logger';

export interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface UploadResult {
  success: boolean;
  fileName?: string;
  remotePath?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  fileName?: string;
  content?: string;
  error?: string;
}

class OfficeAllySFTPClient {
  private config: SFTPConfig;

  constructor() {
    this.config = {
      host: process.env.OFFICE_ALLY_SFTP_HOST || '',
      port: parseInt(process.env.OFFICE_ALLY_SFTP_PORT || '22'),
      username: process.env.OFFICE_ALLY_SFTP_USERNAME || '',
      password: process.env.OFFICE_ALLY_SFTP_PASSWORD || '',
    };

    if (!this.config.host || !this.config.username || !this.config.password) {
      throw new Error('Office Ally SFTP credentials not configured');
    }
  }

  /**
   * Upload EDI file to Office Ally
   * File naming convention: [YourID]_[Timestamp].837
   */
  async uploadClaim(ediContent: string, claimId: string): Promise<UploadResult> {
    const sftp = new SftpClient();

    try {
      logger.info('Connecting to Office Ally SFTP', {
        host: this.config.host,
        username: this.config.username,
      });

      await sftp.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
      });

      logger.info('SFTP connection established');

      // Generate filename: MOONLIT_YYYYMMDD_HHMMSS_ClaimID.837
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .split('.')[0];
      const fileName = `MOONLIT_${timestamp}_${claimId}.837`;

      // Office Ally typically uses /claims or /outbound directory
      // Check their documentation for exact path
      const remotePath = `/outbound/${fileName}`;

      // Convert content to Buffer
      const buffer = Buffer.from(ediContent, 'utf-8');

      logger.info('Uploading claim file', {
        fileName,
        remotePath,
        size: buffer.length,
      });

      await sftp.put(buffer, remotePath);

      logger.info('Claim file uploaded successfully', {
        fileName,
        remotePath,
      });

      await sftp.end();

      return {
        success: true,
        fileName,
        remotePath,
      };
    } catch (error) {
      logger.error('SFTP upload failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      try {
        await sftp.end();
      } catch (endError) {
        // Ignore disconnect errors
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'SFTP upload failed',
      };
    }
  }

  /**
   * Download acknowledgment files (997/999) from /inbound
   * These files confirm EDI was received
   */
  async downloadAcknowledgments(): Promise<DownloadResult[]> {
    const sftp = new SftpClient();
    const results: DownloadResult[] = [];

    try {
      logger.info('Connecting to Office Ally SFTP for acknowledgments');

      await sftp.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
      });

      // Office Ally places acknowledgments in /inbound
      const inboundPath = '/inbound';

      logger.info('Listing acknowledgment files', { path: inboundPath });

      const fileList = await sftp.list(inboundPath);

      // Filter for 997/999 files
      const ackFiles = fileList.filter(
        (file: any) =>
          file.name.endsWith('.997') ||
          file.name.endsWith('.999') ||
          file.name.toLowerCase().includes('ack')
      );

      logger.info('Found acknowledgment files', { count: ackFiles.length });

      for (const file of ackFiles) {
        try {
          const remotePath = `${inboundPath}/${file.name}`;
          const content = await sftp.get(remotePath);

          results.push({
            success: true,
            fileName: file.name,
            content: content.toString('utf-8'),
          });

          logger.info('Downloaded acknowledgment file', {
            fileName: file.name,
          });

          // Optionally: delete or archive the file after download
          // await sftp.delete(remotePath);
        } catch (fileError) {
          logger.error('Failed to download acknowledgment file', {
            fileName: file.name,
            error: fileError instanceof Error ? fileError.message : 'Unknown error',
          });

          results.push({
            success: false,
            fileName: file.name,
            error: fileError instanceof Error ? fileError.message : 'Download failed',
          });
        }
      }

      await sftp.end();

      return results;
    } catch (error) {
      logger.error('SFTP acknowledgment download failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      try {
        await sftp.end();
      } catch (endError) {
        // Ignore disconnect errors
      }

      return results;
    }
  }

  /**
   * Download 277 claim status response files from /outbound
   * Office Ally delivers 277 responses via SFTP, not REALTIME API
   */
  async downloadClaimStatusResponses(): Promise<DownloadResult[]> {
    const sftp = new SftpClient();
    const results: DownloadResult[] = [];

    try {
      logger.info('Connecting to Office Ally SFTP for 277 claim status responses');

      await sftp.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
      });

      // Office Ally delivers 277 responses to /outbound
      const outboundPath = '/outbound';

      logger.info('Listing 277 status files', { path: outboundPath });

      const fileList = await sftp.list(outboundPath);

      // Filter for 277 claim status response files
      const statusFiles = fileList.filter(
        (file: any) =>
          file.name.endsWith('.277') ||
          file.name.includes('EDI_STATUS') ||
          file.name.includes('HCFA_FULL')
      );

      logger.info('Found 277 status files', { count: statusFiles.length });

      // Download only recent files (last 30 days) to avoid processing old data
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentFiles = statusFiles.filter((file: any) => file.modifyTime > thirtyDaysAgo);

      logger.info('Filtering to recent files', {
        total: statusFiles.length,
        recent: recentFiles.length,
      });

      for (const file of recentFiles) {
        try {
          const remotePath = `${outboundPath}/${file.name}`;
          const content = await sftp.get(remotePath);

          results.push({
            success: true,
            fileName: file.name,
            content: content.toString('utf-8'),
          });

          logger.info('Downloaded 277 status file', {
            fileName: file.name,
            size: file.size,
          });
        } catch (fileError) {
          logger.error('Failed to download 277 status file', {
            fileName: file.name,
            error: fileError instanceof Error ? fileError.message : 'Unknown error',
          });

          results.push({
            success: false,
            fileName: file.name,
            error: fileError instanceof Error ? fileError.message : 'Download failed',
          });
        }
      }

      await sftp.end();

      return results;
    } catch (error) {
      logger.error('SFTP 277 status download failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      try {
        await sftp.end();
      } catch (endError) {
        // Ignore disconnect errors
      }

      return results;
    }
  }

  /**
   * Test SFTP connection
   */
  async testConnection(): Promise<boolean> {
    const sftp = new SftpClient();

    try {
      logger.info('Testing Office Ally SFTP connection');

      await sftp.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
      });

      logger.info('SFTP connection test successful');

      await sftp.end();

      return true;
    } catch (error) {
      logger.error('SFTP connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      try {
        await sftp.end();
      } catch (endError) {
        // Ignore disconnect errors
      }

      return false;
    }
  }
}

// Export singleton instance
export const officeAllySFTP = new OfficeAllySFTPClient();

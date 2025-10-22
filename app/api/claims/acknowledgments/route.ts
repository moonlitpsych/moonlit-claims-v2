/**
 * API endpoint for downloading and processing 997/999 acknowledgments from Office Ally
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseAcknowledgment } from '@/services/officeAlly/acknowledgmentParser';
import { updateClaimStatus, recordSubmission } from '@/services/supabase/claimsService';
import { logger } from '@/utils/logger';

// Force Node.js runtime (not Edge) to support native modules
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(request: NextRequest) {
  try {
    // Dynamic import of SFTP client to avoid webpack bundling issues
    const { officeAllySFTP } = await import('@/services/officeAlly/sftpClient');

    logger.info('Downloading acknowledgments from Office Ally SFTP');

    // Download all acknowledgment files from SFTP
    const downloadResults = await officeAllySFTP.downloadAcknowledgments();

    const processedAcknowledgments = [];
    const errors = [];

    for (const result of downloadResults) {
      if (!result.success || !result.content) {
        errors.push({
          fileName: result.fileName,
          error: result.error || 'No content',
        });
        continue;
      }

      try {
        // Parse acknowledgment
        const ackResult = parseAcknowledgment(result.content);

        if (!ackResult.success) {
          errors.push({
            fileName: result.fileName,
            error: 'Failed to parse acknowledgment',
            details: ackResult.errors,
          });
          continue;
        }

        // Try to find matching claim by control number
        // Note: This requires storing control numbers in the claims table
        // For now, we'll just log the acknowledgment
        logger.info('Acknowledgment processed', {
          fileName: result.fileName,
          type: ackResult.acknowledgmentType,
          accepted: ackResult.accepted,
          interchangeControlNumber: ackResult.interchangeControlNumber,
          groupControlNumber: ackResult.groupControlNumber,
          transactionControlNumber: ackResult.transactionControlNumber,
        });

        processedAcknowledgments.push({
          fileName: result.fileName,
          type: ackResult.acknowledgmentType,
          accepted: ackResult.accepted,
          interchangeControlNumber: ackResult.interchangeControlNumber,
          groupControlNumber: ackResult.groupControlNumber,
          transactionControlNumber: ackResult.transactionControlNumber,
          functionalGroupAckCode: ackResult.functionalGroupAcknowledgmentCode,
          transactionSetAckCode: ackResult.transactionSetAcknowledgmentCode,
          errors: ackResult.errors,
        });

        // TODO: Match acknowledgment to claim and update status
        // This requires:
        // 1. Storing office_ally_control_number in claims table (already done)
        // 2. Querying claims by control number
        // 3. Updating claim status based on acknowledgment result

        /*
        Example logic:

        const claim = await findClaimByControlNumber(ackResult.transactionControlNumber);

        if (claim) {
          if (ackResult.accepted) {
            await updateClaimStatus(claim.id, 'accepted');
          } else {
            await updateClaimStatus(claim.id, 'rejected');
          }

          await recordSubmission(claim.id, {
            method: 'sftp',
            status: ackResult.accepted ? 'success' : 'failed',
            errorMessage: ackResult.errors?.map(e => e.errorDescription).join(', '),
            officeAllyResponse: ackResult,
          });
        }
        */
      } catch (parseError) {
        logger.error('Error processing acknowledgment', {
          fileName: result.fileName,
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
        });

        errors.push({
          fileName: result.fileName,
          error: parseError instanceof Error ? parseError.message : 'Processing error',
        });
      }
    }

    logger.info('Acknowledgment download complete', {
      totalFiles: downloadResults.length,
      processed: processedAcknowledgments.length,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        totalFiles: downloadResults.length,
        processed: processedAcknowledgments.length,
        acknowledgments: processedAcknowledgments,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    logger.error('Error downloading acknowledgments', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to download acknowledgments',
          code: 'DOWNLOAD_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

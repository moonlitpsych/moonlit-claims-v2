/**
 * API endpoint for downloading and processing 277 claim status files from Office Ally SFTP
 * This replaces the REALTIME API approach (which returned 502)
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseMultiple277Files, mapStatusToClaimStatus } from '@/services/officeAlly/claimStatusParser';
import { addStatusUpdate, getClaims, updateClaimStatus } from '@/services/supabase/claimsService';
import { logger } from '@/utils/logger';

// Force Node.js runtime (not Edge) to support native modules
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    logger.info('Starting 277 claim status update process');

    // Step 1: Dynamic import of SFTP client to avoid webpack bundling issues
    const { officeAllySFTP } = await import('@/services/officeAlly/sftpClient');

    // Step 2: Download 277 files from SFTP /outbound
    logger.info('Downloading 277 files from Office Ally SFTP');
    const downloadResults = await officeAllySFTP.downloadClaimStatusResponses();

    const successfulDownloads = downloadResults.filter(r => r.success && r.content);

    logger.info('Downloaded 277 files', {
      total: downloadResults.length,
      successful: successfulDownloads.length,
    });

    if (successfulDownloads.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'No 277 files found to process',
          filesDownloaded: 0,
          claimsUpdated: 0,
        },
      });
    }

    // Step 2: Parse all 277 files
    logger.info('Parsing 277 files');
    const parsedStatuses = parseMultiple277Files(
      successfulDownloads.map(d => ({
        fileName: d.fileName!,
        content: d.content!,
      }))
    );

    logger.info('Parsed claim statuses', {
      totalStatuses: parsedStatuses.length,
    });

    // Step 3: Match parsed statuses to our claims in database
    logger.info('Fetching claims from database');
    const claimsResult = await getClaims({});

    if (!claimsResult.success || !claimsResult.claims) {
      logger.error('Failed to fetch claims from database');
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Failed to fetch claims from database',
            code: 'DATABASE_ERROR',
          },
        },
        { status: 500 }
      );
    }

    const claims = claimsResult.claims;

    logger.info('Matching statuses to claims', {
      claimCount: claims.length,
      statusCount: parsedStatuses.length,
    });

    // Step 4: Update claim statuses
    let updatedCount = 0;
    const matchedStatuses: any[] = [];

    for (const status of parsedStatuses) {
      // Try to match by claim identifier
      // The claim identifier in 277 should match our claim ID or control number
      const matchingClaim = claims.find(
        c =>
          c.id === status.claimIdentifier ||
          c.office_ally_control_number === status.claimIdentifier ||
          c.id === status.patientControlNumber
      );

      if (matchingClaim) {
        // Update claim status
        const newStatus = mapStatusToClaimStatus(status.statusCode);

        logger.info('Matched status to claim', {
          claimId: matchingClaim.id,
          statusCode: status.statusCode,
          newStatus,
        });

        // Add status update record
        await addStatusUpdate(matchingClaim.id, {
          status: status.claimStatus || 'Unknown',
          statusCode: status.statusCode,
          statusCategory: newStatus,
          statusDate: new Date(),
          payerClaimNumber: status.payerClaimNumber,
          transactionType: '277',
          remitData: {
            raw277: status.rawContent,
            statusDescription: status.statusDescription,
            serviceDate: status.serviceDate,
          },
        });

        // Update main claim status if significant change
        if (['accepted', 'rejected', 'paid'].includes(newStatus)) {
          await updateClaimStatus(matchingClaim.id, newStatus as any);
        }

        updatedCount++;
        matchedStatuses.push({
          claimId: matchingClaim.id,
          statusCode: status.statusCode,
          status: status.claimStatus,
        });
      } else {
        logger.warn('Could not match 277 status to claim', {
          claimIdentifier: status.claimIdentifier,
          patientControlNumber: status.patientControlNumber,
        });
      }
    }

    logger.info('Claim status update complete', {
      filesProcessed: successfulDownloads.length,
      statusesParsed: parsedStatuses.length,
      claimsUpdated: updatedCount,
    });

    return NextResponse.json({
      success: true,
      data: {
        filesDownloaded: successfulDownloads.length,
        statusesParsed: parsedStatuses.length,
        claimsUpdated: updatedCount,
        matchedStatuses: matchedStatuses.slice(0, 10), // Return first 10 for preview
      },
    });
  } catch (error) {
    logger.error('Error processing 277 status updates', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to process 277 status updates',
          code: 'PROCESSING_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

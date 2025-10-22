/**
 * API endpoint for checking claim status via Office Ally 276/277 transactions
 */

import { NextRequest, NextResponse } from 'next/server';
import { officeAllyRealtime } from '@/services/officeAlly/realtimeClient';
import { getClaim, addStatusUpdate } from '@/services/supabase/claimsService';
import { logger } from '@/utils/logger';

// Force Node.js runtime (not Edge) to support native modules
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(
  request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const claimId = params.claimId;

    logger.info('Claim status check requested', { claimId });

    // Fetch claim from database
    const claimResult = await getClaim(claimId);

    if (!claimResult.success || !claimResult.claim) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Claim not found',
            code: 'CLAIM_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    const claim = claimResult.claim;

    // Build 276 request from claim data
    const statusRequest = {
      claimId: claim.id,
      patientFirstName: claim.patient_first_name,
      patientLastName: claim.patient_last_name,
      patientDateOfBirth: claim.patient_date_of_birth,
      subscriberMemberId: claim.insurance_info.memberId,
      providerNPI: claim.rendering_provider_id || '1275348807', // Default to Moonlit NPI
      payerId: claim.insurance_info.carrier, // This should be Office Ally Payer ID
      dateOfService: claim.service_lines[0]?.dateOfService || claim.created_at,
      claimAmount: claim.total_charge_amount.toString(),
    };

    // Submit 276 inquiry to Office Ally
    const statusResponse = await officeAllyRealtime.checkClaimStatus(statusRequest);

    if (!statusResponse.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Failed to check claim status',
            code: 'STATUS_CHECK_FAILED',
            details: statusResponse.error,
          },
        },
        { status: 500 }
      );
    }

    // Record status update in database
    await addStatusUpdate(claim.id, {
      status: statusResponse.claimStatus || 'Unknown',
      statusCode: statusResponse.statusCode,
      statusCategory: mapStatusCategory(statusResponse.statusCode),
      statusDate: new Date(),
      payerClaimNumber: statusResponse.payerClaimNumber,
      transactionType: '277',
      remitData: {
        raw277: statusResponse.raw277,
        statusDescription: statusResponse.statusDescription,
      },
    });

    logger.info('Claim status updated', {
      claimId: claim.id,
      status: statusResponse.claimStatus,
    });

    return NextResponse.json({
      success: true,
      data: {
        claimId: claim.id,
        status: statusResponse.claimStatus,
        statusCode: statusResponse.statusCode,
        statusDescription: statusResponse.statusDescription,
        payerClaimNumber: statusResponse.payerClaimNumber,
        serviceDate: statusResponse.serviceDate,
        lastChecked: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error checking claim status', {
      claimId: params.claimId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to check claim status',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Map 277 status codes to claim status categories
 */
function mapStatusCategory(statusCode?: string): string {
  if (!statusCode) return 'unknown';

  const code = statusCode.toUpperCase();

  // Status codes from X12 277
  if (code === 'A1' || code === 'A2') return 'acknowledged';
  if (code === 'A3' || code === 'P4') return 'rejected';
  if (code === 'A4') return 'not_found';
  if (code === 'A6' || code === 'P5') return 'pending';
  if (code === 'A7' || code.startsWith('P1') || code.startsWith('P2') || code.startsWith('P3'))
    return 'accepted';
  if (code === 'A8') return 'reversed';

  return 'unknown';
}

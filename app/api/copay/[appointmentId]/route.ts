/**
 * Copay Status API Route
 * GET /api/copay/[appointmentId] - Get copay status for an appointment
 * Combines eligibility data (expected copay) with IntakeQ invoice data (payment status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { intakeqInvoiceService } from '@/services/intakeq/invoices';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import { CopayStatus } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { appointmentId: string } }
) {
  try {
    const { appointmentId } = params;

    // Get clientId from query params (will be provided by frontend)
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    logger.info('Copay status requested', { appointmentId, clientId });

    // Step 1: Skip database caching for now (table doesn't exist yet)
    // TODO: Re-enable once database migration is run

    // Step 2: Fetch fresh data from IntakeQ Invoice API (now with clientId)
    const invoicesResponse = await intakeqInvoiceService.getInvoicesByAppointment(appointmentId, clientId || undefined);

    if (!invoicesResponse.success) {
      logger.error('Failed to fetch invoices', {
        appointmentId,
        error: invoicesResponse.error,
      });

      // Return unknown status if we can't fetch invoice data
      return NextResponse.json({
        success: true,
        data: {
          appointmentId,
          paymentStatus: 'unknown' as CopayStatus,
          expectedCopayAmount: undefined,
          lastSyncedAt: new Date().toISOString(),
          cached: false,
        },
      });
    }

    const invoice = invoicesResponse.data && invoicesResponse.data.length > 0
      ? invoicesResponse.data[0]
      : null;

    // Step 3: Get expected copay from eligibility check (if exists)
    // TODO: Query eligibility checks once database is set up
    let expectedCopay: number | undefined = undefined;
    let eligibilityCheckId: string | undefined = undefined;

    // Step 4: Determine copay status
    const paymentStatus = intakeqInvoiceService.determineCopayStatus(invoice, expectedCopay);
    const actualCopayAmount = intakeqInvoiceService.getCopayAmount(invoice);
    const paymentDate = intakeqInvoiceService.getPaymentDate(invoice);

    // Step 5: Skip database updates for now (table doesn't exist yet)
    // TODO: Re-enable once database migration is run

    logger.info('Copay status updated', {
      appointmentId,
      paymentStatus,
      expectedCopay,
      actualCopay: actualCopayAmount,
    });

    // Step 6: Return fresh copay status
    return NextResponse.json({
      success: true,
      data: {
        appointmentId,
        paymentStatus,
        expectedCopayAmount: expectedCopay,
        actualCopayAmount,
        paymentDate,
        invoiceId: invoice?.Id,
        lastSyncedAt: new Date().toISOString(),
        cached: false,
      },
    });
  } catch (error) {
    logger.error('Copay status API error', {
      appointmentId: params.appointmentId,
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

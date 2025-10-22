/**
 * IntakeQ Invoice API Service
 * Handles invoice-related interactions with IntakeQ API
 * Documentation: https://support.intakeq.com/article/385-intakeq-invoice-api
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';
import type { IntakeQInvoice, CopayStatus, APIResponse } from '@/types';

class IntakeQInvoiceService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.INTAKEQ_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('INTAKEQ_API_KEY environment variable is required');
    }

    this.client = axios.create({
      baseURL: 'https://intakeq.com/api/v1',
      headers: {
        'X-Auth-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.info('IntakeQ Invoice API request', {
        method: config.method,
        url: config.url,
        params: config.params,
      });
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('IntakeQ Invoice API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('IntakeQ Invoice API error', {
          message: error.message,
          status: error.response?.status,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Fetch invoices for a specific appointment
   * NOTE: IntakeQ API doesn't support filtering by appointmentId directly.
   * We need to fetch by clientId and then check line items for appointment references.
   * @param appointmentId IntakeQ appointment ID
   * @param clientId IntakeQ client ID (required for filtering)
   * @returns Array of invoices (typically 0 or 1 per appointment)
   */
  async getInvoicesByAppointment(appointmentId: string, clientId?: string): Promise<APIResponse<IntakeQInvoice[]>> {
    try {
      // If we don't have clientId, we can't fetch invoices efficiently
      if (!clientId) {
        logger.warn('No clientId provided for invoice lookup', { appointmentId });
        return {
          success: true,
          data: [],
        };
      }

      // Fetch all invoices for this client
      const response = await this.client.get('/invoices', {
        params: {
          clientId: clientId,
        },
      });

      // IntakeQ returns array of invoices
      let invoices = Array.isArray(response.data) ? response.data : [];

      logger.info('Fetched client invoices from IntakeQ', {
        clientId,
        totalCount: invoices.length,
        appointmentId,
      });

      // Log all invoices to see structure (debugging)
      if (invoices.length > 0) {
        // Check all invoices for copay items
        const invoicesWithCopay = invoices.filter(inv => {
          if (inv.Items && Array.isArray(inv.Items)) {
            return inv.Items.some((item: any) => item.IsCopay === true);
          }
          return false;
        });

        logger.info('Invoice summary for client', {
          totalInvoices: invoices.length,
          invoicesWithCopay: invoicesWithCopay.length,
          firstInvoiceId: invoices[0].Id,
          firstInvoiceStatus: invoices[0].Status,
          hasItems: !!invoices[0].Items,
          itemsCount: invoices[0].Items?.length || 0,
        });

        // Log all Items from all invoices to find copays
        invoices.forEach((inv, idx) => {
          if (inv.Items && Array.isArray(inv.Items)) {
            const copayItems = inv.Items.filter((item: any) => item.IsCopay === true);
            const allItems = inv.Items.map((item: any) => ({
              Description: item.Description,
              Price: item.Price,
              IsCopay: item.IsCopay,
              AppointmentId: item.AppointmentId
            }));
            logger.info(`Invoice ${idx + 1} items`, {
              invoiceId: inv.Id,
              totalItems: inv.Items.length,
              copayItems: copayItems.length,
              allItems: JSON.stringify(allItems, null, 2)
            });
          }
        });
      }

      // Filter invoices to find those that contain line items for this appointment
      const appointmentInvoices = invoices.filter(invoice => {
        // Check if any line item references this appointment
        if (invoice.LineItems && Array.isArray(invoice.LineItems)) {
          return invoice.LineItems.some(item =>
            item.AppointmentId === appointmentId ||
            // Also check if the description contains appointment reference
            (item.Description && item.Description.includes(appointmentId))
          );
        }

        // Also check if the invoice itself has an AppointmentId field (some versions might)
        if (invoice.AppointmentId === appointmentId) {
          return true;
        }

        // Check if invoice has Items array (alternative to LineItems)
        if (invoice.Items && Array.isArray(invoice.Items)) {
          return invoice.Items.some(item =>
            item.AppointmentId === appointmentId ||
            (item.Description && item.Description.includes(appointmentId))
          );
        }

        return false;
      });

      logger.info('Filtered invoices for appointment', {
        appointmentId,
        clientId,
        totalInvoices: invoices.length,
        matchingInvoices: appointmentInvoices.length,
      });

      return {
        success: true,
        data: appointmentInvoices,
      };
    } catch (error) {
      return this.handleError('Failed to fetch invoices', error);
    }
  }

  /**
   * Fetch invoices for a specific client
   * @param clientId IntakeQ client ID
   * @returns Array of invoices for the client
   */
  async getInvoicesByClient(clientId: string): Promise<APIResponse<IntakeQInvoice[]>> {
    try {
      const response = await this.client.get('/invoices', {
        params: {
          clientId,
        },
      });

      const invoices = Array.isArray(response.data) ? response.data : [];

      logger.info('Fetched client invoices from IntakeQ', {
        clientId,
        count: invoices.length,
      });

      return {
        success: true,
        data: invoices,
      };
    } catch (error) {
      return this.handleError('Failed to fetch client invoices', error);
    }
  }

  /**
   * Get single invoice by ID
   * @param invoiceId IntakeQ invoice ID
   */
  async getInvoice(invoiceId: string): Promise<APIResponse<IntakeQInvoice>> {
    try {
      const response = await this.client.get(`/invoices/${invoiceId}`);

      logger.info('Fetched invoice from IntakeQ', {
        invoiceId,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError('Failed to fetch invoice', error);
    }
  }

  /**
   * Determine copay payment status from invoice
   * Looks for copay line items in invoice and checks if paid
   * @param invoice IntakeQ invoice object
   * @param expectedCopay Expected copay amount from eligibility check
   * @returns Copay status
   */
  determineCopayStatus(invoice: IntakeQInvoice | null, expectedCopay?: number): CopayStatus {
    // No invoice found
    if (!invoice) {
      if (expectedCopay === 0) {
        return 'not_required' as CopayStatus;
      }
      return 'unknown' as CopayStatus;
    }

    // Look for copay in Items array (using IsCopay flag)
    let copayItem = null;
    if (invoice.Items && Array.isArray(invoice.Items)) {
      copayItem = invoice.Items.find((item: any) => item.IsCopay === true);
    }

    // Also check LineItems for backward compatibility
    if (!copayItem && invoice.LineItems && Array.isArray(invoice.LineItems)) {
      copayItem = invoice.LineItems.find((item) =>
        item.Description?.toLowerCase().includes('copay') || item.IsCopay === true
      );
    }

    // No copay line item found
    if (!copayItem) {
      // If we expect a copay but don't see it, status is unknown
      if (expectedCopay && expectedCopay > 0) {
        return 'unknown' as CopayStatus;
      }
      // No copay expected and no copay in invoice
      return 'not_required' as CopayStatus;
    }

    // Copay line item exists - check if invoice is paid
    // In IntakeQ, if the invoice status is "Paid" and there's a copay item, the copay is paid
    if (invoice.Status === 'Paid') {
      return 'paid' as CopayStatus;
    } else if (invoice.AmountDue > 0) {
      return 'owed' as CopayStatus;
    } else {
      return 'unknown' as CopayStatus;
    }
  }

  /**
   * Get copay amount from invoice
   * @param invoice IntakeQ invoice object
   * @returns Copay amount or undefined
   */
  getCopayAmount(invoice: IntakeQInvoice | null): number | undefined {
    if (!invoice) {
      return undefined;
    }

    // Check Items array first (using IsCopay flag)
    if (invoice.Items && Array.isArray(invoice.Items)) {
      const copayItem = invoice.Items.find((item: any) => item.IsCopay === true);
      if (copayItem) {
        return copayItem.Price || copayItem.TotalAmount;
      }
    }

    // Check LineItems for backward compatibility
    if (invoice.LineItems && Array.isArray(invoice.LineItems)) {
      const copayItem = invoice.LineItems.find((item) =>
        item.Description?.toLowerCase().includes('copay') || item.IsCopay === true
      );
      if (copayItem) {
        return copayItem.Amount || copayItem.Price;
      }
    }

    return undefined;
  }

  /**
   * Check if copay is paid
   * @param invoice IntakeQ invoice object
   * @returns True if copay is paid, false otherwise
   */
  isCopayPaid(invoice: IntakeQInvoice | null): boolean {
    if (!invoice || !invoice.LineItems) {
      return false;
    }

    const copayItem = invoice.LineItems.find((item) =>
      item.Description.toLowerCase().includes('copay')
    );

    return copayItem?.Paid ?? false;
  }

  /**
   * Get payment date from invoice
   * @param invoice IntakeQ invoice object
   * @returns Payment date string or undefined
   */
  getPaymentDate(invoice: IntakeQInvoice | null): string | undefined {
    if (!invoice) {
      return undefined;
    }

    // If invoice status is paid and has a paid date
    if (invoice.Status === 'Paid' && invoice.PaidDate) {
      return invoice.PaidDate;
    }

    // If partially paid, we don't have a specific copay payment date
    // Return undefined (could be enhanced if IntakeQ provides line-item payment dates)
    return undefined;
  }

  /**
   * Generic error handler
   */
  private handleError(message: string, error: any): APIResponse<never> {
    const isRetryable = error.response?.status >= 500 || error.code === 'ETIMEDOUT';

    return {
      success: false,
      error: {
        message,
        code: error.response?.status?.toString() || error.code,
        retryable: isRetryable,
      },
    };
  }
}

// Export singleton instance
export const intakeqInvoiceService = new IntakeQInvoiceService();

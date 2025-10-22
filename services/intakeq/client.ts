/**
 * IntakeQ API Client
 * Handles all interactions with IntakeQ APIs
 *
 * Documentation:
 * - Appointments API: https://support.intakeq.com/article/204-intakeq-appointments-api
 * - Clients API: https://support.intakeq.com/article/251-intakeq-client-api
 * - Notes API: https://support.intakeq.com/article/342-intakeq-notes-api
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';
import type {
  IntakeQAppointment,
  IntakeQClient,
  IntakeQNote,
  APIResponse,
} from '@/types';

class IntakeQService {
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
      logger.debug('IntakeQ API request', {
        method: config.method,
        url: config.url,
      });
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('IntakeQ API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('IntakeQ API error', {
          message: error.message,
          status: error.response?.status,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Fetch appointments with optional filters
   */
  async getAppointments(params?: {
    startDate?: string; // ISO 8601 format
    endDate?: string;
    practitionerId?: string;
    clientId?: string;
  }): Promise<APIResponse<IntakeQAppointment[]>> {
    try {
      const response = await this.client.get('/appointments', { params });

      // IntakeQ returns array directly, not nested under 'appointments' key
      const appointments = Array.isArray(response.data) ? response.data : [];

      logger.info('Fetched appointments from IntakeQ', {
        count: appointments.length,
      });

      return {
        success: true,
        data: appointments,
      };
    } catch (error) {
      return this.handleError('Failed to fetch appointments', error);
    }
  }

  /**
   * Fetch single appointment by ID
   */
  async getAppointment(appointmentId: string): Promise<APIResponse<IntakeQAppointment>> {
    try {
      const response = await this.client.get(`/appointments/${appointmentId}`);

      logger.info('Fetched appointment from IntakeQ', {
        appointmentId,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError('Failed to fetch appointment', error);
    }
  }

  /**
   * Fetch client (patient) information
   * Uses search endpoint with client ID as search parameter
   */
  async getClient(clientId: string | number): Promise<APIResponse<IntakeQClient>> {
    try {
      const response = await this.client.get('/clients', {
        params: {
          search: clientId.toString(),
          includeProfile: 'true',
        },
      });

      logger.info('Fetched client from IntakeQ', {
        clientId,
        count: response.data?.length || 0,
      });

      // Return first match (should be exact match by ID)
      if (response.data && response.data.length > 0) {
        return {
          success: true,
          data: response.data[0],
        };
      } else {
        return {
          success: false,
          error: {
            message: 'Client not found',
            code: 'NOT_FOUND',
          },
        };
      }
    } catch (error) {
      return this.handleError('Failed to fetch client', error);
    }
  }

  /**
   * Fetch clinical note
   */
  async getNote(noteId: string): Promise<APIResponse<IntakeQNote>> {
    try {
      const response = await this.client.get(`/notes/${noteId}`);

      logger.info('Fetched note from IntakeQ', {
        noteId,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError('Failed to fetch note', error);
    }
  }

  /**
   * Fetch all notes for a client
   */
  async getClientNotes(clientId: string): Promise<APIResponse<IntakeQNote[]>> {
    try {
      const response = await this.client.get(`/clients/${clientId}/notes`);

      logger.info('Fetched client notes from IntakeQ', {
        clientId,
        count: response.data.notes?.length || 0,
      });

      return {
        success: true,
        data: response.data.notes || [],
      };
    } catch (error) {
      return this.handleError('Failed to fetch client notes', error);
    }
  }

  /**
   * Fetch appointment-specific note
   * First searches for notes related to the appointment, then fetches the full note
   */
  async getAppointmentNote(appointmentId: string): Promise<APIResponse<IntakeQNote>> {
    try {
      // Step 1: Search for notes summary to find the note ID for this appointment
      const summaryResponse = await this.client.get('/notes/summary');

      logger.info('Fetched notes summary from IntakeQ', {
        count: summaryResponse.data?.length || 0,
      });

      // Find the note that matches this appointment ID
      const notes = Array.isArray(summaryResponse.data) ? summaryResponse.data : [];
      const matchingNote = notes.find((note: any) =>
        note.AppointmentId === appointmentId || note.appointmentId === appointmentId
      );

      if (!matchingNote) {
        return {
          success: false,
          error: {
            message: 'No note found for this appointment',
            code: 'NOT_FOUND',
          },
        };
      }

      // Step 2: Fetch the full note content using the note ID
      const noteId = matchingNote.Id || matchingNote.id;
      const noteResponse = await this.client.get(`/notes/${noteId}`);

      logger.info('Fetched full note content from IntakeQ', {
        appointmentId,
        noteId,
      });

      return {
        success: true,
        data: noteResponse.data,
      };
    } catch (error) {
      return this.handleError('Failed to fetch appointment note', error);
    }
  }

  /**
   * Fetch intake form data (patient demographics and insurance)
   */
  async getIntake(intakeId: string): Promise<APIResponse<any>> {
    try {
      const response = await this.client.get(`/intakes/${intakeId}`);

      logger.info('Fetched intake from IntakeQ', {
        intakeId,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return this.handleError('Failed to fetch intake', error);
    }
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
export const intakeqService = new IntakeQService();

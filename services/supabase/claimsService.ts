/**
 * Claims Service
 * Handles all claim database operations
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import { Claim, ClaimStatus, ValidationError } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export interface CreateClaimData {
  // IntakeQ References
  intakeqAppointmentId: string;
  intakeqClientId: string;
  intakeqPractitionerId: string;

  // Patient Information
  patientFirstName: string;
  patientLastName: string;
  patientDateOfBirth: string;
  patientAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  // Insurance Information
  insuranceInfo: {
    carrier: string;
    memberId: string;
    groupNumber?: string;
    subscriberFirstName: string;
    subscriberLastName: string;
    subscriberDateOfBirth: string;
    relationshipToSubscriber: string;
  };

  // Provider IDs
  renderingProviderId?: string;
  billingProviderId?: string;
  payerId?: string;

  // Clinical Information
  diagnosisCodes: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
  }>;

  serviceLines: Array<{
    cptCode: string;
    modifiers?: string[];
    units: number;
    chargeAmount: number;
    dateOfService: string;
  }>;

  // EDI Data
  ediContent?: string;
  ediFileName?: string;
  officeAllyControlNumber?: string;

  // AI Coding
  aiCodingUsed?: boolean;
  aiCodingDetails?: any;

  // Manual Overrides
  manualOverrides?: Record<string, any>;

  // Financial
  totalChargeAmount: number;

  // User
  createdBy?: string;
}

/**
 * Create a new claim in the database
 */
export async function createClaim(data: CreateClaimData): Promise<{ success: boolean; claimId?: string; error?: string }> {
  try {
    logger.info('Creating new claim', {
      appointmentId: data.intakeqAppointmentId,
      patientName: `${data.patientFirstName} ${data.patientLastName}`,
    });

    const { data: claim, error } = await supabase
      .from('claims')
      .insert({
        intakeq_appointment_id: data.intakeqAppointmentId,
        intakeq_client_id: data.intakeqClientId,
        intakeq_practitioner_id: data.intakeqPractitionerId,
        patient_first_name: data.patientFirstName,
        patient_last_name: data.patientLastName,
        patient_date_of_birth: data.patientDateOfBirth,
        patient_address: data.patientAddress,
        insurance_info: data.insuranceInfo,
        rendering_provider_id: data.renderingProviderId,
        billing_provider_id: data.billingProviderId,
        payer_id: data.payerId,
        diagnosis_codes: data.diagnosisCodes,
        service_lines: data.serviceLines,
        status: 'draft',
        edi_content: data.ediContent,
        edi_file_name: data.ediFileName,
        office_ally_control_number: data.officeAllyControlNumber,
        ai_coding_used: data.aiCodingUsed || false,
        ai_coding_details: data.aiCodingDetails,
        manual_overrides: data.manualOverrides,
        total_charge_amount: data.totalChargeAmount,
        created_by: data.createdBy,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create claim', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    logger.info('Claim created successfully', {
      claimId: claim.id,
    });

    return {
      success: true,
      claimId: claim.id,
    };
  } catch (error) {
    logger.error('Error creating claim', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create claim',
    };
  }
}

/**
 * Update claim status
 */
export async function updateClaimStatus(
  claimId: string,
  status: ClaimStatus,
  submissionDate?: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Updating claim status', {
      claimId,
      status,
    });

    const updateData: any = { status };
    if (submissionDate) {
      updateData.submission_date = submissionDate.toISOString();
    }

    const { error } = await supabase
      .from('claims')
      .update(updateData)
      .eq('id', claimId);

    if (error) {
      logger.error('Failed to update claim status', {
        claimId,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    logger.info('Claim status updated', {
      claimId,
      status,
    });

    return { success: true };
  } catch (error) {
    logger.error('Error updating claim status', {
      claimId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update status',
    };
  }
}

/**
 * Record a claim submission attempt
 */
export async function recordSubmission(
  claimId: string,
  submissionData: {
    method: 'sftp' | 'manual';
    status: 'pending' | 'success' | 'failed';
    sftpFileName?: string;
    sftpRemotePath?: string;
    errorMessage?: string;
    officeAllyResponse?: any;
  }
): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  try {
    logger.info('Recording claim submission', {
      claimId,
      method: submissionData.method,
      status: submissionData.status,
    });

    const { data, error } = await supabase
      .from('claim_submissions')
      .insert({
        claim_id: claimId,
        submission_method: submissionData.method,
        status: submissionData.status,
        sftp_file_name: submissionData.sftpFileName,
        sftp_remote_path: submissionData.sftpRemotePath,
        error_message: submissionData.errorMessage,
        office_ally_response: submissionData.officeAllyResponse,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to record submission', {
        claimId,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    logger.info('Submission recorded', {
      claimId,
      submissionId: data.id,
    });

    return {
      success: true,
      submissionId: data.id,
    };
  } catch (error) {
    logger.error('Error recording submission', {
      claimId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record submission',
    };
  }
}

/**
 * Add a status update from X12 transaction
 */
export async function addStatusUpdate(
  claimId: string,
  statusData: {
    status: string;
    statusCode?: string;
    statusCategory?: string;
    statusDate?: Date;
    payerClaimNumber?: string;
    rejectionReasonCode?: string;
    rejectionReasonDescription?: string;
    transactionType: string; // 277, 835, etc.
    remitData?: any;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Adding claim status update', {
      claimId,
      status: statusData.status,
      transactionType: statusData.transactionType,
    });

    const { error } = await supabase
      .from('claim_status_updates')
      .insert({
        claim_id: claimId,
        status: statusData.status,
        status_code: statusData.statusCode,
        status_category: statusData.statusCategory,
        status_date: statusData.statusDate?.toISOString(),
        payer_claim_number: statusData.payerClaimNumber,
        rejection_reason_code: statusData.rejectionReasonCode,
        rejection_reason_description: statusData.rejectionReasonDescription,
        transaction_type: statusData.transactionType,
        remit_data: statusData.remitData,
      });

    if (error) {
      logger.error('Failed to add status update', {
        claimId,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    logger.info('Status update added', {
      claimId,
      status: statusData.status,
    });

    // Update the main claim status if this is a significant status change
    if (statusData.statusCategory === 'accepted' || statusData.statusCategory === 'rejected') {
      await updateClaimStatus(claimId, statusData.statusCategory as ClaimStatus);
    }

    return { success: true };
  } catch (error) {
    logger.error('Error adding status update', {
      claimId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add status update',
    };
  }
}

/**
 * Get claim by ID
 */
export async function getClaim(claimId: string): Promise<{ success: boolean; claim?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('claims')
      .select('*, claim_submissions(*), claim_status_updates(*)')
      .eq('id', claimId)
      .single();

    if (error) {
      logger.error('Failed to fetch claim', {
        claimId,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      claim: data,
    };
  } catch (error) {
    logger.error('Error fetching claim', {
      claimId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch claim',
    };
  }
}

/**
 * Get all claims with optional filters
 */
export async function getClaims(filters?: {
  status?: ClaimStatus;
  startDate?: string;
  endDate?: string;
  practitionerId?: string;
}): Promise<{ success: boolean; claims?: any[]; error?: string }> {
  try {
    let query = supabase
      .from('claims')
      .select('*, claim_submissions(*), claim_status_updates(*)')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    if (filters?.practitionerId) {
      query = query.eq('intakeq_practitioner_id', filters.practitionerId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch claims', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      claims: data,
    };
  } catch (error) {
    logger.error('Error fetching claims', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch claims',
    };
  }
}

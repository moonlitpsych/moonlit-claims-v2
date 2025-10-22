/**
 * Claim Events Service
 * Implements event sourcing for claim lifecycle tracking
 * Based on FOLLOWING_CLAIMS.md specification
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role key for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Event types for claim lifecycle
 */
export enum ClaimEventType {
  // Claim lifecycle events
  CLAIM_CREATED = 'claim_created',
  CLAIM_VALIDATED = 'claim_validated',
  CLAIM_SUBMITTED = 'claim_submitted',
  CLAIM_EDITED = 'claim_edited',
  CLAIM_VOIDED = 'claim_voided',

  // X12 transaction events
  SUBMITTED_837 = 'submitted_837',
  ACK_999 = 'ack_999',
  REJECT_277CA = 'reject_277ca',
  ACCEPT_277CA = 'accept_277ca',
  STATUS_277 = 'status_277',
  REMIT_835_HEADER = 'remit_835_header',
  REMIT_835_DETAIL = 'remit_835_detail',

  // Office Ally specific events
  OA_FILE_UPLOADED = 'oa_file_uploaded',
  OA_BATCH_CREATED = 'oa_batch_created',
  OA_STATUS_CHECKED = 'oa_status_checked',

  // Manual events
  MANUAL_STATUS_UPDATE = 'manual_status_update',
  MANUAL_PAYMENT_POSTED = 'manual_payment_posted',
  NOTE_ADDED = 'note_added',
  CORRECTED_CLAIM_SUBMITTED = 'corrected_claim_submitted',
}

/**
 * Interface for claim event
 */
export interface ClaimEvent {
  id?: string;
  claim_id: string;
  event_type: ClaimEventType;
  occurred_at?: Date;
  details?: Record<string, any>;
  raw_file_id?: string;
  created_by?: string;
  hash_sha256?: string;
}

/**
 * Record a claim event with idempotency
 * Uses SHA256 hash to prevent duplicate events
 */
export async function recordClaimEvent(
  claimId: string,
  eventType: ClaimEventType,
  details: Record<string, any> = {},
  options: {
    occurredAt?: Date;
    rawFileId?: string;
    createdBy?: string;
  } = {}
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    // Call the database function
    const { data, error } = await supabase.rpc('record_claim_event', {
      p_claim_id: claimId,
      p_event_type: eventType,
      p_details: details,
      p_occurred_at: options.occurredAt || new Date().toISOString(),
      p_raw_file_id: options.rawFileId || null,
      p_created_by: options.createdBy || 'system',
    });

    if (error) {
      console.error('Error recording claim event:', error);
      return { success: false, error: error.message };
    }

    return { success: true, eventId: data };
  } catch (error) {
    console.error('Error recording claim event:', error);
    return { success: false, error: 'Failed to record event' };
  }
}

/**
 * Record claim submission event
 * Special handler for 837 submission with additional tracking
 */
export async function recordClaimSubmission(
  claimId: string,
  submissionDetails: {
    clm01: string;
    ediFileName?: string;
    officeAllyBatchId?: string;
    totalCharge: number;
    serviceLines: any[];
  }
): Promise<{ success: boolean; error?: string }> {
  return recordClaimEvent(
    claimId,
    ClaimEventType.SUBMITTED_837,
    {
      clm01: submissionDetails.clm01,
      edi_file_name: submissionDetails.ediFileName,
      oa_batch_id: submissionDetails.officeAllyBatchId,
      total_charge: submissionDetails.totalCharge,
      service_line_count: submissionDetails.serviceLines.length,
      submitted_at: new Date().toISOString(),
    },
    {
      createdBy: 'submission_service',
    }
  );
}

/**
 * Record status update from X12 277
 */
export async function record277StatusUpdate(
  claimId: string,
  statusData: {
    statusCode: string;
    statusDescription: string;
    statusCategory: string;
    payerClaimNumber?: string;
    pended?: boolean;
    actionCode?: string;
  },
  rawFileId?: string
): Promise<{ success: boolean; error?: string }> {
  // Store payer claim number if provided
  if (statusData.payerClaimNumber) {
    await supabase.rpc('upsert_payer_icn', {
      p_claim_id: claimId,
      p_icn: statusData.payerClaimNumber,
      p_id_type: 'ICN',
    });
  }

  return recordClaimEvent(
    claimId,
    ClaimEventType.STATUS_277,
    {
      status_code: statusData.statusCode,
      status_description: statusData.statusDescription,
      status_category: statusData.statusCategory,
      payer_claim_number: statusData.payerClaimNumber,
      pended: statusData.pended || false,
      action_code: statusData.actionCode,
    },
    {
      rawFileId,
      createdBy: 'status_update_service',
    }
  );
}

/**
 * Record ERA remittance event
 */
export async function record835RemittanceEvent(
  claimId: string,
  remittanceData: {
    payerICN: string;
    claimStatusCode: string;
    paidAmount: number;
    patientResponsibility: number;
    chargeAmount: number;
    adjustments?: any[];
  },
  rawFileId?: string
): Promise<{ success: boolean; error?: string }> {
  // Store payer ICN
  if (remittanceData.payerICN) {
    await supabase.rpc('upsert_payer_icn', {
      p_claim_id: claimId,
      p_icn: remittanceData.payerICN,
      p_id_type: 'ICN',
    });
  }

  return recordClaimEvent(
    claimId,
    ClaimEventType.REMIT_835_DETAIL,
    {
      payer_icn: remittanceData.payerICN,
      claim_status_code: remittanceData.claimStatusCode,
      paid_amount: remittanceData.paidAmount,
      patient_responsibility: remittanceData.patientResponsibility,
      charge_amount: remittanceData.chargeAmount,
      adjustments: remittanceData.adjustments,
      payment_posted_at: new Date().toISOString(),
    },
    {
      rawFileId,
      createdBy: 'era_processor',
    }
  );
}

/**
 * Get claim events timeline
 */
export async function getClaimEvents(
  claimId: string
): Promise<{ success: boolean; events?: ClaimEvent[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('claim_events')
      .select('*')
      .eq('claim_id', claimId)
      .order('occurred_at', { ascending: false });

    if (error) {
      console.error('Error fetching claim events:', error);
      return { success: false, error: error.message };
    }

    return { success: true, events: data || [] };
  } catch (error) {
    console.error('Error fetching claim events:', error);
    return { success: false, error: 'Failed to fetch events' };
  }
}

/**
 * Derive current claim status from events
 * Calls database function that implements precedence logic
 */
export async function deriveClaimStatus(
  claimId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('derive_claim_status', {
      p_claim_id: claimId,
    });

    if (error) {
      console.error('Error deriving claim status:', error);
      return { success: false, error: error.message };
    }

    return { success: true, status: data };
  } catch (error) {
    console.error('Error deriving claim status:', error);
    return { success: false, error: 'Failed to derive status' };
  }
}

/**
 * Store claim identifier from external system
 */
export async function storeClaimIdentifier(
  claimId: string,
  system: 'payer' | 'oa' | 'internal' | 'intakeq',
  idType: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('claim_identifiers').insert({
      claim_id: claimId,
      system,
      id_type: idType,
      value,
    });

    if (error && !error.message.includes('duplicate')) {
      console.error('Error storing claim identifier:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error storing claim identifier:', error);
    return { success: false, error: 'Failed to store identifier' };
  }
}

/**
 * Generate CLM01 (Patient Control Number)
 * Calls database function that ensures uniqueness
 */
export async function generateCLM01(): Promise<{
  success: boolean;
  clm01?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('generate_clm01');

    if (error) {
      console.error('Error generating CLM01:', error);
      return { success: false, error: error.message };
    }

    return { success: true, clm01: data };
  } catch (error) {
    console.error('Error generating CLM01:', error);
    return { success: false, error: 'Failed to generate CLM01' };
  }
}
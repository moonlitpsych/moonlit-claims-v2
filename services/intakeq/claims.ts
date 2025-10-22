/**
 * IntakeQ Claims API Service
 * Fetches existing claims from IntakeQ to backfill our database
 */

import { logger } from '@/utils/logger';
import { ClaimStatus } from '@/types';

const INTAKEQ_BASE_URL = 'https://intakeq.com/api/v1';

// Get API key dynamically to support dotenv loading
function getApiKey(): string {
  const key = process.env.INTAKEQ_API_KEY || '';
  if (!key) {
    logger.warn('INTAKEQ_API_KEY not configured');
  }
  return key;
}

/**
 * IntakeQ Claim Status Mapping
 * Maps IntakeQ status codes to our ClaimStatus enum
 */
export const INTAKEQ_STATUS_MAP: Record<number, ClaimStatus> = {
  0: ClaimStatus.DRAFT,           // Draft
  1: ClaimStatus.VALIDATED,       // Validated
  2: ClaimStatus.SUBMITTED,       // Submitted
  4: ClaimStatus.REJECTED,        // Rejected
  5: ClaimStatus.REJECTED,        // Denied (map to rejected)
  6: ClaimStatus.PAID,            // Paid
  7: ClaimStatus.ACCEPTED,        // Deductible (map to accepted - claim was accepted, just applied to deductible)
  10: ClaimStatus.REJECTED,       // Canceled (map to rejected)
  100: ClaimStatus.ACCEPTED,      // Acknowledged (map to accepted)
  101: ClaimStatus.SUBMITTED,     // Processing (map to submitted)
  102: ClaimStatus.SUBMITTED,     // Pending (map to submitted)
  103: ClaimStatus.REJECTED,      // NotFound (map to rejected)
  104: ClaimStatus.ACCEPTED,      // Adjudicated (map to accepted)
  105: ClaimStatus.SUBMITTED,     // AdditionalInfoRequested (map to submitted)
};

/**
 * IntakeQ Status Names (for display/logging)
 */
export const INTAKEQ_STATUS_NAMES: Record<number, string> = {
  0: 'Draft',
  1: 'Validated',
  2: 'Submitted',
  4: 'Rejected',
  5: 'Denied',
  6: 'Paid',
  7: 'Deductible',
  10: 'Canceled',
  100: 'Acknowledged',
  101: 'Processing',
  102: 'Pending',
  103: 'NotFound',
  104: 'Adjudicated',
  105: 'AdditionalInfoRequested',
};

/**
 * IntakeQ Claim Object (actual API response format)
 */
export interface IntakeQClaim {
  // IDs and Status
  PractitionerId: string;
  Status: number;
  PatientAccountNumber: string; // This is the claim ID/control number

  // Patient info
  PatientFirstName: string;
  PatientMiddleInitial?: string;
  PatientLastName: string;
  PatientDateOfBirth: number; // Unix timestamp in milliseconds
  PatientGender: string;
  PatientStreetAddress: string;
  PatientCity: string;
  PatientState: string;
  PatientZip: string;
  PatientPhoneAreaCode: string;
  PatientPhoneNumber: string;

  // Payer info
  PayerName: string;

  // Insured info
  InsuredFirstName: string;
  InsuredMiddleInitial?: string;
  InsuredLastName: string;
  InsuredDateOfBirth: number; // Unix timestamp
  InsuredGender: string;
  InsuredId: string; // Member ID
  InsuredGroupId?: string;
  InsurancePlanName?: string;
  ClientRelationshipToInsured?: string;

  // Provider
  ProviderNpi: string;
  RenderingProviderNpi?: string;

  // Diagnosis codes (array)
  Diagnosis: string[];

  // Service lines (array of procedures)
  Procedures: Array<{
    Date: number; // Unix timestamp
    AppointmentId: string; // Links to appointment!
    PlaceOfService: string;
    Procedure: string; // CPT code
    Modifiers: string[];
    Diagnosis: string[];
    Charges: number;
    Units: number;
    Npi: string;
  }>;

  // Other fields we might need
  TaxId?: string;
  AcceptAssignment?: boolean;
}

/**
 * Fetch claims from IntakeQ
 */
export async function fetchIntakeQClaims(params?: {
  clientId?: string;
  startDate?: string; // yyyy-MM-dd
  endDate?: string; // yyyy-MM-dd
  page?: number;
}): Promise<{ success: boolean; claims?: IntakeQClaim[]; error?: string }> {
  try {
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (params?.clientId) queryParams.append('clientId', params.clientId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.page) queryParams.append('page', params.page.toString());

    const url = `${INTAKEQ_BASE_URL}/claims${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    logger.info('Fetching IntakeQ claims', {
      url,
      params,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Auth-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('IntakeQ Claims API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return {
        success: false,
        error: `IntakeQ API error: ${response.status} ${response.statusText}`,
      };
    }

    const claims: IntakeQClaim[] = await response.json();

    logger.info('Fetched IntakeQ claims', {
      count: claims.length,
    });

    return {
      success: true,
      claims,
    };
  } catch (error) {
    logger.error('Error fetching IntakeQ claims', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch claims',
    };
  }
}

/**
 * Map IntakeQ status to our ClaimStatus
 */
export function mapIntakeQStatus(intakeqStatus: number): ClaimStatus {
  return INTAKEQ_STATUS_MAP[intakeqStatus] || ClaimStatus.DRAFT;
}

/**
 * Get human-readable status name
 */
export function getIntakeQStatusName(intakeqStatus: number): string {
  return INTAKEQ_STATUS_NAMES[intakeqStatus] || 'Unknown';
}

/**
 * Fetch all claims with pagination
 */
export async function fetchAllIntakeQClaims(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<{ success: boolean; claims?: IntakeQClaim[]; error?: string }> {
  const allClaims: IntakeQClaim[] = [];
  let page = 1;
  let hasMore = true;

  logger.info('Fetching all IntakeQ claims with pagination', params);

  while (hasMore) {
    const result = await fetchIntakeQClaims({
      ...params,
      page,
    });

    if (!result.success) {
      return result;
    }

    if (result.claims && result.claims.length > 0) {
      allClaims.push(...result.claims);
      logger.info('Fetched page of claims', {
        page,
        count: result.claims.length,
        total: allClaims.length,
      });

      // IntakeQ returns max 100 per page
      if (result.claims.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  logger.info('Finished fetching all IntakeQ claims', {
    totalPages: page,
    totalClaims: allClaims.length,
  });

  return {
    success: true,
    claims: allClaims,
  };
}

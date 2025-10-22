/**
 * Validation Utilities
 * Common validation functions for claims data
 */

import { z } from 'zod';
import type { ValidationError } from '@/types';

/**
 * NPI Validator
 * National Provider Identifier must be exactly 10 digits
 */
export const isValidNPI = (npi: string): boolean => {
  return /^\d{10}$/.test(npi);
};

/**
 * ICD-10 Code Validator
 * Format: Letter followed by 2 digits, optional decimal and 1-4 more digits
 * Examples: F41.1, Z00.00, E11.9
 */
export const isValidICD10 = (code: string): boolean => {
  return /^[A-Z]\d{2}(\.\d{1,4})?$/.test(code);
};

/**
 * CPT Code Validator
 * 5-digit numeric code
 */
export const isValidCPT = (code: string): boolean => {
  return /^\d{5}$/.test(code);
};

/**
 * Date Validator
 * Accepts ISO 8601 format (YYYY-MM-DD)
 */
export const isValidDate = (date: string): boolean => {
  return !isNaN(Date.parse(date));
};

/**
 * ZIP Code Validator
 * 5 digits or 5+4 format
 */
export const isValidZipCode = (zip: string): boolean => {
  return /^\d{5}(-\d{4})?$/.test(zip);
};

/**
 * Phone Number Validator
 * Various formats accepted
 */
export const isValidPhone = (phone: string): boolean => {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Must be 10 or 11 digits (with optional country code)
  return digits.length === 10 || digits.length === 11;
};

/**
 * Member ID Validator
 * At least 1 character, alphanumeric
 */
export const isValidMemberId = (memberId: string): boolean => {
  return /^[A-Za-z0-9]+$/.test(memberId) && memberId.length > 0;
};

/**
 * Zod Schema for Patient Information
 */
export const PatientInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().refine(isValidDate, 'Invalid date format'),
  address: z.object({
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().length(2, 'State must be 2-letter code'),
    zip: z.string().refine(isValidZipCode, 'Invalid ZIP code'),
  }),
});

/**
 * Zod Schema for Insurance Information
 */
export const InsuranceInfoSchema = z.object({
  carrier: z.string().min(1, 'Insurance carrier is required'),
  memberId: z.string().refine(isValidMemberId, 'Invalid member ID'),
  groupId: z.string().optional(),
  subscriberFirstName: z.string().min(1, 'Subscriber first name is required'),
  subscriberLastName: z.string().min(1, 'Subscriber last name is required'),
  subscriberDateOfBirth: z.string().refine(isValidDate, 'Invalid date format'),
  relationshipToSubscriber: z.enum(['self', 'spouse', 'child', 'other']),
});

/**
 * Zod Schema for Service Line
 */
export const ServiceLineSchema = z.object({
  cptCode: z.string().refine(isValidCPT, 'Invalid CPT code'),
  modifiers: z.array(z.string()).optional(),
  units: z.number().min(1, 'Units must be at least 1'),
  chargeAmount: z.number().min(0, 'Charge amount must be positive'),
  dateOfService: z.string().refine(isValidDate, 'Invalid date format'),
  placeOfService: z.string().length(2, 'Place of service must be 2 digits'),
});

/**
 * Zod Schema for Diagnosis
 */
export const DiagnosisSchema = z.object({
  code: z.string().refine(isValidICD10, 'Invalid ICD-10 code'),
  description: z.string().min(1, 'Description is required'),
  isPrimary: z.boolean(),
});

/**
 * Comprehensive Claim Validation
 * Returns array of validation errors
 */
export const validateClaim = (claim: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate patient info
  try {
    PatientInfoSchema.parse(claim.patientInfo);
  } catch (err) {
    if (err instanceof z.ZodError) {
      err.errors.forEach((e) => {
        errors.push({
          field: `patientInfo.${e.path.join('.')}`,
          message: e.message,
          severity: 'error',
        });
      });
    }
  }

  // Validate insurance info
  try {
    InsuranceInfoSchema.parse(claim.insuranceInfo);
  } catch (err) {
    if (err instanceof z.ZodError) {
      err.errors.forEach((e) => {
        errors.push({
          field: `insuranceInfo.${e.path.join('.')}`,
          message: e.message,
          severity: 'error',
        });
      });
    }
  }

  // Validate service lines
  if (!claim.serviceLines || claim.serviceLines.length === 0) {
    errors.push({
      field: 'serviceLines',
      message: 'At least one service line is required',
      severity: 'error',
    });
  } else {
    claim.serviceLines.forEach((line: any, index: number) => {
      try {
        ServiceLineSchema.parse(line);
      } catch (err) {
        if (err instanceof z.ZodError) {
          err.errors.forEach((e) => {
            errors.push({
              field: `serviceLines[${index}].${e.path.join('.')}`,
              message: e.message,
              severity: 'error',
            });
          });
        }
      }
    });
  }

  // Validate diagnoses
  if (!claim.diagnosisCodes || claim.diagnosisCodes.length === 0) {
    errors.push({
      field: 'diagnosisCodes',
      message: 'At least one diagnosis is required',
      severity: 'error',
    });
  } else {
    const primaryDiagnoses = claim.diagnosisCodes.filter((d: any) => d.isPrimary);
    if (primaryDiagnoses.length === 0) {
      errors.push({
        field: 'diagnosisCodes',
        message: 'A primary diagnosis is required',
        severity: 'error',
      });
    }
    if (primaryDiagnoses.length > 1) {
      errors.push({
        field: 'diagnosisCodes',
        message: 'Only one primary diagnosis allowed',
        severity: 'error',
      });
    }

    claim.diagnosisCodes.forEach((diagnosis: any, index: number) => {
      try {
        DiagnosisSchema.parse(diagnosis);
      } catch (err) {
        if (err instanceof z.ZodError) {
          err.errors.forEach((e) => {
            errors.push({
              field: `diagnosisCodes[${index}].${e.path.join('.')}`,
              message: e.message,
              severity: 'error',
            });
          });
        }
      }
    });
  }

  // Validate provider NPIs
  if (!claim.renderingProviderId) {
    errors.push({
      field: 'renderingProviderId',
      message: 'Rendering provider is required',
      severity: 'error',
    });
  }

  if (!claim.billingProviderId) {
    errors.push({
      field: 'billingProviderId',
      message: 'Billing provider is required',
      severity: 'error',
    });
  }

  if (!claim.payerId) {
    errors.push({
      field: 'payerId',
      message: 'Payer is required',
      severity: 'error',
    });
  }

  return errors;
};

/**
 * Validate before submission
 * Stricter validation than draft validation
 */
export const validateForSubmission = (claim: any): ValidationError[] => {
  const errors = validateClaim(claim);

  // Additional submission-specific validations
  if (claim.claim_status !== 'validated') {
    errors.push({
      field: 'claim_status',
      message: 'Claim must be validated before submission',
      severity: 'error',
    });
  }

  // Ensure no validation errors exist
  if (claim.validationErrors && claim.validationErrors.length > 0) {
    errors.push({
      field: 'validationErrors',
      message: 'All validation errors must be resolved before submission',
      severity: 'error',
    });
  }

  return errors;
};

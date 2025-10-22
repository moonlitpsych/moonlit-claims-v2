/**
 * Claim Validation Service
 * Validates claim data before EDI generation
 * Includes Office Ally-specific rules and common rejection prevention
 */

import { ValidationError } from '@/types';

interface ClaimData {
  // Patient Info
  patientFirstName?: string;
  patientLastName?: string;
  patientDateOfBirth?: string;
  patientAddress?: string;
  patientCity?: string;
  patientState?: string;
  patientZip?: string;

  // Insurance Info
  insuranceCompany?: string;
  insuranceMemberId?: string;
  subscriberFirstName?: string;
  subscriberLastName?: string;
  subscriberDateOfBirth?: string;
  relationshipToInsured?: string;

  // Provider Info
  renderingProviderNPI?: string;
  billingProviderNPI?: string;

  // Service Info
  cptCode?: string;
  cptAddOnCode?: string;
  diagnosisCodes?: string[];
  dateOfService?: string;
  placeOfService?: string;
  charges?: string;
  units?: string;
}

/**
 * Comprehensive claim validation
 */
export function validateClaim(data: ClaimData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required Patient Fields
  if (!data.patientFirstName || data.patientFirstName.trim() === '') {
    errors.push({
      field: 'patientFirstName',
      message: 'Patient first name is required',
      severity: 'error',
    });
  }

  if (!data.patientLastName || data.patientLastName.trim() === '') {
    errors.push({
      field: 'patientLastName',
      message: 'Patient last name is required',
      severity: 'error',
    });
  }

  if (!data.patientDateOfBirth) {
    errors.push({
      field: 'patientDateOfBirth',
      message: 'Patient date of birth is required',
      severity: 'error',
    });
  } else if (!isValidDate(data.patientDateOfBirth)) {
    errors.push({
      field: 'patientDateOfBirth',
      message: 'Invalid date format (use YYYY-MM-DD)',
      severity: 'error',
    });
  }

  // Patient Address
  if (!data.patientAddress || data.patientAddress.trim() === '') {
    errors.push({
      field: 'patientAddress',
      message: 'Patient address is required',
      severity: 'error',
    });
  }

  if (!data.patientCity || data.patientCity.trim() === '') {
    errors.push({
      field: 'patientCity',
      message: 'Patient city is required',
      severity: 'error',
    });
  }

  if (!data.patientState) {
    errors.push({
      field: 'patientState',
      message: 'Patient state is required',
      severity: 'error',
    });
  } else if (!isValidState(data.patientState)) {
    errors.push({
      field: 'patientState',
      message: 'Invalid state code (use 2-letter abbreviation)',
      severity: 'error',
    });
  }

  if (!data.patientZip) {
    errors.push({
      field: 'patientZip',
      message: 'Patient ZIP code is required',
      severity: 'error',
    });
  } else if (!isValidZipCode(data.patientZip)) {
    errors.push({
      field: 'patientZip',
      message: 'Invalid ZIP code format (use 12345 or 12345-6789)',
      severity: 'error',
    });
  }

  // Required Insurance Fields
  if (!data.insuranceCompany || data.insuranceCompany.trim() === '') {
    errors.push({
      field: 'insuranceCompany',
      message: 'Insurance company is required',
      severity: 'error',
    });
  }

  if (!data.insuranceMemberId || data.insuranceMemberId.trim() === '') {
    errors.push({
      field: 'insuranceMemberId',
      message: 'Insurance member ID is required',
      severity: 'error',
    });
  }

  if (!data.subscriberFirstName || data.subscriberFirstName.trim() === '') {
    errors.push({
      field: 'subscriberFirstName',
      message: 'Subscriber first name is required',
      severity: 'error',
    });
  }

  if (!data.subscriberLastName || data.subscriberLastName.trim() === '') {
    errors.push({
      field: 'subscriberLastName',
      message: 'Subscriber last name is required',
      severity: 'error',
    });
  }

  if (!data.subscriberDateOfBirth) {
    errors.push({
      field: 'subscriberDateOfBirth',
      message: 'Subscriber date of birth is required',
      severity: 'error',
    });
  } else if (!isValidDate(data.subscriberDateOfBirth)) {
    errors.push({
      field: 'subscriberDateOfBirth',
      message: 'Invalid subscriber DOB format (use YYYY-MM-DD)',
      severity: 'error',
    });
  }

  if (!data.relationshipToInsured) {
    errors.push({
      field: 'relationshipToInsured',
      message: 'Relationship to insured is required',
      severity: 'error',
    });
  }

  // Provider NPIs
  if (!data.renderingProviderNPI) {
    errors.push({
      field: 'renderingProviderNPI',
      message: 'Rendering provider NPI is required',
      severity: 'error',
    });
  } else if (!isValidNPI(data.renderingProviderNPI)) {
    errors.push({
      field: 'renderingProviderNPI',
      message: 'Invalid NPI (must be 10 digits)',
      severity: 'error',
    });
  }

  if (!data.billingProviderNPI) {
    errors.push({
      field: 'billingProviderNPI',
      message: 'Billing provider NPI is required',
      severity: 'error',
    });
  } else if (!isValidNPI(data.billingProviderNPI)) {
    errors.push({
      field: 'billingProviderNPI',
      message: 'Invalid billing provider NPI (must be 10 digits)',
      severity: 'error',
    });
  }

  // Service Information
  if (!data.cptCode || data.cptCode.trim() === '') {
    errors.push({
      field: 'cptCode',
      message: 'CPT code is required',
      severity: 'error',
    });
  } else if (!isValidCPT(data.cptCode)) {
    errors.push({
      field: 'cptCode',
      message: 'Invalid CPT code (must be 5 digits)',
      severity: 'error',
    });
  }

  // Diagnosis codes
  if (!data.diagnosisCodes || data.diagnosisCodes.length === 0) {
    errors.push({
      field: 'diagnosisCodes',
      message: 'At least one diagnosis code is required',
      severity: 'error',
    });
  } else {
    data.diagnosisCodes.forEach((code, index) => {
      if (!isValidICD10(code)) {
        errors.push({
          field: `diagnosisCodes[${index}]`,
          message: `Invalid ICD-10 code: ${code}`,
          severity: 'error',
        });
      }
    });
  }

  // Date of Service
  if (!data.dateOfService) {
    errors.push({
      field: 'dateOfService',
      message: 'Date of service is required',
      severity: 'error',
    });
  } else if (!isValidDate(data.dateOfService)) {
    errors.push({
      field: 'dateOfService',
      message: 'Invalid date of service format (use YYYY-MM-DD)',
      severity: 'error',
    });
  }

  // Place of Service
  if (!data.placeOfService) {
    errors.push({
      field: 'placeOfService',
      message: 'Place of service is required',
      severity: 'error',
    });
  } else if (!isValidPlaceOfService(data.placeOfService)) {
    errors.push({
      field: 'placeOfService',
      message: 'Invalid place of service code (must be 2 digits)',
      severity: 'error',
    });
  }

  // Charges
  if (!data.charges) {
    errors.push({
      field: 'charges',
      message: 'Charges are required',
      severity: 'error',
    });
  } else if (!isValidAmount(data.charges)) {
    errors.push({
      field: 'charges',
      message: 'Invalid charge amount',
      severity: 'error',
    });
  }

  // Units
  if (!data.units) {
    errors.push({
      field: 'units',
      message: 'Units are required',
      severity: 'error',
    });
  } else if (!isValidUnits(data.units)) {
    errors.push({
      field: 'units',
      message: 'Invalid units (must be a positive number)',
      severity: 'error',
    });
  }

  // Warnings (non-blocking)
  if (data.cptAddOnCode && !isValidCPT(data.cptAddOnCode)) {
    errors.push({
      field: 'cptAddOnCode',
      message: 'Invalid add-on CPT code format',
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Validation helper functions
 */

function isValidDate(dateString: string): boolean {
  // YYYY-MM-DD format
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidState(state: string): boolean {
  // 2-letter state code
  return /^[A-Z]{2}$/.test(state);
}

function isValidZipCode(zip: string): boolean {
  // 12345 or 12345-6789
  return /^\d{5}(-\d{4})?$/.test(zip);
}

function isValidNPI(npi: string): boolean {
  // 10-digit number
  return /^\d{10}$/.test(npi);
}

function isValidCPT(cpt: string): boolean {
  // 5-digit code
  return /^\d{5}$/.test(cpt);
}

function isValidICD10(icd10: string): boolean {
  // Letter followed by 2 digits, optional decimal and 1-4 more digits
  // Examples: F41.1, Z79.4, E11.9
  return /^[A-Z]\d{2}(\.\d{1,4})?$/.test(icd10);
}

function isValidPlaceOfService(pos: string): boolean {
  // 2-digit code
  return /^\d{2}$/.test(pos);
}

function isValidAmount(amount: string): boolean {
  // Numeric value, optional decimal
  return /^\d+(\.\d{1,2})?$/.test(amount);
}

function isValidUnits(units: string): boolean {
  // Positive integer
  return /^\d+$/.test(units) && parseInt(units, 10) > 0;
}

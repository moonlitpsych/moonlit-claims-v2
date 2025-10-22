// Core type definitions for Moonlit Claims App

/**
 * Claim Status Enum
 * Represents the lifecycle of a claim from creation to payment
 */
export enum ClaimStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PAID = 'paid',
}

/**
 * IntakeQ Appointment
 * Data structure from IntakeQ Appointments API (actual response format)
 */
export interface IntakeQAppointment {
  Id: string;
  ClientId: number;
  ClientName: string;
  ClientEmail: string;
  ClientPhone: string;
  ClientDateOfBirth: string | null;
  ServiceId: string;
  ServiceName: string;
  PractitionerId: string;
  PractitionerName: string;
  PractitionerEmail: string;
  StartDate: number; // Unix timestamp
  EndDate: number; // Unix timestamp
  StartDateIso: string; // ISO 8601 format
  EndDateIso: string;
  StartDateLocal: string;
  EndDateLocal: string;
  StartDateLocalFormatted: string;
  Duration: number; // Minutes
  Status: 'Confirmed' | 'Completed' | 'Cancelled' | 'No-Show' | 'Scheduled';
  LocationId: string;
  LocationName: string;
  Price: number;
  PlaceOfService: string | null;
  IntakeId: string | null;
  DateCreated: number;
  CreatedBy: string;
  BookedByClient: boolean;
  InvoiceId: string | null;
  InvoiceNumber: string | null;
  ClientNote: string | null;
  PractitionerNote: string | null;
  TelehealthInfo: any;
  AttendanceConfirmationResponse: string;
  ReminderType: string;
  CustomFields: Array<{
    Name: string;
    Answer: string | null;
  }>;
  SessionStart: number | null;
  SessionEnd: number | null;
  ExternalClientId: string | null;
  ExternalPractitionerId: string | null;
  ExternalServiceId: string | null;
  LastModified: number;
  AdditionalClients: any[];
  FullCancellationReason: string;
  CancellationReasonNote: string | null;
  CancellationDate: string;
}

/**
 * IntakeQ Client (Patient)
 * Data structure from IntakeQ Clients API
 */
export interface IntakeQClient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  insurance?: {
    primary?: InsuranceInfo;
    secondary?: InsuranceInfo;
  };
  diagnoses?: Diagnosis[];
}

/**
 * Insurance Information
 */
export interface InsuranceInfo {
  carrier: string;
  memberId: string;
  groupId?: string;
  subscriberFirstName: string;
  subscriberLastName: string;
  subscriberDateOfBirth: string;
  relationshipToSubscriber: 'self' | 'spouse' | 'child' | 'other';
}

/**
 * Diagnosis with ICD-10 code
 */
export interface Diagnosis {
  code: string; // ICD-10 code (e.g., "F41.1")
  description: string;
  isPrimary: boolean;
}

/**
 * IntakeQ Note
 * Clinical note from IntakeQ Notes API (actual response format)
 */
export interface IntakeQNote {
  Id: string;
  ClientId: string;
  ClientName: string;
  ClientEmail: string;
  PractitionerId: string;
  PractitionerName: string;
  PractitionerEmail: string;
  Status: string;
  Date: string; // ISO date string
  NoteName: string;
  AppointmentId?: string; // Optional - present in full note
  Questions?: Array<{
    Id: string;
    Text: string;
    Answer: string | null;
    QuestionType: string;
    Rows: any[];
    ColumnNames: string[];
    OfficeUse: boolean;
    OfficeNote: string | null;
    Attachments?: Array<{
      Id: string;
      Url: string;
      ContentType: string;
      FileName: string;
    }>;
  }>;
}

/**
 * IntakeQ Intake (Patient Intake Form)
 * Contains full patient demographics and insurance from intake forms
 */
export interface IntakeQIntake {
  AppointmentId: string;
  Questions: IntakeQQuestion[];
}

export interface IntakeQQuestion {
  Id: string;
  Text: string | null;
  Answer: string | null;
  QuestionType: string;
  ClientProfileFieldId: string | null; // Key identifier for mapping (e.g., "FirstName", "PrimaryInsuranceCompany")
  Rows: any[];
  ColumnNames: string[];
  Attachments: any[];
  OfficeUse: boolean;
  OfficeNote: string | null;
}

/**
 * Provider Information
 * From Supabase providers table
 */
export interface Provider {
  id: string;
  name: string;
  npi: string;
  type: 'individual' | 'organization';
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  email?: string;
  isSupervising: boolean;
  isActive: boolean;
}

/**
 * Payer Information
 * From Supabase payers table
 */
export interface Payer {
  id: string;
  name: string;
  officeAllyPayerId837P: string; // For claim submissions
  officeAllyPayerId835?: string; // For remittance advice
  requiresSupervisingNPI: boolean; // Whether this payer requires supervising physician NPI
  isActive: boolean;
}

/**
 * Claim Data
 * Complete claim information for CMS-1500 / X12 837P
 */
export interface Claim {
  id: string;
  intakeqAppointmentId: string;
  intakeqClientId: string;
  intakeqPractitionerId: string;

  // Patient information (cached from IntakeQ)
  patientInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  };

  // Insurance information
  insuranceInfo: InsuranceInfo;

  // Providers
  renderingProviderId: string; // FK to providers table
  billingProviderId: string; // FK to providers table (usually Moonlit org)
  payerId: string; // FK to payers table

  // Clinical information
  diagnosisCodes: Diagnosis[];
  serviceLines: ServiceLine[];

  // Claim state
  status: ClaimStatus;
  submissionDate?: string;

  // EDI data
  ediFilePath?: string;
  ediContent?: string; // Full EDI content for debugging
  officeAllyTransactionId?: string;

  // Validation
  validationErrors?: ValidationError[];

  // AI coding tracking
  aiCodingUsed: boolean;
  aiCodingDetails?: AICodingDetails;

  // Manual overrides tracking
  manualOverrides?: Record<string, any>;

  // Audit
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service Line (CPT codes)
 */
export interface ServiceLine {
  cptCode: string; // e.g., "99214", "90834"
  modifiers?: string[]; // e.g., ["95"] for telehealth
  units: number;
  chargeAmount: number; // Dollar amount
  dateOfService: string; // YYYY-MM-DD
  placeOfService: string; // Two-digit code (e.g., "11" for office, "02" for telehealth)
}

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * AI Coding Details
 * Tracks AI suggestions and user acceptance
 */
export interface AICodingDetails {
  noteId: string;
  diagnosisSuggestions: DiagnosisSuggestion;
  cptSuggestions: CPTSuggestion;
  accepted: boolean;
  manualModifications?: Record<string, any>;
  processingTimeMs: number;
  timestamp: string;
}

/**
 * AI Diagnosis Suggestion
 */
export interface DiagnosisSuggestion {
  primaryDiagnosis: {
    condition: string;
    icd10Code: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
  secondaryDiagnoses?: Array<{
    condition: string;
    icd10Code: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
}

/**
 * AI CPT Code Suggestion
 */
export interface CPTSuggestion {
  emCode: {
    cptCode: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    keyFactors: string[];
  };
  psychotherapyAddOn?: {
    applicable: boolean;
    cptCode?: string;
    estimatedMinutes?: number;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
}

/**
 * Eligibility Check Result
 * From Office Ally REALTIME API
 */
export interface EligibilityCheck {
  id: string;
  intakeqClientId: string;
  payerId: string;
  checkDate: string;
  coverageStatus: 'active' | 'inactive' | 'unknown';
  benefitsData?: {
    mentalHealth?: {
      active: boolean;
      copay?: number;
      deductible?: {
        individual: number;
        remaining: number;
      };
    };
  };
  copayAmount?: number;
  deductibleInfo?: Record<string, any>;
  officeAllyResponse: Record<string, any>;
}

/**
 * API Response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
}

/**
 * Copay Status Enum
 * Tracks copay payment status for each appointment
 */
export enum CopayStatus {
  UNKNOWN = 'unknown', // Eligibility not checked or invoice not found
  NOT_REQUIRED = 'not_required', // No copay required per insurance
  OWED = 'owed', // Copay required but not yet paid
  PAID = 'paid', // Copay collected and recorded
  WAIVED = 'waived', // Copay waived (financial hardship, etc.)
}

/**
 * Copay Tracking Record
 * Database record tracking copay status per appointment
 */
export interface CopayTrackingRecord {
  id: string;
  intakeqAppointmentId: string;
  intakeqInvoiceId?: string;
  intakeqClientId: string;
  expectedCopayAmount?: number; // From Office Ally eligibility
  actualCopayAmount?: number; // From IntakeQ invoice
  paymentStatus: CopayStatus;
  paymentDate?: string;
  eligibilityCheckId?: string; // FK to eligibility_checks
  intakeqInvoiceData?: Record<string, any>;
  notes?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * IntakeQ Invoice
 * Data structure from IntakeQ Invoice API
 */
export interface IntakeQInvoice {
  Id: string;
  AppointmentId: string;
  ClientId: string;
  Amount: number; // Total invoice amount
  AmountPaid: number; // Amount already paid
  AmountDue: number; // Outstanding balance
  Status: 'Paid' | 'Unpaid' | 'PartiallyPaid';
  CreatedDate: string; // ISO date string
  PaidDate?: string; // ISO date string (if paid)
  LineItems?: InvoiceLineItem[];
}

/**
 * Invoice Line Item
 * Individual charges on an invoice (including copay)
 */
export interface InvoiceLineItem {
  Description: string; // e.g., "Copay", "Session Fee"
  Amount: number;
  Paid: boolean;
}

/**
 * Eligibility Request
 * Parameters for Office Ally 270 eligibility inquiry
 */
export interface EligibilityRequest {
  clientId: string; // IntakeQ client ID
  appointmentId?: string; // Optional: link to specific appointment
  patientFirstName: string;
  patientLastName: string;
  patientDateOfBirth: string; // YYYY-MM-DD
  subscriberMemberId: string;
  providerNPI: string;
  payerId: string; // Office Ally payer ID
  serviceDate?: string; // YYYY-MM-DD (optional, defaults to today)
}

/**
 * Eligibility Response
 * Parsed data from Office Ally 271 eligibility response
 */
export interface EligibilityResponse {
  success: boolean;
  coverageStatus: 'active' | 'inactive' | 'unknown';
  copayAmount?: number;
  deductibleInfo?: {
    individual?: number;
    family?: number;
    remaining?: number;
  };
  benefitsData?: {
    mentalHealth?: {
      active: boolean;
      copay?: number;
      coinsurance?: number; // Percentage (e.g., 20 for 20%)
      limitations?: string;
    };
  };
  raw271?: string; // Full X12 271 response for audit
  error?: string;
}

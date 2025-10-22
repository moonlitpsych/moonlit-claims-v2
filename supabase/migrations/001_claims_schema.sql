-- Moonlit Claims Database Schema
-- Phase 5: Claim Submission & Tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Claims table
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- IntakeQ References
  intakeq_appointment_id TEXT NOT NULL,
  intakeq_client_id TEXT NOT NULL,
  intakeq_practitioner_id TEXT NOT NULL,

  -- Patient Information (cached from IntakeQ)
  patient_first_name TEXT NOT NULL,
  patient_last_name TEXT NOT NULL,
  patient_date_of_birth DATE NOT NULL,
  patient_address JSONB NOT NULL, -- {street, city, state, zip}

  -- Insurance Information
  insurance_info JSONB NOT NULL, -- {carrier, memberId, groupNumber, subscriber details}

  -- Provider References
  rendering_provider_id UUID REFERENCES providers(id),
  billing_provider_id UUID REFERENCES providers(id),
  payer_id UUID REFERENCES payers(id),

  -- Clinical Information
  diagnosis_codes JSONB NOT NULL, -- Array of {code, description, isPrimary}
  service_lines JSONB NOT NULL, -- Array of {cptCode, modifiers, units, chargeAmount, dateOfService}

  -- Claim Status
  status TEXT NOT NULL DEFAULT 'draft', -- draft, validated, submitted, accepted, rejected, paid
  submission_date TIMESTAMP,

  -- EDI Data
  edi_file_path TEXT,
  edi_content TEXT, -- Full EDI content for debugging
  edi_file_name TEXT,
  office_ally_control_number TEXT, -- ISA13 Interchange Control Number

  -- Validation
  validation_errors JSONB,

  -- AI Coding Tracking
  ai_coding_used BOOLEAN DEFAULT FALSE,
  ai_coding_details JSONB, -- {noteId, diagnosisSuggestions, cptSuggestions, accepted, timestamp}

  -- Manual Overrides
  manual_overrides JSONB, -- Track what was manually changed from AI/auto-population

  -- Financial
  total_charge_amount DECIMAL(10, 2),
  paid_amount DECIMAL(10, 2),

  -- Audit
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Claim Submissions table (tracks each submission attempt)
CREATE TABLE IF NOT EXISTS claim_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Submission Details
  submission_method TEXT NOT NULL DEFAULT 'sftp', -- sftp, manual
  status TEXT NOT NULL, -- pending, success, failed

  -- SFTP Details
  sftp_file_name TEXT,
  sftp_remote_path TEXT,

  -- Office Ally Response
  office_ally_response JSONB,
  error_message TEXT,

  -- Timing
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Claim Status Updates table (tracks status changes from X12 transactions)
CREATE TABLE IF NOT EXISTS claim_status_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Status Information
  status TEXT NOT NULL, -- From 277 or 835 responses
  status_code TEXT,
  status_category TEXT, -- accepted, rejected, pending, finalized, etc.
  status_date TIMESTAMP,

  -- Payer Information
  payer_claim_number TEXT, -- Payer's internal claim number

  -- Rejection/Denial Info
  rejection_reason_code TEXT,
  rejection_reason_description TEXT,

  -- X12 Transaction Data
  transaction_type TEXT, -- 277, 835, etc.
  remit_data JSONB, -- Full X12 response data

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Coding Log table (tracks all AI coding attempts)
CREATE TABLE IF NOT EXISTS ai_coding_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,

  -- Note Information
  intakeq_note_id TEXT NOT NULL,
  note_content_hash TEXT, -- For deduplication

  -- AI Suggestions
  diagnosis_suggestions JSONB NOT NULL,
  cpt_suggestions JSONB NOT NULL,

  -- Gemini Response
  gemini_response_raw JSONB,

  -- User Feedback
  accepted BOOLEAN,
  manual_modifications JSONB,

  -- Performance
  processing_time_ms INTEGER,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Eligibility Checks table
CREATE TABLE IF NOT EXISTS eligibility_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Patient Information
  intakeq_client_id TEXT NOT NULL,
  payer_id UUID REFERENCES payers(id),

  -- Check Details
  check_date TIMESTAMP DEFAULT NOW(),
  coverage_status TEXT, -- active, inactive, unknown

  -- Benefits Data (from 271 response)
  benefits_data JSONB,
  copay_amount DECIMAL(10, 2),
  deductible_info JSONB,

  -- X12 271 Response
  office_ally_response JSONB,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User Information
  user_id TEXT,

  -- Action Details
  action TEXT NOT NULL, -- claim_created, claim_submitted, claim_validated, etc.
  resource_type TEXT NOT NULL, -- claim, appointment, etc.
  resource_id UUID,

  -- Changes (for updates)
  changes JSONB, -- {before: {...}, after: {...}}

  -- Request Context
  ip_address INET,
  user_agent TEXT,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_claims_intakeq_appointment ON claims(intakeq_appointment_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_submission_date ON claims(submission_date);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_claim_id ON claim_submissions(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_status_updates_claim_id ON claim_status_updates(claim_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_client_id ON eligibility_checks(intakeq_client_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to claims table
CREATE TRIGGER update_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE claims IS 'Stores all insurance claims with full claim data and status tracking';
COMMENT ON TABLE claim_submissions IS 'Tracks each submission attempt to Office Ally, including retries';
COMMENT ON TABLE claim_status_updates IS 'Records status changes from X12 277/835 responses';
COMMENT ON TABLE ai_coding_log IS 'Logs all AI coding attempts for analysis and improvement';
COMMENT ON TABLE eligibility_checks IS 'Stores real-time eligibility verification results from 270/271';
COMMENT ON TABLE audit_log IS 'Complete audit trail of all system actions for HIPAA compliance';

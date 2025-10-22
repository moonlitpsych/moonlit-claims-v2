-- Complete reset of claims schema
-- This will work even if tables have bad schemas

-- Step 1: Drop all constraints and foreign keys first
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all foreign key constraints on claims-related tables
    FOR r IN (SELECT conname, conrelid::regclass AS table_name
              FROM pg_constraint
              WHERE contype = 'f'
              AND conrelid::regclass::text IN ('claim_submissions', 'claim_status_updates', 'ai_coding_log'))
    LOOP
        EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.conname || ' CASCADE';
    END LOOP;
END $$;

-- Step 2: Drop all indexes
DROP INDEX IF EXISTS idx_claims_intakeq_appointment CASCADE;
DROP INDEX IF EXISTS idx_claims_status CASCADE;
DROP INDEX IF EXISTS idx_claims_submission_date CASCADE;
DROP INDEX IF EXISTS idx_claim_submissions_claim_id CASCADE;
DROP INDEX IF EXISTS idx_claim_status_updates_claim_id CASCADE;
DROP INDEX IF EXISTS idx_eligibility_checks_client_id CASCADE;
DROP INDEX IF EXISTS idx_audit_log_resource CASCADE;

-- Step 3: Drop all triggers
DROP TRIGGER IF EXISTS update_claims_updated_at ON claims CASCADE;

-- Step 4: Drop all tables
DROP TABLE IF EXISTS claim_status_updates CASCADE;
DROP TABLE IF EXISTS claim_submissions CASCADE;
DROP TABLE IF EXISTS ai_coding_log CASCADE;
DROP TABLE IF EXISTS eligibility_checks CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS claims CASCADE;

-- Step 5: Recreate everything fresh

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Claims table
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intakeq_appointment_id TEXT NOT NULL,
  intakeq_client_id TEXT NOT NULL,
  intakeq_practitioner_id TEXT NOT NULL,
  patient_first_name TEXT NOT NULL,
  patient_last_name TEXT NOT NULL,
  patient_date_of_birth DATE NOT NULL,
  patient_address JSONB NOT NULL,
  insurance_info JSONB NOT NULL,
  rendering_provider_id UUID REFERENCES providers(id),
  billing_provider_id UUID REFERENCES providers(id),
  payer_id UUID REFERENCES payers(id),
  diagnosis_codes JSONB NOT NULL,
  service_lines JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submission_date TIMESTAMP,
  edi_file_path TEXT,
  edi_content TEXT,
  edi_file_name TEXT,
  office_ally_control_number TEXT,
  validation_errors JSONB,
  ai_coding_used BOOLEAN DEFAULT FALSE,
  ai_coding_details JSONB,
  manual_overrides JSONB,
  total_charge_amount DECIMAL(10, 2),
  paid_amount DECIMAL(10, 2),
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Claim Submissions table
CREATE TABLE claim_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  submission_method TEXT NOT NULL DEFAULT 'sftp',
  status TEXT NOT NULL,
  sftp_file_name TEXT,
  sftp_remote_path TEXT,
  office_ally_response JSONB,
  error_message TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Claim Status Updates table
CREATE TABLE claim_status_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  status_code TEXT,
  status_category TEXT,
  status_date TIMESTAMP,
  payer_claim_number TEXT,
  rejection_reason_code TEXT,
  rejection_reason_description TEXT,
  transaction_type TEXT,
  remit_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Coding Log table
CREATE TABLE ai_coding_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  intakeq_note_id TEXT NOT NULL,
  note_content_hash TEXT,
  diagnosis_suggestions JSONB NOT NULL,
  cpt_suggestions JSONB NOT NULL,
  gemini_response_raw JSONB,
  accepted BOOLEAN,
  manual_modifications JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Eligibility Checks table
CREATE TABLE eligibility_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intakeq_client_id TEXT NOT NULL,
  payer_id UUID REFERENCES payers(id),
  check_date TIMESTAMP DEFAULT NOW(),
  coverage_status TEXT,
  benefits_data JSONB,
  copay_amount DECIMAL(10, 2),
  deductible_info JSONB,
  office_ally_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_claims_intakeq_appointment ON claims(intakeq_appointment_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_submission_date ON claims(submission_date);
CREATE INDEX idx_claim_submissions_claim_id ON claim_submissions(claim_id);
CREATE INDEX idx_claim_status_updates_claim_id ON claim_status_updates(claim_id);
CREATE INDEX idx_eligibility_checks_client_id ON eligibility_checks(intakeq_client_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
CREATE TRIGGER update_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE claims IS 'Stores all insurance claims with full claim data and status tracking';
COMMENT ON TABLE claim_submissions IS 'Tracks each submission attempt to Office Ally';
COMMENT ON TABLE claim_status_updates IS 'Records status changes from X12 277/835 responses';
COMMENT ON TABLE ai_coding_log IS 'Logs all AI coding attempts for analysis';
COMMENT ON TABLE eligibility_checks IS 'Stores eligibility verification results';
COMMENT ON TABLE audit_log IS 'Complete audit trail for HIPAA compliance';

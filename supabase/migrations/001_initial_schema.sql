-- Moonlit Claims Application - Initial Database Schema
-- HIPAA-compliant database structure for claims submission

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PROVIDERS TABLE
-- Stores information about healthcare providers (individuals and organizations)
-- =============================================================================
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  npi TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('individual', 'organization')),
  phone TEXT NOT NULL,
  address JSONB NOT NULL,
  email TEXT,
  is_supervising BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast NPI lookups
CREATE INDEX idx_providers_npi ON providers(npi);
CREATE INDEX idx_providers_active ON providers(is_active);

-- =============================================================================
-- PAYERS TABLE
-- Insurance payer information with Office Ally routing details
-- =============================================================================
CREATE TABLE payers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  office_ally_payer_id_837p TEXT NOT NULL, -- For claim submissions
  office_ally_payer_id_835 TEXT,           -- For remittance advice
  requires_supervising_npi BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for payer name searches
CREATE INDEX idx_payers_name ON payers(name);
CREATE INDEX idx_payers_active ON payers(is_active);

-- =============================================================================
-- CLAIMS TABLE
-- Core claims data - CMS-1500 / X12 837P information
-- =============================================================================
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- IntakeQ references
  intakeq_appointment_id TEXT UNIQUE NOT NULL,
  intakeq_client_id TEXT NOT NULL,
  intakeq_practitioner_id TEXT NOT NULL,

  -- Cached patient information (from IntakeQ)
  patient_info JSONB NOT NULL,

  -- Insurance information
  insurance_info JSONB NOT NULL,

  -- Provider references
  rendering_provider_id UUID REFERENCES providers(id) ON DELETE RESTRICT,
  billing_provider_id UUID REFERENCES providers(id) ON DELETE RESTRICT,
  payer_id UUID REFERENCES payers(id) ON DELETE RESTRICT,

  -- Clinical information
  diagnosis_codes JSONB NOT NULL DEFAULT '[]',
  service_lines JSONB NOT NULL DEFAULT '[]',

  -- Claim status and tracking
  claim_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (claim_status IN ('draft', 'validated', 'submitted', 'accepted', 'rejected', 'paid')),
  submission_date TIMESTAMP WITH TIME ZONE,

  -- EDI data
  edi_file_path TEXT,
  edi_content TEXT, -- Full EDI content for debugging
  office_ally_transaction_id TEXT,

  -- Validation
  validation_errors JSONB,

  -- AI coding tracking
  ai_coding_used BOOLEAN DEFAULT FALSE,
  ai_coding_details JSONB,

  -- Manual overrides (track what was manually changed)
  manual_overrides JSONB,

  -- Audit fields
  created_by UUID, -- Future: reference to users table
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_claims_appointment ON claims(intakeq_appointment_id);
CREATE INDEX idx_claims_client ON claims(intakeq_client_id);
CREATE INDEX idx_claims_status ON claims(claim_status);
CREATE INDEX idx_claims_submission_date ON claims(submission_date);
CREATE INDEX idx_claims_created_at ON claims(created_at);

-- =============================================================================
-- CLAIM SUBMISSIONS TABLE
-- Track all submission attempts to Office Ally
-- =============================================================================
CREATE TABLE claim_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  submission_method TEXT NOT NULL CHECK (submission_method IN ('sftp', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  office_ally_response JSONB,
  error_message TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for claim submission history
CREATE INDEX idx_claim_submissions_claim_id ON claim_submissions(claim_id);
CREATE INDEX idx_claim_submissions_status ON claim_submissions(status);

-- =============================================================================
-- CLAIM STATUS UPDATES TABLE
-- Track status changes from X12 remit responses (277, 835)
-- =============================================================================
CREATE TABLE claim_status_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  status_code TEXT,
  status_date TIMESTAMP WITH TIME ZONE NOT NULL,
  remit_data JSONB, -- Full X12 remit response
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for status tracking
CREATE INDEX idx_claim_status_updates_claim_id ON claim_status_updates(claim_id);
CREATE INDEX idx_claim_status_updates_date ON claim_status_updates(status_date);

-- =============================================================================
-- AI CODING LOG TABLE
-- Track AI diagnosis and CPT code suggestions
-- =============================================================================
CREATE TABLE ai_coding_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  intakeq_note_id TEXT NOT NULL,
  note_content_hash TEXT, -- For deduplication
  diagnosis_suggestions JSONB NOT NULL,
  cpt_suggestions JSONB NOT NULL,
  gemini_response_raw JSONB, -- Full Gemini API response
  accepted BOOLEAN DEFAULT FALSE,
  manual_modifications JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for AI coding analysis
CREATE INDEX idx_ai_coding_claim_id ON ai_coding_log(claim_id);
CREATE INDEX idx_ai_coding_note_id ON ai_coding_log(intakeq_note_id);
CREATE INDEX idx_ai_coding_note_hash ON ai_coding_log(note_content_hash);

-- =============================================================================
-- AUDIT LOG TABLE
-- HIPAA-compliant audit trail for all data access and modifications
-- =============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID, -- Future: reference to users table
  action TEXT NOT NULL, -- e.g., 'claim_created', 'claim_submitted', 'claim_viewed'
  resource_type TEXT NOT NULL, -- e.g., 'claim', 'appointment', 'patient'
  resource_id UUID,
  changes JSONB, -- Before/after for updates
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for audit trail queries
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- =============================================================================
-- ELIGIBILITY CHECKS TABLE
-- Track eligibility verification requests and responses
-- =============================================================================
CREATE TABLE eligibility_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intakeq_client_id TEXT NOT NULL,
  payer_id UUID REFERENCES payers(id) ON DELETE RESTRICT,
  check_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('active', 'inactive', 'unknown')),
  benefits_data JSONB,
  copay_amount NUMERIC(10, 2),
  deductible_info JSONB,
  office_ally_response JSONB, -- Full X12 271 response
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for eligibility check lookups
CREATE INDEX idx_eligibility_client_id ON eligibility_checks(intakeq_client_id);
CREATE INDEX idx_eligibility_check_date ON eligibility_checks(check_date);
CREATE INDEX idx_eligibility_payer_id ON eligibility_checks(payer_id);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- Automatically update updated_at timestamp on row changes
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payers_updated_at BEFORE UPDATE ON payers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS for HIPAA compliance - will be configured based on auth setup
-- =============================================================================
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_coding_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies will be added once authentication is implemented
-- For now, service role key will be used for all operations

-- =============================================================================
-- COMMENTS
-- Document the schema for future developers
-- =============================================================================
COMMENT ON TABLE providers IS 'Healthcare providers (individuals and organizations) with NPI and contact information';
COMMENT ON TABLE payers IS 'Insurance payers with Office Ally routing configuration';
COMMENT ON TABLE claims IS 'Core claims data in CMS-1500 / X12 837P format';
COMMENT ON TABLE claim_submissions IS 'Submission history and tracking for claims sent to Office Ally';
COMMENT ON TABLE claim_status_updates IS 'Status updates from X12 remit responses (277, 835)';
COMMENT ON TABLE ai_coding_log IS 'AI-generated diagnosis and CPT code suggestions with acceptance tracking';
COMMENT ON TABLE audit_log IS 'HIPAA-compliant audit trail for all data access and modifications';
COMMENT ON TABLE eligibility_checks IS 'Insurance eligibility verification results from Office Ally';

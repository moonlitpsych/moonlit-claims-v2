-- Migration 008: Event Sourcing Foundation
-- Implements event-driven architecture for claim lifecycle tracking
-- Based on FOLLOWING_CLAIMS.md specification

-- =============================================================================
-- CLAIM EVENTS TABLE
-- Append-only event log for full audit trail and state derivation
-- =============================================================================
CREATE TABLE IF NOT EXISTS claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    -- Claim lifecycle events
    'claim_created',
    'claim_validated',
    'claim_submitted',
    'claim_edited',
    'claim_voided',

    -- X12 transaction events
    'submitted_837',      -- Claim sent to clearinghouse
    'ack_999',           -- Functional acknowledgment
    'reject_277ca',      -- Clearinghouse rejection
    'accept_277ca',      -- Clearinghouse acceptance
    'status_277',        -- Claim status inquiry response
    'remit_835_header',  -- ERA payment header
    'remit_835_detail',  -- ERA claim-level detail

    -- Office Ally specific events
    'oa_file_uploaded',
    'oa_batch_created',
    'oa_status_checked',

    -- Manual events
    'manual_status_update',
    'manual_payment_posted',
    'note_added',
    'corrected_claim_submitted'
  )),
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  raw_file_id UUID, -- FK to raw_files table (when event comes from X12 file)
  details JSONB DEFAULT '{}'::jsonb, -- Event-specific payload
  hash_sha256 TEXT, -- For idempotency (hash of event content)
  created_by TEXT, -- User or system that created event
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure idempotency: same event with same hash cannot be inserted twice
  UNIQUE (claim_id, event_type, hash_sha256)
);

-- Indexes for efficient querying
CREATE INDEX idx_claim_events_claim_id ON claim_events(claim_id);
CREATE INDEX idx_claim_events_event_type ON claim_events(event_type);
CREATE INDEX idx_claim_events_occurred_at ON claim_events(occurred_at DESC);
CREATE INDEX idx_claim_events_created_at ON claim_events(created_at DESC);

-- =============================================================================
-- CLAIM IDENTIFIERS TABLE
-- Cross-system identifier mapping for deterministic claim matching
-- =============================================================================
CREATE TABLE IF NOT EXISTS claim_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  system TEXT NOT NULL CHECK (system IN ('payer', 'oa', 'internal', 'intakeq')),
  id_type TEXT NOT NULL CHECK (id_type IN (
    'ICN',    -- Internal Control Number (payer)
    'TCN',    -- Transaction Control Number
    'CCN',    -- Claim Control Number
    'DCN',    -- Document Control Number
    'CLM01',  -- Our patient control number
    'REF_D9', -- Clearinghouse trace number
    'REF_2U', -- Payer supplemental ID
    'OA_CLAIM_ID', -- Office Ally claim ID
    'OA_BATCH_ID', -- Office Ally batch ID
    'INTAKEQ_CLAIM_ID', -- Legacy IntakeQ claim ID
    'OTHER'
  )),
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate identifiers for same claim
  UNIQUE (claim_id, system, id_type, value)
);

-- Indexes for fast lookups
CREATE INDEX idx_claim_identifiers_claim_id ON claim_identifiers(claim_id);
CREATE INDEX idx_claim_identifiers_system_value ON claim_identifiers(system, value);
CREATE INDEX idx_claim_identifiers_type_value ON claim_identifiers(id_type, value);

-- =============================================================================
-- RAW FILES TABLE
-- Store original X12 files for audit trail and reprocessing
-- =============================================================================
CREATE TABLE IF NOT EXISTS raw_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('oa_sftp', 'oa_api', 'manual_upload', 'test')),
  filename TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('837', '999', '277CA', '277', '835', 'OTHER')),
  payload BYTEA, -- Actual file content (consider using object storage for large files)
  payload_text TEXT, -- Text version for X12 files
  sha256 TEXT NOT NULL UNIQUE, -- File hash for deduplication
  file_size_bytes INTEGER,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for file management
CREATE INDEX idx_raw_files_sha256 ON raw_files(sha256);
CREATE INDEX idx_raw_files_source ON raw_files(source);
CREATE INDEX idx_raw_files_filename ON raw_files(filename);
CREATE INDEX idx_raw_files_processed ON raw_files(processed);
CREATE INDEX idx_raw_files_received_at ON raw_files(received_at DESC);

-- =============================================================================
-- CARC/RARC CODE DICTIONARIES
-- Reference tables for adjustment reason codes
-- =============================================================================

-- Claim Adjustment Reason Codes (CARC)
CREATE TABLE IF NOT EXISTS carc_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remittance Advice Remark Codes (RARC)
CREATE TABLE IF NOT EXISTS rarc_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common CARC codes (subset for initial setup)
INSERT INTO carc_codes (code, description) VALUES
  ('1', 'Deductible amount'),
  ('2', 'Coinsurance amount'),
  ('3', 'Co-payment amount'),
  ('4', 'The procedure code is inconsistent with the modifier used'),
  ('16', 'Claim/service lacks information which is needed for adjudication'),
  ('18', 'Duplicate claim/service'),
  ('45', 'Charge exceeds fee schedule/maximum allowable'),
  ('50', 'These are non-covered services because this is not deemed a medical necessity'),
  ('96', 'Non-covered charge(s)'),
  ('97', 'The benefit for this service is included in the payment/allowance for another service'),
  ('109', 'Claim/service not covered by this payer/contractor'),
  ('197', 'Precertification/authorization/notification absent')
ON CONFLICT (code) DO NOTHING;

-- Insert common RARC codes (subset for initial setup)
INSERT INTO rarc_codes (code, description) VALUES
  ('M1', 'X-ray not taken within the past 12 months'),
  ('M15', 'Separately billed services/tests have been bundled'),
  ('M20', 'Missing/incomplete/invalid HCPCS'),
  ('M27', 'The patient has been relieved of liability for payment'),
  ('N1', 'Incomplete/invalid provider name'),
  ('N19', 'Procedure code incidental to primary procedure'),
  ('N30', 'Patient ineligible for this service'),
  ('N56', 'Procedure code not payable unless submitted with another procedure code'),
  ('N130', 'Consult our contractual agreement for restrictions')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON TABLE claim_events IS 'Event sourcing table - append-only log of all claim lifecycle events';
COMMENT ON TABLE claim_identifiers IS 'Maps claims to various external system identifiers (payer ICN, OA ID, etc)';
COMMENT ON TABLE raw_files IS 'Stores raw X12 files for audit trail and reprocessing capability';
COMMENT ON TABLE carc_codes IS 'Claim Adjustment Reason Codes dictionary from X12 standards';
COMMENT ON TABLE rarc_codes IS 'Remittance Advice Remark Codes dictionary from X12 standards';

COMMENT ON COLUMN claim_events.hash_sha256 IS 'SHA256 hash of event content for idempotency - prevents duplicate events';
COMMENT ON COLUMN claim_identifiers.system IS 'Which system assigned this identifier (payer, Office Ally, internal)';
COMMENT ON COLUMN raw_files.sha256 IS 'SHA256 hash of file content - ensures no duplicate processing';
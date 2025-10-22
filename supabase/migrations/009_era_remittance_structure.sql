-- Migration 009: ERA Remittance Structure (835 Processing)
-- Implements complete 835 ERA storage for financial reconciliation
-- Based on FOLLOWING_CLAIMS.md specification

-- =============================================================================
-- REMITS_835 TABLE
-- ERA file headers (BPR/TRN segments)
-- =============================================================================
CREATE TABLE IF NOT EXISTS remits_835 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id UUID REFERENCES payers(id),

  -- Payment information from BPR segment
  payment_date DATE NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('CHK', 'EFT', 'NON')), -- Check, Electronic, Non-payment
  payment_amount NUMERIC(14,2) NOT NULL,

  -- Check or EFT details from TRN segment
  check_number TEXT,
  eft_trace_number TEXT,

  -- Payer identification
  payer_name TEXT,
  payer_identifier TEXT,

  -- File tracking
  raw_file_id UUID REFERENCES raw_files(id),
  file_name TEXT,

  -- Processing metadata
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_claims INTEGER DEFAULT 0,
  matched_claims INTEGER DEFAULT 0,
  unmatched_claims INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ERA headers
CREATE INDEX idx_remits_835_payer ON remits_835(payer_id);
CREATE INDEX idx_remits_835_payment_date ON remits_835(payment_date DESC);
CREATE INDEX idx_remits_835_check_number ON remits_835(check_number);
CREATE INDEX idx_remits_835_created_at ON remits_835(created_at DESC);

-- =============================================================================
-- REMIT_CLAIMS TABLE
-- Claim-level CLP segments within an ERA
-- =============================================================================
CREATE TABLE IF NOT EXISTS remit_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remit_id UUID NOT NULL REFERENCES remits_835(id) ON DELETE CASCADE,
  claim_id UUID, -- Nullable until matched

  -- CLP segment fields
  patient_control_no TEXT NOT NULL, -- CLP01 (our CLM01)
  claim_status_code TEXT NOT NULL, -- CLP02 (1=Paid, 2=Denied, 3=Partial, etc)
  claim_charge_amt NUMERIC(12,2) NOT NULL, -- CLP03
  claim_paid_amt NUMERIC(12,2) NOT NULL, -- CLP04
  patient_resp_amt NUMERIC(12,2), -- CLP05
  claim_filing_indicator TEXT, -- CLP06
  payer_claim_control TEXT, -- CLP07 (Payer's ICN/TCN)
  facility_type TEXT, -- CLP08

  -- REF segments
  payer_icn TEXT, -- REF*1K (Payer Claim Control Number)
  clearinghouse_trace TEXT, -- REF*D9
  original_ref_no TEXT, -- REF*F8

  -- DTM segments
  service_date_from DATE,
  service_date_to DATE,
  received_date DATE,

  -- NM1 segments
  patient_last_name TEXT,
  patient_first_name TEXT,
  patient_identifier TEXT,
  subscriber_last_name TEXT,
  subscriber_first_name TEXT,
  subscriber_identifier TEXT,

  -- Matching status
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('matched', 'unmatched', 'pending', 'manual')),
  match_confidence NUMERIC(3,2), -- 0.00 to 1.00
  match_method TEXT, -- 'icn', 'clm01', 'tuple', 'manual'
  matched_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for claim-level remittance
CREATE INDEX idx_remit_claims_remit_id ON remit_claims(remit_id);
CREATE INDEX idx_remit_claims_claim_id ON remit_claims(claim_id);
CREATE INDEX idx_remit_claims_patient_control_no ON remit_claims(patient_control_no);
CREATE INDEX idx_remit_claims_payer_icn ON remit_claims(payer_icn);
CREATE INDEX idx_remit_claims_status_code ON remit_claims(claim_status_code);
CREATE INDEX idx_remit_claims_match_status ON remit_claims(match_status);

-- =============================================================================
-- REMIT_LINES TABLE
-- Service line-level SVC/CAS segments
-- =============================================================================
CREATE TABLE IF NOT EXISTS remit_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remit_claim_id UUID NOT NULL REFERENCES remit_claims(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, -- Line sequence number (1..N)

  -- SVC segment fields
  svc_composite TEXT, -- Full procedure code composite (HC:99214:1:2)
  svc_cpt TEXT, -- Extracted CPT/HCPCS code
  svc_modifiers TEXT[], -- Array of modifiers
  svc_charge NUMERIC(12,2) NOT NULL, -- Submitted charge
  svc_paid NUMERIC(12,2) NOT NULL, -- Paid amount
  svc_units NUMERIC(10,2), -- Units paid
  svc_original_units NUMERIC(10,2), -- Units submitted

  -- AMT segments
  allowed_amt NUMERIC(12,2), -- AMT*AAE (Approved Amount)
  deductible_amt NUMERIC(12,2), -- AMT*DY
  coinsurance_amt NUMERIC(12,2), -- AMT*A2

  -- CAS segments (stored as JSONB array)
  cas_adjustments JSONB DEFAULT '[]'::jsonb, -- Array of {group, code, amount, quantity}

  -- DTM segment
  service_date DATE,

  -- LQ/RARC segments
  rarc_codes TEXT[], -- Array of RARC codes

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (remit_claim_id, seq)
);

-- Indexes for service lines
CREATE INDEX idx_remit_lines_remit_claim_id ON remit_lines(remit_claim_id);
CREATE INDEX idx_remit_lines_cpt ON remit_lines(svc_cpt);
CREATE INDEX idx_remit_lines_service_date ON remit_lines(service_date);

-- =============================================================================
-- CLAIM_LINES TABLE
-- Normalized service lines from our submitted claims
-- (Replaces JSONB service_lines in claims table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS claim_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, -- Line number (1..N)

  -- Procedure information
  cpt TEXT NOT NULL,
  modifiers TEXT[] DEFAULT '{}',
  units NUMERIC(10,2) DEFAULT 1,
  charge_amt NUMERIC(12,2) NOT NULL,

  -- Diagnosis pointers
  dx_pointers SMALLINT[] DEFAULT '{}', -- Points to diagnosis array positions

  -- Service dates (if different from header)
  service_date_from DATE,
  service_date_to DATE,

  -- Place of service (if different from header)
  place_of_service TEXT,

  -- Rendering provider (if different from header)
  rendering_npi TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (claim_id, seq)
);

-- Indexes for claim lines
CREATE INDEX idx_claim_lines_claim_id ON claim_lines(claim_id);
CREATE INDEX idx_claim_lines_cpt ON claim_lines(cpt);

-- =============================================================================
-- 277 STATUS TRACKING TABLE
-- Store claim status responses
-- =============================================================================
CREATE TABLE IF NOT EXISTS status_277 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id),

  -- Status information
  status_category TEXT, -- Category code from STC segment
  status_code TEXT, -- Status code from STC segment
  status_description TEXT, -- Human-readable description

  -- Action codes
  action_code TEXT, -- What action to take

  -- Dates
  status_date DATE,
  inquiry_date TIMESTAMP WITH TIME ZONE,

  -- Payer information
  payer_claim_control TEXT, -- Payer's ICN if available

  -- Raw response
  raw_277_response JSONB,
  raw_file_id UUID REFERENCES raw_files(id),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for 277 status
CREATE INDEX idx_status_277_claim_id ON status_277(claim_id);
CREATE INDEX idx_status_277_status_date ON status_277(status_date DESC);
CREATE INDEX idx_status_277_created_at ON status_277(created_at DESC);

-- =============================================================================
-- MATERIALIZED VIEWS FOR FINANCIAL ROLLUPS
-- =============================================================================

-- Financial summary per claim
CREATE MATERIALIZED VIEW IF NOT EXISTS v_claim_financials AS
SELECT
  c.id AS claim_id,
  c.clm01,
  c.submitted_charge_total AS billed_amount,
  COALESCE(SUM(rc.claim_charge_amt), 0) AS era_charge_amount,
  COALESCE(SUM(rc.claim_paid_amt), 0) AS paid_amount,
  COALESCE(SUM(rc.patient_resp_amt), 0) AS patient_responsibility,
  COALESCE(MAX(rl.allowed_amt), 0) AS allowed_amount,
  c.submitted_charge_total - COALESCE(SUM(rc.claim_paid_amt), 0) AS outstanding_balance,
  MAX(r835.payment_date) AS last_payment_date,
  COUNT(DISTINCT rc.id) AS remittance_count
FROM claims c
LEFT JOIN remit_claims rc ON rc.claim_id = c.id
LEFT JOIN remit_lines rl ON rl.remit_claim_id = rc.id
LEFT JOIN remits_835 r835 ON r835.id = rc.remit_id
GROUP BY c.id, c.clm01, c.submitted_charge_total;

-- Create indexes on materialized view
CREATE UNIQUE INDEX idx_v_claim_financials_claim_id ON v_claim_financials(claim_id);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON TABLE remits_835 IS 'ERA (Electronic Remittance Advice) file headers from X12 835 transactions';
COMMENT ON TABLE remit_claims IS 'Claim-level remittance information from CLP segments in 835';
COMMENT ON TABLE remit_lines IS 'Service line-level adjustments from SVC/CAS segments in 835';
COMMENT ON TABLE claim_lines IS 'Normalized service lines from submitted claims (replaces JSONB)';
COMMENT ON TABLE status_277 IS 'Claim status responses from X12 277 transactions';

COMMENT ON COLUMN remit_claims.claim_status_code IS '1=Paid, 2=Denied, 3=Partial, 4=Pended, 22=Reversal';
COMMENT ON COLUMN remit_claims.match_status IS 'Whether we successfully matched this ERA claim to our claim';
COMMENT ON COLUMN remit_lines.cas_adjustments IS 'JSON array of adjustments: [{group: CO/PR/OA, code: 45, amount: 100.00}]';
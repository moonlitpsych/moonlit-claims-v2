-- Migration 007: Essential Tracking Fields for X12 Claims Lifecycle
-- Adds critical fields needed for ERA matching and claim tracking
-- These fields are essential for implementing FOLLOWING_CLAIMS.md architecture

-- Add essential X12 tracking fields to claims table
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS clm01 TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS dos_from DATE,
ADD COLUMN IF NOT EXISTS dos_to DATE,
ADD COLUMN IF NOT EXISTS place_of_service TEXT,
ADD COLUMN IF NOT EXISTS submitted_charge_total NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS billing_npi TEXT,
ADD COLUMN IF NOT EXISTS billing_tin TEXT,
ADD COLUMN IF NOT EXISTS rendering_npi TEXT,
ADD COLUMN IF NOT EXISTS subscriber_id TEXT,
ADD COLUMN IF NOT EXISTS taxonomy TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_claims_clm01 ON claims(clm01);
CREATE INDEX IF NOT EXISTS idx_claims_dos_range ON claims(dos_from, dos_to);
CREATE INDEX IF NOT EXISTS idx_claims_billing_npi ON claims(billing_npi);
CREATE INDEX IF NOT EXISTS idx_claims_subscriber_id ON claims(subscriber_id);

-- Update existing claims to have a CLM01 if they don't have one
-- Using pattern: LEGACY-{uuid} for backfilled claims
UPDATE claims
SET clm01 = 'LEGACY-' || id::TEXT
WHERE clm01 IS NULL;

-- Make clm01 NOT NULL after backfill
ALTER TABLE claims
ALTER COLUMN clm01 SET NOT NULL;

-- Add expanded status enum values for complete lifecycle tracking
-- First, we need to handle the existing constraint
DO $$
BEGIN
  -- Check if we need to update the status constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'claims_status_check'
    AND conrelid = 'claims'::regclass
  ) THEN
    ALTER TABLE claims DROP CONSTRAINT claims_status_check;
  END IF;

  -- Add the new comprehensive status constraint
  ALTER TABLE claims
  ADD CONSTRAINT claims_status_check
  CHECK (status IN (
    'draft',
    'validated',
    'submitted',
    'clearinghouse_accepted',
    'clearinghouse_rejected',
    'payer_accepted',
    'payer_rejected',
    'in_process',
    'pended',
    'denied',
    'partial',
    'paid',
    'adjusted',
    'void'
  ));
END $$;

-- Add Office Ally specific tracking
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS oa_claim_id TEXT,
ADD COLUMN IF NOT EXISTS oa_batch_id TEXT;

-- Add indexing for Office Ally lookups
CREATE INDEX IF NOT EXISTS idx_claims_oa_claim_id ON claims(oa_claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_oa_batch_id ON claims(oa_batch_id);

-- Add comments for documentation
COMMENT ON COLUMN claims.clm01 IS 'Patient Control Number - our unique claim identifier sent in X12 837 CLM01';
COMMENT ON COLUMN claims.dos_from IS 'Date of Service From - start of service date range';
COMMENT ON COLUMN claims.dos_to IS 'Date of Service To - end of service date range (same as dos_from for single-day)';
COMMENT ON COLUMN claims.place_of_service IS 'Place of Service code (e.g., 11=Office, 02=Telehealth)';
COMMENT ON COLUMN claims.submitted_charge_total IS 'Total charge amount submitted on claim';
COMMENT ON COLUMN claims.billing_npi IS 'Billing Provider NPI (usually group/organization)';
COMMENT ON COLUMN claims.billing_tin IS 'Billing Provider Tax ID Number';
COMMENT ON COLUMN claims.rendering_npi IS 'Rendering Provider NPI (individual who provided service)';
COMMENT ON COLUMN claims.subscriber_id IS 'Member ID / Policy Number from insurance card';
COMMENT ON COLUMN claims.taxonomy IS 'Provider taxonomy code for specialty';
COMMENT ON COLUMN claims.oa_claim_id IS 'Office Ally internal claim identifier';
COMMENT ON COLUMN claims.oa_batch_id IS 'Office Ally batch/file identifier';
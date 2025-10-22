-- Add intakeq_claim_id field to claims table
-- This allows us to track claims that were created in IntakeQ

ALTER TABLE claims ADD COLUMN IF NOT EXISTS intakeq_claim_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_claims_intakeq_claim_id ON claims(intakeq_claim_id);

-- Comment for documentation
COMMENT ON COLUMN claims.intakeq_claim_id IS 'IntakeQ claim ID for backfilled claims from IntakeQ Claims API';

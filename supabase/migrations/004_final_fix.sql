-- Final fix: Drop indexes by name only (not by column reference)
-- This avoids errors about missing columns

DROP INDEX IF EXISTS idx_claims_intakeq_appointment CASCADE;
DROP INDEX IF EXISTS idx_claims_status CASCADE;
DROP INDEX IF EXISTS idx_claims_submission_date CASCADE;
DROP INDEX IF EXISTS idx_claim_submissions_claim_id CASCADE;
DROP INDEX IF EXISTS idx_claim_status_updates_claim_id CASCADE;
DROP INDEX IF EXISTS idx_eligibility_checks_client_id CASCADE;
DROP INDEX IF EXISTS idx_audit_log_resource CASCADE;

-- Now create fresh indexes on the correct tables
CREATE INDEX idx_claims_intakeq_appointment ON claims(intakeq_appointment_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_submission_date ON claims(submission_date);
CREATE INDEX idx_claim_submissions_claim_id ON claim_submissions(claim_id);
CREATE INDEX idx_claim_status_updates_claim_id ON claim_status_updates(claim_id);
CREATE INDEX idx_eligibility_checks_client_id ON eligibility_checks(intakeq_client_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

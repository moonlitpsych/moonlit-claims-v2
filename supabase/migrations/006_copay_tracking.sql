-- Migration 006: Copay Tracking and Eligibility Checks
-- Phase 6: Add tables for tracking eligibility checks and copay payment status

-- Drop tables if they exist (for clean re-run during development)
DROP TABLE IF EXISTS copay_tracking CASCADE;
DROP TABLE IF EXISTS eligibility_checks CASCADE;

-- Create eligibility_checks table
-- Stores results from Office Ally REALTIME 270/271 eligibility inquiries
CREATE TABLE eligibility_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intakeq_client_id TEXT NOT NULL,
    intakeq_appointment_id TEXT, -- Optional: link to specific appointment
    payer_id UUID REFERENCES payers(id),
    check_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    coverage_status TEXT NOT NULL, -- 'active', 'inactive', 'unknown'
    benefits_data JSONB, -- Full benefit details from 271 response
    copay_amount NUMERIC(10, 2), -- Expected copay amount
    deductible_info JSONB, -- Deductible details
    office_ally_response JSONB, -- Full X12 271 response for audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for eligibility_checks
CREATE INDEX idx_eligibility_checks_client ON eligibility_checks(intakeq_client_id);
CREATE INDEX idx_eligibility_checks_appointment ON eligibility_checks(intakeq_appointment_id);
CREATE INDEX idx_eligibility_checks_date ON eligibility_checks(check_date DESC);

-- Create copay_tracking table
-- Combines eligibility data with payment status from IntakeQ invoices
CREATE TABLE copay_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intakeq_appointment_id TEXT NOT NULL UNIQUE, -- One copay record per appointment
    intakeq_invoice_id TEXT, -- Link to IntakeQ invoice
    intakeq_client_id TEXT NOT NULL,
    expected_copay_amount NUMERIC(10, 2), -- From Office Ally eligibility check
    actual_copay_amount NUMERIC(10, 2), -- From IntakeQ invoice
    payment_status TEXT NOT NULL DEFAULT 'unknown', -- 'unknown', 'not_required', 'owed', 'paid', 'waived'
    payment_date TIMESTAMP WITH TIME ZONE, -- When copay was collected
    eligibility_check_id UUID REFERENCES eligibility_checks(id), -- Link to eligibility data
    intakeq_invoice_data JSONB, -- Full invoice response for reference
    notes TEXT, -- Manual notes (e.g., "Patient financial hardship waiver")
    last_synced_at TIMESTAMP WITH TIME ZONE, -- Last time we checked IntakeQ Invoice API
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for copay_tracking
CREATE INDEX idx_copay_tracking_appointment ON copay_tracking(intakeq_appointment_id);
CREATE INDEX idx_copay_tracking_client ON copay_tracking(intakeq_client_id);
CREATE INDEX idx_copay_tracking_status ON copay_tracking(payment_status);
CREATE INDEX idx_copay_tracking_synced ON copay_tracking(last_synced_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_eligibility_checks_updated_at
    BEFORE UPDATE ON eligibility_checks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_copay_tracking_updated_at
    BEFORE UPDATE ON copay_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE eligibility_checks IS 'Stores Office Ally REALTIME 270/271 eligibility verification results';
COMMENT ON TABLE copay_tracking IS 'Combines eligibility copay data with IntakeQ invoice payment status';
COMMENT ON COLUMN eligibility_checks.coverage_status IS 'Insurance coverage status: active, inactive, or unknown';
COMMENT ON COLUMN copay_tracking.payment_status IS 'Copay payment status: unknown, not_required, owed, paid, or waived';
COMMENT ON COLUMN copay_tracking.last_synced_at IS 'Last time IntakeQ Invoice API was checked for payment updates';

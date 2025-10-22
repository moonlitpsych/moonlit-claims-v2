-- Seed Data for Moonlit Claims Application
-- Initial providers and payers configuration

-- =============================================================================
-- MOONLIT ORGANIZATION (Type 2 NPI - Billing Provider)
-- =============================================================================
INSERT INTO providers (name, npi, type, phone, address, email, is_supervising, is_active)
VALUES (
  'MOONLIT PLLC',
  '1234567890', -- Replace with actual Moonlit Type 2 NPI
  'organization',
  '801-555-0100',
  '{"street": "123 Medical Plaza", "city": "Salt Lake City", "state": "UT", "zip": "84101"}',
  'billing@moonlit-practice.com',
  FALSE,
  TRUE
);

-- =============================================================================
-- SAMPLE SUPERVISING PHYSICIAN
-- =============================================================================
INSERT INTO providers (name, npi, type, phone, address, email, is_supervising, is_active)
VALUES (
  'Dr. Jane Smith, MD',
  '2345678901', -- Replace with actual supervising physician NPI
  'individual',
  '801-555-0101',
  '{"street": "123 Medical Plaza", "city": "Salt Lake City", "state": "UT", "zip": "84101"}',
  'jsmith@moonlit-practice.com',
  TRUE,
  TRUE
);

-- =============================================================================
-- SAMPLE RESIDENT PHYSICIANS
-- =============================================================================
INSERT INTO providers (name, npi, type, phone, address, email, is_supervising, is_active)
VALUES
(
  'Dr. John Doe, PGY-3',
  '3456789012', -- Replace with actual resident NPI
  'individual',
  '801-555-0102',
  '{"street": "123 Medical Plaza", "city": "Salt Lake City", "state": "UT", "zip": "84101"}',
  'jdoe@moonlit-practice.com',
  FALSE,
  TRUE
),
(
  'Dr. Sarah Johnson, PGY-2',
  '4567890123', -- Replace with actual resident NPI
  'individual',
  '801-555-0103',
  '{"street": "123 Medical Plaza", "city": "Salt Lake City", "state": "UT", "zip": "84101"}',
  'sjohnson@moonlit-practice.com',
  FALSE,
  TRUE
);

-- =============================================================================
-- MAJOR INSURANCE PAYERS
-- Note: Office Ally Payer IDs need to be verified for your specific configuration
-- =============================================================================

-- Medicare
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Medicare', 'MEDICARE', 'MEDICARE', FALSE, TRUE);

-- Medicaid
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Medicaid', 'MEDICAID', 'MEDICAID', FALSE, TRUE);

-- Blue Cross Blue Shield
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Blue Cross Blue Shield', 'BCBS', 'BCBS', FALSE, TRUE);

-- Aetna
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Aetna', 'AETNA', 'AETNA', TRUE, TRUE);

-- UnitedHealthcare
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('UnitedHealthcare', 'UNITED', 'UNITED', FALSE, TRUE);

-- Cigna
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Cigna', 'CIGNA', 'CIGNA', TRUE, TRUE);

-- Humana
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Humana', 'HUMANA', 'HUMANA', FALSE, TRUE);

-- Anthem
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Anthem', 'ANTHEM', 'ANTHEM', FALSE, TRUE);

-- Tricare
INSERT INTO payers (name, office_ally_payer_id_837p, office_ally_payer_id_835, requires_supervising_npi, is_active)
VALUES ('Tricare', 'TRICARE', 'TRICARE', TRUE, TRUE);

-- =============================================================================
-- VERIFICATION QUERIES
-- Run these to verify seed data was inserted correctly
-- =============================================================================

-- Verify providers
-- SELECT * FROM providers ORDER BY is_supervising DESC, name;

-- Verify payers
-- SELECT name, office_ally_payer_id_837p, requires_supervising_npi FROM payers ORDER BY name;

-- Count records
-- SELECT
--   (SELECT COUNT(*) FROM providers) as provider_count,
--   (SELECT COUNT(*) FROM payers) as payer_count;

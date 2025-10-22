-- Migration 010: Helper Functions for Event Sourcing and Claim Management
-- SQL functions to support the FOLLOWING_CLAIMS.md architecture

-- =============================================================================
-- FUNCTION: Generate CLM01 (Patient Control Number)
-- Creates a unique claim identifier for X12 837 submission
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_clm01()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_date_part TEXT;
  v_sequence INTEGER;
  v_clm01 TEXT;
BEGIN
  -- Use pattern: ML-YYYYMMDD-XXXX
  -- ML = Moonlit prefix
  -- YYYYMMDD = Current date
  -- XXXX = Daily sequence number

  v_prefix := 'ML';
  v_date_part := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Get next sequence for today
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(clm01 FROM LENGTH(v_prefix) + LENGTH(v_date_part) + 3)
      AS INTEGER
    )
  ), 0) + 1
  INTO v_sequence
  FROM claims
  WHERE clm01 LIKE v_prefix || '-' || v_date_part || '-%';

  -- Format with leading zeros (4 digits)
  v_clm01 := v_prefix || '-' || v_date_part || '-' || LPAD(v_sequence::TEXT, 4, '0');

  RETURN v_clm01;
END;
$$;

-- =============================================================================
-- FUNCTION: Record Claim Event (Idempotent)
-- Records an event in the claim_events table with deduplication
-- =============================================================================
CREATE OR REPLACE FUNCTION record_claim_event(
  p_claim_id UUID,
  p_event_type TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_raw_file_id UUID DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash TEXT;
  v_event_id UUID;
BEGIN
  -- Generate hash for idempotency
  -- Hash includes claim_id, event_type, and details to prevent duplicates
  v_hash := encode(
    digest(
      p_claim_id::TEXT || p_event_type || p_details::TEXT || COALESCE(p_raw_file_id::TEXT, ''),
      'sha256'
    ),
    'hex'
  );

  -- Try to insert (will fail silently if duplicate hash exists)
  INSERT INTO claim_events (
    claim_id,
    event_type,
    occurred_at,
    raw_file_id,
    details,
    hash_sha256,
    created_by
  )
  VALUES (
    p_claim_id,
    p_event_type,
    p_occurred_at,
    p_raw_file_id,
    p_details,
    v_hash,
    p_created_by
  )
  ON CONFLICT (claim_id, event_type, hash_sha256) DO NOTHING
  RETURNING id INTO v_event_id;

  -- If insert was successful, update claim's updated_at
  IF v_event_id IS NOT NULL THEN
    UPDATE claims
    SET updated_at = NOW()
    WHERE id = p_claim_id;
  END IF;

  RETURN v_event_id;
END;
$$;

-- =============================================================================
-- FUNCTION: Upsert Payer ICN
-- Stores or updates a payer's claim control number
-- =============================================================================
CREATE OR REPLACE FUNCTION upsert_payer_icn(
  p_claim_id UUID,
  p_icn TEXT,
  p_id_type TEXT DEFAULT 'ICN'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO claim_identifiers (
    claim_id,
    system,
    id_type,
    value
  )
  VALUES (
    p_claim_id,
    'payer',
    p_id_type,
    p_icn
  )
  ON CONFLICT (claim_id, system, id_type, value) DO NOTHING;
END;
$$;

-- =============================================================================
-- FUNCTION: Derive Claim Status from Events
-- Determines current status based on event precedence
-- =============================================================================
CREATE OR REPLACE FUNCTION derive_claim_status(p_claim_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_has_835 BOOLEAN;
  v_has_277_pended BOOLEAN;
  v_has_277ca_reject BOOLEAN;
  v_has_277ca_accept BOOLEAN;
  v_has_999 BOOLEAN;
  v_last_835_status TEXT;
BEGIN
  -- Check for 835 remittance (highest precedence)
  SELECT EXISTS(
    SELECT 1 FROM claim_events
    WHERE claim_id = p_claim_id
    AND event_type IN ('remit_835_header', 'remit_835_detail')
  ) INTO v_has_835;

  IF v_has_835 THEN
    -- Get the actual status from the most recent 835
    SELECT rc.claim_status_code
    INTO v_last_835_status
    FROM remit_claims rc
    WHERE rc.claim_id = p_claim_id
    ORDER BY rc.created_at DESC
    LIMIT 1;

    -- Map 835 status codes to our status enum
    v_status := CASE v_last_835_status
      WHEN '1' THEN 'paid'
      WHEN '2' THEN 'denied'
      WHEN '3' THEN 'partial'
      WHEN '4' THEN 'pended'
      WHEN '22' THEN 'void'
      ELSE 'in_process'
    END;

    RETURN v_status;
  END IF;

  -- Check for 277 pended status
  SELECT EXISTS(
    SELECT 1 FROM claim_events
    WHERE claim_id = p_claim_id
    AND event_type = 'status_277'
    AND details->>'pended' = 'true'
  ) INTO v_has_277_pended;

  IF v_has_277_pended THEN
    RETURN 'pended';
  END IF;

  -- Check for 277CA rejection
  SELECT EXISTS(
    SELECT 1 FROM claim_events
    WHERE claim_id = p_claim_id
    AND event_type = 'reject_277ca'
  ) INTO v_has_277ca_reject;

  IF v_has_277ca_reject THEN
    RETURN 'clearinghouse_rejected';
  END IF;

  -- Check for 277CA acceptance
  SELECT EXISTS(
    SELECT 1 FROM claim_events
    WHERE claim_id = p_claim_id
    AND event_type = 'accept_277ca'
  ) INTO v_has_277ca_accept;

  IF v_has_277ca_accept THEN
    RETURN 'payer_accepted';
  END IF;

  -- Check for 999 acknowledgment
  SELECT EXISTS(
    SELECT 1 FROM claim_events
    WHERE claim_id = p_claim_id
    AND event_type = 'ack_999'
  ) INTO v_has_999;

  IF v_has_999 THEN
    RETURN 'submitted';
  END IF;

  -- Default to current status in claims table
  SELECT status INTO v_status FROM claims WHERE id = p_claim_id;
  RETURN COALESCE(v_status, 'draft');
END;
$$;

-- =============================================================================
-- FUNCTION: Try Match Claim (ERA to Internal)
-- Attempts to match an ERA claim to our internal claim
-- =============================================================================
CREATE OR REPLACE FUNCTION try_match_era_claim(
  p_remit_claim_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_claim_id UUID;
  v_remit_claim RECORD;
  v_match_method TEXT;
  v_match_confidence NUMERIC;
BEGIN
  -- Get the remit claim details
  SELECT * INTO v_remit_claim
  FROM remit_claims
  WHERE id = p_remit_claim_id;

  -- Priority 1: Match by payer ICN
  IF v_remit_claim.payer_icn IS NOT NULL THEN
    SELECT ci.claim_id INTO v_claim_id
    FROM claim_identifiers ci
    WHERE ci.system = 'payer'
    AND ci.id_type IN ('ICN', 'TCN', 'CCN')
    AND ci.value = v_remit_claim.payer_icn
    LIMIT 1;

    IF v_claim_id IS NOT NULL THEN
      v_match_method := 'icn';
      v_match_confidence := 1.00;
    END IF;
  END IF;

  -- Priority 2: Match by CLM01 (patient control number)
  IF v_claim_id IS NULL AND v_remit_claim.patient_control_no IS NOT NULL THEN
    SELECT id INTO v_claim_id
    FROM claims
    WHERE clm01 = v_remit_claim.patient_control_no
    LIMIT 1;

    IF v_claim_id IS NOT NULL THEN
      v_match_method := 'clm01';
      v_match_confidence := 0.95;
    END IF;
  END IF;

  -- Priority 3: Match by tuple (subscriber, dates, amount)
  IF v_claim_id IS NULL THEN
    SELECT c.id INTO v_claim_id
    FROM claims c
    WHERE c.subscriber_id = v_remit_claim.subscriber_identifier
    AND v_remit_claim.service_date_from BETWEEN c.dos_from AND c.dos_to
    AND ABS(c.submitted_charge_total - v_remit_claim.claim_charge_amt) < 0.01
    LIMIT 1;

    IF v_claim_id IS NOT NULL THEN
      v_match_method := 'tuple';
      v_match_confidence := 0.80;
    END IF;
  END IF;

  -- Update the remit_claim with match results
  IF v_claim_id IS NOT NULL THEN
    UPDATE remit_claims
    SET
      claim_id = v_claim_id,
      match_status = 'matched',
      match_method = v_match_method,
      match_confidence = v_match_confidence,
      matched_at = NOW()
    WHERE id = p_remit_claim_id;

    -- Store the payer ICN if we have it
    IF v_remit_claim.payer_icn IS NOT NULL THEN
      PERFORM upsert_payer_icn(v_claim_id, v_remit_claim.payer_icn);
    END IF;

    -- Record the remittance event
    PERFORM record_claim_event(
      v_claim_id,
      'remit_835_detail',
      jsonb_build_object(
        'remit_claim_id', p_remit_claim_id,
        'paid_amount', v_remit_claim.claim_paid_amt,
        'patient_resp', v_remit_claim.patient_resp_amt,
        'status_code', v_remit_claim.claim_status_code
      )
    );
  END IF;

  RETURN v_claim_id;
END;
$$;

-- =============================================================================
-- FUNCTION: Calculate Claim Adjustments
-- Aggregates adjustment amounts by CARC code
-- =============================================================================
CREATE OR REPLACE FUNCTION calculate_claim_adjustments(p_claim_id UUID)
RETURNS TABLE(
  adjustment_group TEXT,
  adjustment_code TEXT,
  adjustment_description TEXT,
  total_amount NUMERIC(12,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    adj->>'group' AS adjustment_group,
    adj->>'code' AS adjustment_code,
    COALESCE(carc.description, 'Unknown adjustment') AS adjustment_description,
    SUM((adj->>'amount')::NUMERIC) AS total_amount
  FROM remit_claims rc
  JOIN remit_lines rl ON rl.remit_claim_id = rc.id
  CROSS JOIN LATERAL jsonb_array_elements(rl.cas_adjustments) AS adj
  LEFT JOIN carc_codes carc ON carc.code = adj->>'code'
  WHERE rc.claim_id = p_claim_id
  GROUP BY adj->>'group', adj->>'code', carc.description
  ORDER BY adjustment_group, adjustment_code;
END;
$$;

-- =============================================================================
-- FUNCTION: Refresh Claim Financial Status
-- Updates claim with latest financial information from ERAs
-- =============================================================================
CREATE OR REPLACE FUNCTION refresh_claim_financial_status(p_claim_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_paid_amount NUMERIC;
  v_status TEXT;
BEGIN
  -- Calculate total paid from all ERAs
  SELECT COALESCE(SUM(claim_paid_amt), 0)
  INTO v_paid_amount
  FROM remit_claims
  WHERE claim_id = p_claim_id;

  -- Derive current status
  v_status := derive_claim_status(p_claim_id);

  -- Update claim
  UPDATE claims
  SET
    paid_amount = v_paid_amount,
    status = v_status,
    updated_at = NOW()
  WHERE id = p_claim_id;
END;
$$;

-- =============================================================================
-- TRIGGER: Auto-generate CLM01 on claim insert
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_generate_clm01()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clm01 IS NULL THEN
    NEW.clm01 := generate_clm01();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_generate_clm01
  BEFORE INSERT ON claims
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_clm01();

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON FUNCTION generate_clm01() IS 'Generates unique patient control number for X12 837 CLM01 field';
COMMENT ON FUNCTION record_claim_event IS 'Records claim lifecycle events with idempotency protection';
COMMENT ON FUNCTION upsert_payer_icn IS 'Stores payer-assigned claim control numbers';
COMMENT ON FUNCTION derive_claim_status IS 'Determines claim status based on event precedence';
COMMENT ON FUNCTION try_match_era_claim IS 'Matches ERA remittance claims to internal claims using priority rules';
COMMENT ON FUNCTION calculate_claim_adjustments IS 'Aggregates claim adjustments by CARC code';
COMMENT ON FUNCTION refresh_claim_financial_status IS 'Updates claim with latest payment information from ERAs';
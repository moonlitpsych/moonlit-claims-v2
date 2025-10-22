# FOLLOWING_CLAIMS.md Integration - Implementation Guide

## Overview

This document describes the integration of the FOLLOWING_CLAIMS.md architecture into the moonlit-claims-v2 project. The integration adds comprehensive claims tracking capabilities, event sourcing, and ERA matching to our existing claim submission system.

## What Was Implemented

### Phase 0.5 & 0.6: Foundation Work (COMPLETED)

We've successfully integrated the foundation of the FOLLOWING_CLAIMS architecture through four migration files and supporting services:

### 1. Migration 007: Essential Tracking Fields

**File:** `supabase/migrations/007_essential_tracking_fields.sql`

Added critical fields to the `claims` table:
- `clm01` - Patient Control Number (unique identifier for X12)
- `dos_from` / `dos_to` - Service date range
- `submitted_charge_total` - Total billed amount
- `billing_npi` / `billing_tin` - Provider identifiers
- `place_of_service` - Service location code
- `subscriber_id` - Member/policy ID
- Expanded status enum to support complete lifecycle

**Impact:** Enables deterministic ERA matching and proper claim tracking

### 2. Migration 008: Event Sourcing Foundation

**File:** `supabase/migrations/008_event_sourcing_foundation.sql`

Created core event-sourcing infrastructure:
- `claim_events` - Append-only event log with idempotency
- `claim_identifiers` - Cross-system ID mapping
- `raw_files` - X12 file storage with SHA256
- `carc_codes` / `rarc_codes` - Adjustment reason dictionaries

**Impact:** Full audit trail, time-travel debugging, and event-based status derivation

### 3. Migration 009: ERA Remittance Structure

**File:** `supabase/migrations/009_era_remittance_structure.sql`

Built complete 835 ERA processing structure:
- `remits_835` - ERA file headers
- `remit_claims` - Claim-level remittance data
- `remit_lines` - Service line adjustments
- `claim_lines` - Normalized service lines
- `status_277` - Claim status responses
- `v_claim_financials` - Materialized view for financial rollups

**Impact:** Ready for full financial reconciliation and line-level adjustment tracking

### 4. Migration 010: Helper Functions

**File:** `supabase/migrations/010_helper_functions.sql`

SQL functions for automation:
- `generate_clm01()` - Creates unique claim identifiers
- `record_claim_event()` - Idempotent event recording
- `derive_claim_status()` - Status from event precedence
- `try_match_era_claim()` - Priority-based ERA matching
- `calculate_claim_adjustments()` - CARC aggregation
- Auto-trigger for CLM01 generation

**Impact:** Automated claim tracking with minimal code changes

### 5. Event Logging Service

**File:** `services/events/claimEventsService.ts`

TypeScript service for event management:
- Record claim lifecycle events
- Handle X12 transaction events (837, 999, 277, 835)
- Store external identifiers
- Derive claim status from events
- Generate unique CLM01 identifiers

## How to Use the New Features

### Recording Claim Events

```typescript
import { recordClaimEvent, ClaimEventType } from '@/services/events/claimEventsService';

// Record claim submission
await recordClaimEvent(
  claimId,
  ClaimEventType.CLAIM_SUBMITTED,
  {
    clm01: 'ML-20241021-0001',
    total_charge: 450.00,
    payer: 'BCBS'
  }
);

// Record 835 remittance
await record835RemittanceEvent(
  claimId,
  {
    payerICN: '2599212269',
    claimStatusCode: '1', // Paid
    paidAmount: 308.07,
    patientResponsibility: 0,
    chargeAmount: 450.00
  }
);
```

### Generating CLM01

```typescript
import { generateCLM01 } from '@/services/events/claimEventsService';

// Generate unique patient control number
const { success, clm01 } = await generateCLM01();
// Returns: ML-20241021-0001
```

### Storing External Identifiers

```typescript
import { storeClaimIdentifier } from '@/services/events/claimEventsService';

// Store payer's ICN
await storeClaimIdentifier(
  claimId,
  'payer',
  'ICN',
  '2599212269'
);
```

## Database Schema Changes

### New Tables Created
1. `claim_events` - Event sourcing log
2. `claim_identifiers` - External ID mapping
3. `raw_files` - X12 file storage
4. `carc_codes` / `rarc_codes` - Adjustment dictionaries
5. `remits_835` - ERA headers
6. `remit_claims` - Claim-level remittance
7. `remit_lines` - Line-level adjustments
8. `claim_lines` - Normalized service lines
9. `status_277` - Status responses

### Enhanced Claims Table
- Added `clm01` with unique constraint
- Added date range fields (`dos_from`, `dos_to`)
- Added provider identifiers (`billing_npi`, `billing_tin`)
- Expanded status enum for complete lifecycle

## Migration Instructions

### Running the Migrations

1. **Apply migrations in order:**
```bash
npm run migrate:up
```

Or manually via Supabase SQL Editor:
```sql
-- Run each migration file in sequence
-- 007_essential_tracking_fields.sql
-- 008_event_sourcing_foundation.sql
-- 009_era_remittance_structure.sql
-- 010_helper_functions.sql
```

2. **Verify migration success:**
```sql
-- Check new tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('claim_events', 'claim_identifiers', 'raw_files');

-- Check CLM01 trigger works
INSERT INTO claims (intakeq_appointment_id, ...) VALUES (...);
-- Should auto-generate CLM01 like 'ML-20241021-0001'
```

### Handling Existing Claims

Existing claims are automatically handled:
- Legacy claims get CLM01 = 'LEGACY-{uuid}'
- Can be updated to proper CLM01 when resubmitted
- Event history starts from migration date

## Next Steps

### Immediate Benefits (Available Now)
✅ Event logging for audit trail
✅ CLM01 generation for X12 compliance
✅ External identifier storage
✅ Status derivation from events
✅ Financial tracking preparation

### Phase B: Ingestion Pipeline (Weeks 14-17)
To complete the FOLLOWING_CLAIMS integration:

1. **Build X12 Parsers**
   - 835 ERA parser
   - 277 Status parser
   - 999 Acknowledgment parser

2. **Implement Matching Logic**
   - Priority: ICN → CLM01 → Tuple
   - Auto-match on ingestion
   - Manual match UI for failures

3. **Create SFTP Poller**
   - Download 835/277 files daily
   - Store in `raw_files` table
   - Trigger parsing pipeline

4. **Build UI Components**
   - Claim timeline view
   - Financial reconciliation dashboard
   - Unmatched ERA report

## Testing

### Test Event Recording
```typescript
// Test script: scripts/test-event-logging.ts
import { recordClaimEvent, getClaimEvents } from '@/services/events/claimEventsService';

// Record test event
await recordClaimEvent('test-claim-id', ClaimEventType.CLAIM_CREATED);

// Fetch timeline
const { events } = await getClaimEvents('test-claim-id');
console.log(events);
```

### Test CLM01 Generation
```sql
-- Should generate sequential numbers
SELECT generate_clm01(); -- ML-20241021-0001
SELECT generate_clm01(); -- ML-20241021-0002
SELECT generate_clm01(); -- ML-20241021-0003
```

## Rollback Instructions

If needed, migrations can be rolled back:

```sql
-- Rollback in reverse order
DROP TABLE IF EXISTS remit_lines CASCADE;
DROP TABLE IF EXISTS remit_claims CASCADE;
DROP TABLE IF EXISTS remits_835 CASCADE;
DROP TABLE IF EXISTS status_277 CASCADE;
DROP TABLE IF EXISTS claim_lines CASCADE;
DROP TABLE IF EXISTS raw_files CASCADE;
DROP TABLE IF EXISTS claim_identifiers CASCADE;
DROP TABLE IF EXISTS claim_events CASCADE;
DROP TABLE IF EXISTS carc_codes CASCADE;
DROP TABLE IF EXISTS rarc_codes CASCADE;

-- Remove added columns from claims
ALTER TABLE claims
DROP COLUMN IF EXISTS clm01,
DROP COLUMN IF EXISTS dos_from,
DROP COLUMN IF EXISTS dos_to,
DROP COLUMN IF EXISTS submitted_charge_total,
DROP COLUMN IF EXISTS billing_npi,
DROP COLUMN IF EXISTS billing_tin,
DROP COLUMN IF EXISTS rendering_npi,
DROP COLUMN IF EXISTS subscriber_id,
DROP COLUMN IF EXISTS place_of_service,
DROP COLUMN IF EXISTS taxonomy,
DROP COLUMN IF EXISTS oa_claim_id,
DROP COLUMN IF EXISTS oa_batch_id;

-- Drop functions
DROP FUNCTION IF EXISTS generate_clm01() CASCADE;
DROP FUNCTION IF EXISTS record_claim_event() CASCADE;
DROP FUNCTION IF EXISTS derive_claim_status() CASCADE;
DROP FUNCTION IF EXISTS try_match_era_claim() CASCADE;
DROP FUNCTION IF EXISTS upsert_payer_icn() CASCADE;
```

## Architecture Benefits

### Why Event Sourcing?
1. **Perfect Audit Trail** - Every change is recorded
2. **Time-Travel Debugging** - See claim state at any point
3. **Event Replay** - Rebuild state from events
4. **No Data Loss** - Events are append-only

### Why Separate Identifiers Table?
1. **Multiple IDs Per Claim** - Payer ICN, OA ID, CLM01
2. **Efficient Matching** - Indexed lookups
3. **Flexible Mapping** - Add new systems easily

### Why Materialized Views?
1. **Performance** - Pre-computed financial rollups
2. **Consistency** - Single source of truth
3. **Simplicity** - Complex queries become simple

## Support

For questions about this integration:
1. Review FOLLOWING_CLAIMS.md for full specification
2. Check migration files for schema details
3. See claimEventsService.ts for usage examples
4. Consult test scripts for validation

## Version History

- **2024-10-21** - Initial implementation (Phase 0.5 & 0.6)
  - Created migrations 007-010
  - Built event logging service
  - Updated types for expanded statuses
  - Created this documentation
# IntakeQ Claims Backfill Guide

## Overview

This guide explains how to import existing claims from IntakeQ into your Moonlit Claims application, so you can see claim statuses on the dashboard immediately.

## What Was Built

✅ **IntakeQ Claims API Service** (`/services/intakeq/claims.ts`)
- Fetches claims from IntakeQ Claims API
- Maps IntakeQ status codes (0-105) to our ClaimStatus enum
- Handles pagination automatically

✅ **Status Mapping:**
```
IntakeQ Status → Our Status
─────────────────────────────
0 = Draft        → draft
1 = Validated    → validated
2 = Submitted    → submitted
4 = Rejected     → rejected
5 = Denied       → rejected
6 = Paid         → paid
7 = Deductible   → accepted
10 = Canceled    → rejected
100 = Acknowledged → accepted
101 = Processing → submitted
102 = Pending    → submitted
103 = NotFound   → rejected
104 = Adjudicated → accepted
105 = AdditionalInfoRequested → submitted
```

✅ **Backfill Script** (`/scripts/backfill-intakeq-claims.ts`)
- Imports all claims from IntakeQ
- Matches them to appointments via `AppointmentId`
- Avoids duplicates (checks for existing `intakeq_claim_id`)
- Provides detailed progress and statistics

✅ **Database Migration** (`/supabase/migrations/003_add_intakeq_claim_id.sql`)
- Adds `intakeq_claim_id` field to track IntakeQ claims
- Creates index for fast lookups

---

## Step-by-Step Setup

### Step 1: Run the Database Migration

Go to your Supabase project dashboard and run this SQL in the SQL Editor:

```sql
-- Add intakeq_claim_id field to claims table
ALTER TABLE claims ADD COLUMN IF NOT EXISTS intakeq_claim_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_claims_intakeq_claim_id ON claims(intakeq_claim_id);

-- Comment for documentation
COMMENT ON COLUMN claims.intakeq_claim_id IS 'IntakeQ claim ID for backfilled claims from IntakeQ Claims API';
```

### Step 2: Run the Backfill Script

**Option A: Import All Claims**
```bash
npx ts-node scripts/backfill-intakeq-claims.ts
```

**Option B: Import Claims from a Date Range**
```bash
npx ts-node scripts/backfill-intakeq-claims.ts --start-date 2025-01-01 --end-date 2025-12-31
```

### Step 3: Watch the Output

The script will show you:
- How many claims were found in IntakeQ
- Progress as it imports each claim
- Final statistics including:
  - Total claims imported
  - Skipped (already existed)
  - Errors
  - Status breakdown

Example output:
```
🚀 Starting IntakeQ Claims Backfill...

📅 Date Range: { startDate: 'All time', endDate: 'Now' }

📥 Fetching claims from IntakeQ...
✅ Found 127 claims

✅ Imported claim abc123 - Appointment: appt_456 - Status: Paid (paid)
✅ Imported claim def789 - Appointment: appt_012 - Status: Submitted (submitted)
⏭️  Skipping claim ghi345 (already exists)

============================================================
📊 Backfill Summary
============================================================
Total Claims Found:    127
✅ Imported:           120
⏭️  Skipped (existing):  5
❌ Errors:             2

📈 Status Breakdown:
   Paid                      45
   Submitted                 30
   Acknowledged              25
   Processing                15
   Rejected                  5
   Draft                     7
============================================================

🎉 Backfill completed successfully!
```

---

## How It Works

### Claim Matching

Claims from IntakeQ are matched to appointments using the `AppointmentId` field:

```typescript
intakeq_appointment_id: claim.AppointmentId  // Links to your appointments
```

When the dashboard loads:
1. Fetches appointments from IntakeQ Appointments API
2. Fetches claims from your database
3. Matches claims to appointments via `intakeq_appointment_id`
4. Displays the status on each appointment card

### Status Display

The dashboard will now show:
- **"Not Submitted"** - No claim exists for this appointment
- **"Draft"** - Claim created but not submitted
- **"Submitted"** - Claim submitted, awaiting response
- **"Accepted"** - Claim acknowledged/accepted by payer
- **"Paid"** - Claim paid
- **"Rejected"** - Claim rejected/denied

### Automatic Updates

Going forward:
1. **Old Claims (from IntakeQ):** Status is from IntakeQ API (static snapshot)
2. **New Claims (from your app):** Status updates automatically via Office Ally 277 files

---

## Troubleshooting

### Error: "intakeq_claim_id already exists"

This means you already ran the migration. You can safely ignore this.

### Error: "Could not match 277 status to claim"

This is expected for old claims. The 277 files from Office Ally contain statuses, but we can't match them because the claims weren't created through your app.

**Solution:** The backfill script imports claims with their IntakeQ status, so you'll see status immediately without needing 277 matching.

### No Claims Showing Up After Backfill

Check:
1. Did the backfill script complete successfully?
2. Check the database: `SELECT COUNT(*) FROM claims WHERE intakeq_claim_id IS NOT NULL;`
3. Check that appointments have matching `intakeq_appointment_id` values

### Claims Show Wrong Status

The status mapping is based on IntakeQ's status codes. If a claim shows an unexpected status:
1. Check the claim in IntakeQ to see its actual status number
2. Verify the mapping in `/services/intakeq/claims.ts` (INTAKEQ_STATUS_MAP)
3. Adjust if needed and re-run backfill

---

## Data Flow Diagram

```
IntakeQ Claims API
       ↓
  (Backfill Script)
       ↓
  Your Database
       ↓
  Dashboard API
       ↓
   Dashboard UI
```

**For New Claims (created in your app):**
```
Dashboard "Make My Claim"
       ↓
  Create in Database
       ↓
  Generate EDI File
       ↓
 Upload to Office Ally
       ↓
Office Ally Processes
       ↓
   277 Status File
       ↓
 Polling Downloads 277
       ↓
 Updates Database Status
       ↓
  Dashboard Shows Status
```

---

## Next Steps

1. ✅ Run the database migration (Step 1)
2. ✅ Run the backfill script (Step 2)
3. ✅ Verify claims appear on dashboard
4. 🔄 Going forward, create new claims through your app
5. 🔄 New claims will get real-time status updates from Office Ally

---

## API Reference

### IntakeQ Claims API

**Endpoint:** `GET https://intakeq.com/api/v1/claims`

**Query Parameters:**
- `clientId` (optional) - Filter by client
- `startDate` (optional) - Format: yyyy-MM-dd
- `endDate` (optional) - Format: yyyy-MM-dd
- `page` (optional) - Page number (max 100 per page)

**Headers:**
- `X-Auth-Key: your_intakeq_api_key`

**Response:** Array of claim objects with 70+ fields including:
- `Id` - Claim ID
- `AppointmentId` - Links to appointment
- `Status` - Status code (0-105)
- Patient/payer/provider information
- Diagnosis codes
- Procedure codes and charges

---

## Files Created

1. `/services/intakeq/claims.ts` - IntakeQ Claims API service
2. `/scripts/backfill-intakeq-claims.ts` - Backfill script
3. `/supabase/migrations/003_add_intakeq_claim_id.sql` - Database migration
4. `/scripts/run-migration.js` - Migration runner helper

---

*Last Updated: 2025-10-17*

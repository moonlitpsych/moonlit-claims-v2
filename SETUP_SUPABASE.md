# Supabase Setup Guide

## Current Status

✅ **Office Ally SFTP**: Fully configured and working
✅ **277 Claim Status System**: Built and ready
⚠️ **Supabase Database**: Needs configuration

## What You Need To Do

### Step 1: Create Supabase Project (if you haven't already)

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in / Create account
3. Create a new project:
   - Choose project name: `moonlit-claims` (or your preference)
   - Generate a strong database password
   - Choose region: US West (closest to you)

### Step 2: Get Your Supabase Credentials

1. Once your project is created, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) - Click "Reveal" button

### Step 3: Update .env.local

Replace the placeholder values in `.env.local`:

```bash
# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Step 4: Run Database Migration

1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy the entire contents of `supabase/migrations/001_claims_schema.sql`
4. Paste and click **Run**

This will create all the necessary tables:
- `claims` - Store all claim data
- `claim_submissions` - Track submission attempts
- `claim_status_updates` - Store 277 status updates
- `ai_coding_log` - Track AI coding attempts
- `eligibility_checks` - Store eligibility verification results
- `audit_log` - HIPAA-compliant audit trail

### Step 5: Verify Tables Were Created

In Supabase Dashboard:
1. Go to **Table Editor**
2. You should see all 6 tables listed
3. Click on `claims` table to verify structure

### Step 6: Re-enable Claim Status Fetching

In `app/dashboard/page.tsx`, uncomment the claim status fetching code:

1. Find the comment `// TODO: Re-enable after Supabase is configured`
2. Comment out the disabled code
3. Uncomment the full status fetching code block

### Step 7: Restart Development Server

```bash
# Stop the current server (Ctrl+C)
# Start it again
npm run dev
```

## What Happens Next

Once Supabase is configured:

1. **Dashboard** will show real claim statuses
2. **277 Files** will be downloaded from Office Ally SFTP every 30 seconds
3. **Claim statuses** will automatically update in the database
4. **Status badges** will show on each appointment card

## Testing the System

### Test 1: Create a Test Claim

1. Click "Make My Claim" on any completed appointment
2. Fill out the CMS-1500 form
3. Click "Validate Claim"
4. Click "Submit Claim"
5. Claim will be uploaded to Office Ally via SFTP

### Test 2: Check Claim Status

1. Wait ~30 seconds for status polling
2. The claim badge should update automatically
3. Check Supabase Table Editor → `claims` table to see your claim
4. Check `claim_status_updates` table to see 277 status responses

### Test 3: Download 277 Files Manually

Run the test script:
```bash
node scripts/test-277-download.js
```

This will show you all the claim statuses Office Ally has sent.

## Troubleshooting

### "Invalid supabaseUrl" Error

- Check that `NEXT_PUBLIC_SUPABASE_URL` is set correctly
- Must start with `https://`
- Example: `https://abcdefgh.supabase.co`

### "Invalid API key" Error

- Check that you copied the full key (they're very long)
- Make sure you're using the correct key for each variable
- Don't confuse `anon` key with `service_role` key

### Tables Not Created

- Make sure you ran the entire SQL migration script
- Check for errors in SQL Editor output
- The script should create all tables without errors

### 277 Files Not Processing

- First, verify SFTP connection works: `node scripts/test-sftp.js`
- Then test 277 download: `node scripts/test-277-download.js`
- Check server logs for errors

## Next Steps After Setup

Once Supabase is working:

1. **Submit test claims** through the interface
2. **Monitor 277 status updates** in the dashboard
3. **Test end-to-end workflow**:
   - Create claim → Submit → Wait for 277 → See status update
4. **Set up providers and payers** tables (if needed)

## Files Reference

- **Database Schema**: `supabase/migrations/001_claims_schema.sql`
- **Claims Service**: `services/supabase/claimsService.ts`
- **SFTP Client**: `services/officeAlly/sftpClient.ts`
- **277 Parser**: `services/officeAlly/claimStatusParser.ts`
- **Status Update API**: `app/api/claims/status-updates/route.ts`

## Support

If you encounter issues:
1. Check Supabase Dashboard → **Logs** for database errors
2. Check Next.js console for API errors
3. Run test scripts to verify individual components
4. Check `.env.local` for typos in credentials

---

**Ready to go!** Once you complete these steps, the full claims submission and status tracking system will be operational.

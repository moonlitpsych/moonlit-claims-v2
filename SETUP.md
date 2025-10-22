# Moonlit Claims - Setup Guide

This guide will walk you through setting up the Moonlit Claims application from scratch.

## Prerequisites Checklist

Before you begin, ensure you have:

- [ ] Node.js 18 or higher installed
- [ ] npm or yarn package manager
- [ ] Git installed
- [ ] Supabase account created
- [ ] IntakeQ API key
- [ ] Office Ally credentials (SFTP username, password, REALTIME API key)
- [ ] Google Gemini API key (with HIPAA BAA if handling real PHI)
- [ ] Code editor (VS Code recommended)

## Step-by-Step Setup

### 1. Project Setup

```bash
# Navigate to project directory
cd moonlit-claims-v2

# Install dependencies
npm install

# Verify installation
npm run type-check
```

### 2. Environment Configuration

Create `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Fill in all required environment variables. **Never commit `.env.local` to git.**

#### IntakeQ Configuration

1. Log into IntakeQ admin dashboard
2. Navigate to Settings → API Keys
3. Generate a new API key
4. Add to `.env.local`:
```bash
INTAKEQ_API_KEY=your_intakeq_api_key_here
```

#### Office Ally Configuration

**SFTP Credentials:**
1. Contact Office Ally support for SFTP credentials
2. Add to `.env.local`:
```bash
OFFICE_ALLY_SFTP_HOST=sftp.officeally.com
OFFICE_ALLY_SFTP_USER=your_username
OFFICE_ALLY_SFTP_PASSWORD=your_password
OFFICE_ALLY_SFTP_PORT=22
```

**REALTIME API:**
1. Obtain REALTIME API credentials from Office Ally
2. Add to `.env.local`:
```bash
OFFICE_ALLY_REALTIME_ENDPOINT=https://wsd.officeally.com/TransactionService/rtx.svc
OFFICE_ALLY_REALTIME_API_KEY=your_api_key
OFFICE_ALLY_SENDER_ID=your_sender_id
OFFICE_ALLY_PROVIDER_NPI=your_provider_npi
```

#### Google Gemini Configuration

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. **Important:** Ensure you have a BAA with Google for HIPAA compliance
4. Add to `.env.local`:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-pro
```

#### Supabase Configuration

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for project to finish provisioning
4. Go to Settings → API
5. Copy your project URL and keys
6. Add to `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Database Setup

#### Option A: Using Supabase Dashboard (Recommended for first-time setup)

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy and paste contents of `supabase/migrations/001_initial_schema.sql`
5. Click "Run"
6. Repeat for `supabase/migrations/002_seed_data.sql`

#### Option B: Using Supabase CLI

```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

#### Verify Database Setup

Run this query in Supabase SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see these 8 tables:
- `ai_coding_log`
- `audit_log`
- `claim_status_updates`
- `claim_submissions`
- `claims`
- `eligibility_checks`
- `payers`
- `providers`

### 4. Update Seed Data

The seed data contains placeholder values. Update them with your actual information:

**Providers:**
```sql
-- Update Moonlit Organization NPI
UPDATE providers
SET npi = 'YOUR_ACTUAL_TYPE_2_NPI'
WHERE name = 'MOONLIT PLLC';

-- Add your actual providers
-- Update existing or insert new rows
```

**Payers:**
```sql
-- Update Office Ally Payer IDs with your actual IDs
UPDATE payers
SET office_ally_payer_id_837p = 'YOUR_ACTUAL_PAYER_ID'
WHERE name = 'Medicare';

-- Repeat for all payers
-- These IDs are specific to your Office Ally account
```

### 5. Test API Connections

Create a test script to verify all integrations:

```bash
# Create test file
touch test-connections.ts
```

Add this content:

```typescript
import { intakeqService } from './services/intakeq/client';
import { officeAllyService } from './services/office-ally/client';
import { geminiService } from './services/gemini/client';
import { logger } from './utils/logger';

async function testConnections() {
  console.log('Testing API connections...\n');

  // Test IntakeQ
  try {
    const result = await intakeqService.getAppointments({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    console.log('✅ IntakeQ: Connected');
    console.log(`   Found ${result.data?.length || 0} appointments\n`);
  } catch (error) {
    console.log('❌ IntakeQ: Failed');
    console.log(`   Error: ${error}\n`);
  }

  // Test Office Ally SFTP
  try {
    const connected = await officeAllyService.testSFTPConnection();
    console.log(connected ? '✅ Office Ally SFTP: Connected\n' : '❌ Office Ally SFTP: Failed\n');
  } catch (error) {
    console.log('❌ Office Ally SFTP: Failed');
    console.log(`   Error: ${error}\n`);
  }

  // Test Gemini
  try {
    const connected = await geminiService.testConnection();
    console.log(connected ? '✅ Gemini AI: Connected\n' : '❌ Gemini AI: Failed\n');
  } catch (error) {
    console.log('❌ Gemini AI: Failed');
    console.log(`   Error: ${error}\n`);
  }
}

testConnections();
```

Run the test:
```bash
npx tsx test-connections.ts
```

All connections should show ✅.

### 6. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

You should see the Moonlit Claims welcome page.

## Troubleshooting

### IntakeQ Connection Issues

**Error: 401 Unauthorized**
- Verify your API key is correct
- Check that the API key has not expired
- Ensure you're using the correct IntakeQ account

**Error: ETIMEDOUT**
- Check your internet connection
- Verify IntakeQ is not having service issues
- Try increasing the timeout in `services/intakeq/client.ts`

### Office Ally SFTP Issues

**Error: Connection refused**
- Verify SFTP host and port are correct
- Check if your IP needs to be whitelisted
- Ensure firewall is not blocking port 22

**Error: Authentication failed**
- Double-check username and password
- Passwords with special characters may need escaping
- Contact Office Ally support to verify credentials

### Supabase Issues

**Error: Invalid project URL**
- Ensure project URL includes `https://` and `.supabase.co`
- Verify project is fully provisioned (not in setup state)

**Error: Invalid API key**
- Use anon key for client-side operations
- Use service role key for server-side operations
- Never expose service role key to the client

### Gemini API Issues

**Error: API key not valid**
- Verify API key is correct and active
- Check quota limits in Google AI Studio
- Ensure billing is enabled if required

**Error: Model not found**
- Verify GEMINI_MODEL environment variable
- Default to `gemini-pro` if unsure
- Check Google AI Studio for available models

## Next Steps

Once setup is complete:

1. ✅ Verify all API connections are working
2. ✅ Update seed data with your actual NPIs and payer IDs
3. 🔄 Begin Phase 1: Appointments Dashboard development
4. 📖 Read [CLAUDE.md](./CLAUDE.md) for full project specification

## Getting Help

If you encounter issues:

1. Check this troubleshooting guide
2. Review error logs in the console
3. Check the `audit_log` table in Supabase for HIPAA-compliant audit trail
4. Contact the development team

## Security Reminders

- ⚠️ Never commit `.env.local` to git
- ⚠️ Never expose service role key to the client
- ⚠️ Always log PHI access to `audit_log`
- ⚠️ Test in a non-production environment first
- ⚠️ Ensure BAA is in place with all third-party services handling PHI

---

**Setup Status:** Phase 0 Complete ✅
**Ready for:** Phase 1 Development
**Last Updated:** 2024

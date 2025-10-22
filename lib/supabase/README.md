# Supabase Database Setup Guide

## Overview

This directory contains the Supabase database configuration for the Moonlit Claims application. The database is designed with HIPAA compliance in mind, using PostgreSQL through Supabase.

## Database Schema

### Tables

1. **providers** - Healthcare providers (individuals and organizations)
2. **payers** - Insurance payers with Office Ally routing configuration
3. **claims** - Core claims data (CMS-1500 / X12 837P format)
4. **claim_submissions** - Submission history to Office Ally
5. **claim_status_updates** - Status updates from X12 remit responses
6. **ai_coding_log** - AI diagnosis and CPT code suggestions
7. **audit_log** - HIPAA-compliant audit trail
8. **eligibility_checks** - Insurance eligibility verification results

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and API keys

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run Migrations

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

#### Option B: Manual Migration via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `migrations/001_initial_schema.sql`
4. Execute the SQL
5. Repeat for `migrations/002_seed_data.sql`

### 4. Verify Setup

Run this query in the SQL Editor to verify tables were created:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see all 8 tables listed.

### 5. Update Seed Data

The seed data in `002_seed_data.sql` contains placeholder NPIs and Office Ally Payer IDs. Update these with your actual values:

1. **Moonlit Organization NPI** - Update the Type 2 NPI for Moonlit PLLC
2. **Provider NPIs** - Add actual supervising physician and resident NPIs
3. **Office Ally Payer IDs** - Update with your Office Ally-specific payer IDs for 837P and 835 transactions

## Security & HIPAA Compliance

### Row Level Security (RLS)

RLS is enabled on all tables but policies are not yet configured. Once authentication is implemented, add appropriate RLS policies.

For development, we're using the service role key which bypasses RLS. **Never expose service role key to the client.**

### Encryption

- All data is encrypted at rest by Supabase
- Use HTTPS for all connections (enforced by Supabase)
- Enable 2FA on your Supabase account

### Audit Logging

The `audit_log` table tracks all data access and modifications. Ensure all operations that access PHI are logged.

## Usage Examples

### Query Providers

```typescript
import { supabase } from '@/lib/supabase/client';

const { data: providers, error } = await supabase
  .from('providers')
  .select('*')
  .eq('is_active', true)
  .order('name');
```

### Create a Claim

```typescript
import { getServiceRoleClient } from '@/lib/supabase/client';

const supabase = getServiceRoleClient();

const { data: claim, error } = await supabase
  .from('claims')
  .insert({
    intakeq_appointment_id: 'appt_123',
    intakeq_client_id: 'client_456',
    intakeq_practitioner_id: 'pract_789',
    patient_info: { /* ... */ },
    insurance_info: { /* ... */ },
    rendering_provider_id: 'uuid',
    billing_provider_id: 'uuid',
    payer_id: 'uuid',
    diagnosis_codes: [],
    service_lines: [],
    claim_status: 'draft',
    ai_coding_used: false,
  })
  .select()
  .single();
```

### Log Audit Event

```typescript
await supabase.from('audit_log').insert({
  user_id: userId,
  action: 'claim_created',
  resource_type: 'claim',
  resource_id: claimId,
  changes: { /* before/after */ },
  ip_address: req.socket.remoteAddress,
  user_agent: req.headers['user-agent'],
});
```

## Maintenance

### Backups

Supabase automatically backs up your database. Configure backup retention in your project settings.

### Monitoring

- Monitor database performance in Supabase dashboard
- Set up alerts for unusual query patterns
- Regular audit log reviews

## Future Enhancements

- [ ] Add authentication and proper RLS policies
- [ ] Create database views for common queries
- [ ] Add stored procedures for complex operations
- [ ] Implement data retention policies
- [ ] Add indexes for frequently queried fields

# Moonlit Claims - AI-Powered Claims Submission Application

> Intelligent claims submission for Moonlit psychiatry practice, replacing manual IntakeQ workflows with AI-powered automation.

## 🎯 Project Overview

Moonlit Claims is a comprehensive claims submission application designed to:
- **Automate claim creation** from IntakeQ appointments
- **AI-powered diagnosis extraction** and CPT code assignment using Google Gemini
- **Real-time eligibility verification** via Office Ally
- **Reduce claim processing time by 50%**
- **Maintain HIPAA compliance** throughout the entire workflow

## 📊 Current Status: Phase 0 Complete ✅

**Foundation & Setup (Week 1)** - COMPLETED

- ✅ Next.js 14 + TypeScript project structure
- ✅ Supabase database schema with 8 tables
- ✅ HIPAA-compliant logging infrastructure
- ✅ API service layer (IntakeQ, Office Ally, Gemini)
- ✅ Comprehensive type definitions
- ✅ Environment configuration
- ✅ Security headers and HTTPS enforcement

**Next Phase: Phase 1 - Appointments Dashboard (Weeks 2-3)**

## 🏗️ Architecture

```
moonlit-claims-v2/
├── app/                          # Next.js 14 App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/                   # React components (Phase 1+)
├── lib/
│   ├── supabase/                # Supabase client & config
│   └── api/                     # API documentation
├── services/                    # External API integrations
│   ├── intakeq/                # IntakeQ API client
│   ├── office-ally/            # Office Ally SFTP & REALTIME
│   └── gemini/                 # Google Gemini AI service
├── utils/                      # Shared utilities
│   ├── logger.ts               # HIPAA-compliant logging
│   └── validators.ts           # Claim validation logic
├── types/                      # TypeScript definitions
├── supabase/
│   └── migrations/             # Database schema & seed data
└── public/                     # Static assets
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- IntakeQ API key
- Office Ally credentials (SFTP + REALTIME)
- Google Gemini API key (HIPAA-configured)

### Installation

1. **Clone the repository**
```bash
cd moonlit-claims-v2
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:
```bash
# IntakeQ
INTAKEQ_API_KEY=your_key_here

# Office Ally
OFFICE_ALLY_SFTP_HOST=your_host
OFFICE_ALLY_SFTP_USER=your_username
OFFICE_ALLY_SFTP_PASSWORD=your_password
OFFICE_ALLY_REALTIME_API_KEY=your_key

# Gemini
GEMINI_API_KEY=your_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

4. **Set up Supabase database**

See [Supabase Setup Guide](./lib/supabase/README.md) for detailed instructions.

Quick setup via Supabase SQL Editor:
- Run `supabase/migrations/001_initial_schema.sql`
- Run `supabase/migrations/002_seed_data.sql`
- Update seed data with your actual NPIs and Office Ally Payer IDs

5. **Run development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📋 Development Roadmap

### ✅ Phase 0: Foundation & Setup (Week 1) - COMPLETE

**Status: 100% Complete**

All infrastructure components are in place:
- Next.js 14 project with TypeScript
- Supabase database with comprehensive schema
- HIPAA-compliant logging system
- API service layer for all integrations
- Type definitions and validation utilities

### 🔄 Phase 1: Appointments Dashboard (Weeks 2-3) - NEXT

Build read-only dashboard displaying:
- All appointments from IntakeQ
- Claim status indicators
- Filtering and search functionality
- Date range selection

**Deliverables:**
- Functional appointments list component
- Office Ally status integration
- Responsive UI with loading states

### 📝 Phase 2: CMS-1500 Modal (Weeks 4-5)

Claim creation interface with:
- Auto-populated CMS-1500 form
- Rendering provider NPI logic
- Comprehensive validation
- Manual override capability

**Deliverables:**
- Working "Make My Claim" button
- Auto-population >90% accuracy
- Field-level validation

### 🤖 Phase 3: AI-Powered Coding (Weeks 6-7)

AI diagnosis extraction and CPT coding:
- "Code My Note" button
- Gemini API integration
- Confidence scores and reasoning
- Acceptance/override workflow

**Deliverables:**
- Diagnosis extraction >85% accuracy
- CPT code suggestion >85% accuracy
- Clear AI reasoning display

### 📄 Phase 4: EDI Generation (Week 8)

X12 837P EDI file generation:
- CMS-1500 to X12 mapping
- Office Ally-specific formatting
- Payer routing logic
- Validation against X12 spec

### 🚀 Phase 5: Claim Submission (Week 9)

Office Ally SFTP integration:
- Automated claim submission
- Submission tracking
- Error handling and retries
- Acknowledgment file processing

### ✅ Phase 6: Eligibility Verification (Week 10)

Real-time eligibility checks:
- Office Ally REALTIME API
- Coverage status display
- Copay and deductible info
- Pre-submission validation

### 🎨 Phase 7: Polish & Optimization (Weeks 11-12)

UX improvements and features:
- Bulk operations
- Smart defaults
- Analytics dashboard
- Performance optimization

### 🧪 Phase 8: Testing & Rollout (Week 13)

Production deployment:
- End-to-end testing
- User training
- Parallel processing with IntakeQ
- Full transition

## 🔒 HIPAA Compliance

### Security Features

- ✅ **Encryption at rest** - Supabase handles database encryption
- ✅ **Encryption in transit** - HTTPS enforced with strict security headers
- ✅ **Audit logging** - All PHI access logged to `audit_log` table
- ✅ **No PHI in application logs** - Sanitization automatically applied
- ✅ **Row Level Security** - Enabled on all tables (policies TBD)
- ✅ **Service isolation** - API keys stored in environment variables only

### PHI Handling Rules

**✅ DO:**
- Use patient/appointment IDs in logs
- Log all data access to audit_log
- Sanitize error messages before displaying to users
- Use service role key only on server side

**❌ DON'T:**
- Log patient names, DOB, or other PHI
- Return PHI in error messages
- Store PHI unnecessarily
- Expose service role key to client

### Logging Examples

```typescript
// ✅ GOOD - No PHI
logger.info('Claim created', {
  claimId: claim.id,
  appointmentId: appointment.id,
  status: 'draft',
});

// ❌ BAD - Contains PHI
logger.info('Claim created for John Doe, DOB 1990-01-01');

// ✅ GOOD - Audit logging
await logger.audit({
  userId: userId,
  action: 'claim_viewed',
  resourceType: 'claim',
  resourceId: claimId,
});
```

## 🧪 Testing

### Manual API Tests

**Test IntakeQ connection:**
```typescript
import { intakeqService } from '@/services/intakeq/client';

const result = await intakeqService.getAppointments({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});

console.log(result);
```

**Test Office Ally SFTP:**
```typescript
import { officeAllyService } from '@/services/office-ally/client';

const connected = await officeAllyService.testSFTPConnection();
console.log('SFTP Connected:', connected);
```

**Test Gemini AI:**
```typescript
import { geminiService } from '@/services/gemini/client';

const connected = await geminiService.testConnection();
console.log('Gemini Connected:', connected);
```

### Automated Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check
```

## 📚 Documentation

- [Supabase Database Guide](./lib/supabase/README.md)
- [API Documentation](./lib/api/README.md)
- [CLAUDE.md](./CLAUDE.md) - Comprehensive project specification

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm start                # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking

# Testing
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
```

## 📊 Key Features

### Completed (Phase 0)

- ✅ **HIPAA-Compliant Infrastructure** - Secure logging, encryption, audit trail
- ✅ **Comprehensive Database Schema** - 8 tables covering all claim workflows
- ✅ **IntakeQ Integration** - Appointments, Clients, Notes APIs
- ✅ **Office Ally Integration** - SFTP for claims, REALTIME for eligibility
- ✅ **Gemini AI Integration** - Diagnosis extraction and CPT coding
- ✅ **Type-Safe Development** - Full TypeScript with Zod validation

### Upcoming (Phase 1+)

- 🔄 **Appointments Dashboard** - Visual claim status tracking
- 📝 **Smart Claim Creation** - Auto-populated CMS-1500 forms
- 🤖 **AI-Powered Coding** - Automated diagnosis and CPT assignment
- 📄 **EDI Generation** - X12 837P file creation
- 🚀 **Automated Submission** - Office Ally SFTP integration
- ✅ **Eligibility Checks** - Real-time coverage verification

## 🤝 Contributing

This is a private project for Moonlit PLLC. For questions or issues, contact the development team.

## 📝 License

Proprietary - Moonlit PLLC

---

**Current Phase:** Phase 0 Complete ✅
**Next Milestone:** Appointments Dashboard (Phase 1)
**Last Updated:** 2024

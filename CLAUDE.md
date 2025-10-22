# Moonlit Claims Submission App - Development Guide

## Project Overview

**Mission:** Build a claims submission application for Moonlit, a psychiatry resident group practice, to replace the current IntakeQ-based manual claims workflow with an intelligent, AI-powered system.

**Primary User:** Practice administrator responsible for claims submission
**Tech Stack:** [To be determined based on team preferences - suggest React/Next.js frontend, Node.js backend]
**Timeline:** 13 weeks (phased development)

---

## Table of Contents
1. [Current Workflow & Pain Points](#current-workflow--pain-points)
2. [Technical Resources](#technical-resources)
3. [Core Features](#core-features)
4. [Architecture Overview](#architecture-overview)
5. [Development Roadmap](#development-roadmap)
6. [Data Models](#data-models)
7. [Security & Compliance](#security--compliance)
8. [API Integration Details](#api-integration-details)
9. [Testing Strategy](#testing-strategy)
10. [Deployment & Rollout](#deployment--rollout)

---

## Current Workflow & Pain Points

### How Claims Are Currently Submitted (IntakeQ)

1. **Navigate to appointment:** Log into IntakeQ admin → View team calendar → Click past visit → "More" → "Create Claim"
2. **Auto-population:** CMS-1500-shaped form with auto-populated patient demographics (sometimes incomplete)
3. **Manual diagnosis entry:** Look at previous claims or comb through treatment notes (time-consuming, unpleasant)
4. **Manual CPT code verification:** Check treatment notes to determine complexity level and psychotherapy time (modify 30-40% of the time)
5. **Validation:** Run basic sanity check for missing required fields
6. **Submission:** Convert to EDI format and send to Office Ally clearinghouse

### Key Pain Points to Solve

| Pain Point | Current State | Target Improvement |
|------------|---------------|-------------------|
| Manual diagnosis entry | Look through notes/previous claims | AI extracts diagnosis from notes |
| CPT code accuracy | Manual review of 30-40% of claims | AI determines complexity level with reasoning |
| Incomplete auto-population | Track down missing patient info | Better data mapping and validation |
| Time per claim | High (manual review required) | 50% reduction through automation |
| No status visibility | Must check separately | Real-time claim status in dashboard |
| No eligibility check | Done separately or not at all | Integrated pre-submission eligibility check |

---

## Technical Resources

### Available & Configured APIs

#### 1. Office Ally Integration
- **SFTP Connection:** Claim submission (EDI/X12 837P transactions)
- **REALTIME API:** Eligibility & benefits verification, copay information
- **Status:** Credentials configured and tested
- **Purpose:** Claims routing to payers, eligibility checks

#### 2. IntakeQ APIs

**Appointments API** ([docs](https://support.intakeq.com/article/204-intakeq-appointments-api))
```
Key Fields:
- Id (AppointmentId)
- ServiceId (contains CPT code information)
- PractitionerId, PractitionerName, PractitionerEmail
- ClientId
- StartDate, EndDate
```

**Clients API** ([docs](https://support.intakeq.com/article/251-intakeq-client-api))
```
Key Fields:
- ClientId
- Patient demographics (name, DOB, address, insurance info)
- Diagnoses (when populated by physicians)
- NoteId references
```

**Notes API** ([docs](https://support.intakeq.com/article/342-intakeq-notes-api))
```
Key Fields:
- NoteId
- Complete note contents (unstructured text)
- Metadata
```

**Invoice API** ([docs](https://support.intakeq.com/article/385-intakeq-invoice-api))
```
Key Fields:
- InvoiceId
- AppointmentId (links to specific appointment)
- ClientId
- Amount, AmountPaid, AmountDue
- Status (Paid, Unpaid, Partially Paid)
- PaymentDate
- LineItems (breakdown of charges including copays)
```

#### 3. Supabase Database
**Existing Tables:**
- **Providers:** Phone numbers, addresses, NPIs by provider, Moonlit's Type 2 NPI, address, phone
- **Payers:** All payers and their Office Ally Payer IDs (by transaction type: 835, 837P, etc.)

#### 4. Google Gemini API
- **Status:** HIPAA-compliant configuration ready
- **Purpose:** AI/ML tasks (diagnosis extraction, CPT coding)

---

## Core Features

### 1. Appointments Dashboard
**Purpose:** Central view of all appointments with claim status and copay tracking

**Features:**
- Display all group appointments from IntakeQ
- Show: Date (StartDate, EndDate), Physician (PractitionerId), Patient (ClientId)
- Filter by date range, physician, claim status
- Search functionality
- Claim status indicators (X12 remit responses from Office Ally)
  - Not Submitted
  - Pending
  - Accepted
  - Rejected
  - Paid
- **Copay status indicators** (Phase 6)
  - Visual icon showing copay payment status
  - Color-coded: Green (Paid), Yellow (Owed), Gray (Not Required/Unknown)
  - Click to view details (expected amount, payment date, link to invoice)
  - Data from Office Ally REALTIME (expected copay) + IntakeQ Invoice API (payment status)
- Action buttons per appointment:
  - "Make My Claim"
  - "Code My Note"

### 2. Make My Claim (CMS-1500 Modal)
**Purpose:** Generate and submit claims with maximum auto-population

**Auto-Population Logic:**

| Field Category | Data Source | Logic |
|----------------|-------------|-------|
| Patient Info | IntakeQ Clients API | Demographics, DOB, address |
| Insured Info | IntakeQ Clients API | Insurance details, policy numbers |
| Billing Provider | Supabase Providers | Always Moonlit (Type 2 NPI) |
| Rendering Provider | Supabase Providers + Logic | NPI selection based on payer credentialing |
| Service Info | IntakeQ ServiceId | CPT codes from appointment type |
| Diagnoses | IntakeQ Clients API | Pull patient diagnoses (if populated) |
| Place of Service | IntakeQ/Logic | Auto-populate based on appointment type |

**Rendering Provider NPI Logic:**
```
IMPORTANT: Not all payers credential with residents
- Query payer from claim
- Check if payer requires supervising physician NPI
- If yes: Use supervising physician's NPI
- If no: Use resident's NPI
- Store this mapping in Supabase for easy updates
```

**Features:**
- All fields editable (manual override)
- Visual indicators: auto-populated vs. manually-entered fields
- Real-time field validation
- "Validate" button (comprehensive checks before submission)
- If diagnoses are null → Prompt to use "Code My Note"
- EDI packaging for Office Ally format
- Submit to Office Ally via SFTP

### 3. Code My Note (AI-Powered Coding)
**Purpose:** Use AI to extract diagnoses and assign CPT codes from unstructured notes

**Workflow:**
1. Click "Code My Note" button
2. Fetch complete note contents via IntakeQ Notes API
3. Send to Google Gemini API with structured prompts

**AI Task 1: Diagnosis Extraction**
```
Input: Unstructured note text
Output:
- Primary diagnosis (name + ICD-10 code)
- Secondary diagnoses (if applicable)
- Confidence level (high/medium/low)
- Reasoning: Where in note was diagnosis found or how was it inferred

Prompt Guidelines:
- Look for explicit diagnosis mentions first
- If not explicit, infer from symptoms, treatment, medications
- Return structured JSON response
- Explain inference process if diagnosis not explicitly stated
```

**AI Task 2: CPT Code Assignment**
```
Input: Unstructured note text
Output:
- CPT code (moderate vs. high complexity E/M)
- Confidence level (high/medium/low)
- Concise reasoning adhering to AMA criteria
- Key factors from note that determined complexity

Prompt Guidelines:
- Reference AMA E/M criteria for outpatient psychiatry
- Check against moderate vs. high-complexity MDM definitions
- Consider:
  - Number/complexity of problems addressed
  - Amount/complexity of data reviewed
  - Risk of complications/morbidity
- Assess psychotherapy time (for add-on codes)
- Return structured JSON response with thought process
```

**UI Display:**
- Show AI suggestions in user-friendly format
- Display confidence levels clearly
- Show reasoning/thought process for transparency
- One-click acceptance or manual override
- Allow editing before applying to claim

### 4. Eligibility & Benefits Check
**Purpose:** Verify coverage before claim submission

**Features:**
- "Check Eligibility" button on dashboard
- Query Office Ally REALTIME API
- Display:
  - Coverage status (active/inactive)
  - Benefit details
  - Copay amounts
  - Deductible info
- Flag potential issues before claim creation

---

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/Next.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Appointments │  │  CMS-1500    │  │  Eligibility │      │
│  │  Dashboard   │  │    Modal     │  │    Check     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js/Express)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   IntakeQ    │  │    Gemini    │  │ Office Ally  │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     EDI      │  │ Validation   │  │   Claims     │      │
│  │  Generator   │  │   Service    │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer (Supabase)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Providers   │  │    Payers    │  │    Claims    │      │
│  │    Table     │  │    Table     │  │    Table     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     External Systems                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   IntakeQ    │  │ Office Ally  │  │   Gemini     │      │
│  │     API      │  │ SFTP/REALTIME│  │     API      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **HIPAA Compliance First**
   - All PHI encrypted at rest and in transit
   - Audit logging for all data access
   - Secure credential management (environment variables, secrets manager)
   - HIPAA-compliant AI (Gemini configured properly)

2. **Data Flow**
   - IntakeQ is source of truth for appointments, patients, notes
   - Local database caches claim state and submission history
   - Office Ally is destination for claims
   - Never store complete PHI unnecessarily

3. **Error Handling**
   - Graceful degradation when APIs unavailable
   - Comprehensive validation before submission
   - User-friendly error messages
   - Detailed logging for debugging

4. **Validation Layers**
   - Frontend: Immediate user feedback
   - Backend: Business logic validation
   - Pre-submission: Office Ally compatibility checks
   - Post-generation: EDI format validation

---

## Development Roadmap

### Phase 0: Foundation & Setup (Week 1)
**Status:** Not Started
**Goal:** Establish core infrastructure and validate all connections

**Tasks:**
- [ ] Set up development environment
- [ ] Configure secure credential management (env vars, secrets)
- [ ] Test all API connections:
  - [ ] IntakeQ Appointments API
  - [ ] IntakeQ Clients API
  - [ ] IntakeQ Notes API
  - [ ] Office Ally SFTP
  - [ ] Office Ally REALTIME
  - [ ] Gemini API
  - [ ] Supabase database
- [ ] Set up HIPAA-compliant logging infrastructure
- [ ] Design data models (see Data Models section)
- [ ] Define claim state machine

**Deliverables:**
- Working connections to all external systems
- Documented data models
- Development environment ready

**Testing:**
- Successful API calls to each service
- Credentials securely stored
- Logs properly capturing events (no PHI in logs)

---

### Phase 1: Read-Only Dashboard (Weeks 2-3)
**Status:** ✅ COMPLETED
**Goal:** Build appointments dashboard with read-only data display

**Tasks:**
- [ ] Frontend setup (React/Next.js)
- [ ] Create appointments list component
  - [ ] Fetch from IntakeQ Appointments API
  - [ ] Display: Date, Physician, Patient, Status
  - [ ] Implement sorting and filtering
  - [ ] Add date range selector (default: last 30 days)
  - [ ] Implement search functionality
- [ ] Integrate Office Ally status checks
  - [ ] Fetch X12 remit responses
  - [ ] Parse and display status
  - [ ] Create status badge components
- [ ] UI/UX polish
  - [ ] Loading states
  - [ ] Error handling
  - [ ] Responsive design

**Deliverables:**
- Functional dashboard displaying all appointments
- Claim status indicators visible
- Filtering and search working

**Testing:**
- Load 100+ appointments without performance issues
- Verify status indicators match Office Ally data
- Test filters and search accuracy

---

### Phase 2: CMS-1500 Modal (Auto-Population) (Weeks 4-5)
**Status:** ✅ COMPLETED
**Goal:** Build claim creation interface with maximum auto-population

**Tasks:**
- [ ] Create CMS-1500 modal component
  - [ ] Design layout matching CMS-1500 form structure
  - [ ] Implement all standard fields
  - [ ] Make fields editable
  - [ ] Add visual indicators (auto-populated vs. manual)
- [ ] Implement auto-population logic
  - [ ] Patient Info from IntakeQ Clients API
  - [ ] Insured Info from IntakeQ Clients API
  - [ ] Billing Provider from Supabase
  - [ ] Rendering Provider NPI logic
  - [ ] Service codes from IntakeQ ServiceId
  - [ ] Diagnoses from IntakeQ (when available)
- [ ] Build validation engine
  - [ ] Required field checks
  - [ ] Format validation (NPI, dates, etc.)
  - [ ] Business logic validation
  - [ ] "Validate" button functionality
- [ ] Add "Make My Claim" button to dashboard
  - [ ] Click → Fetch data → Open modal with populated fields

**Deliverables:**
- Working CMS-1500 modal with auto-population
- Validation engine preventing invalid submissions
- All fields editable for manual override

**Testing:**
- Test with various appointment types
- Verify auto-population accuracy (>90% target)
- Test validation catches common errors
- Edge cases: missing patient info, new patients

---

### Phase 3: AI-Powered Note Coding (Weeks 6-7)
**Status:** Not Started
**Goal:** Implement LLM-based diagnosis and CPT code extraction

**Tasks:**
- [ ] Note retrieval system
  - [ ] Fetch notes via IntakeQ Notes API
  - [ ] Display note in readable format
  - [ ] Create note viewer component (modal or side panel)
- [ ] Gemini integration for diagnosis extraction
  - [ ] Design prompt template
  - [ ] Implement API call
  - [ ] Parse structured response
  - [ ] Handle edge cases (no clear diagnosis, multiple diagnoses)
- [ ] Gemini integration for CPT coding
  - [ ] Design prompt with AMA E/M criteria
  - [ ] Implement API call
  - [ ] Parse structured response
  - [ ] Handle psychotherapy add-on logic
- [ ] Build "Code My Note" button
  - [ ] Trigger both AI tasks
  - [ ] Display results in user-friendly UI
  - [ ] Show confidence levels and reasoning
  - [ ] One-click acceptance or manual override
  - [ ] Apply selected codes to claim form

**Deliverables:**
- Working "Code My Note" button
- AI suggestions with reasoning displayed
- Acceptance/override workflow functional

**Testing:**
- Test with 20+ diverse notes
- Compare AI coding to manual coding (accuracy target: 85%+)
- Verify reasoning is clear and follows AMA criteria
- Test edge cases: very short notes, complex cases

**Prompt Engineering Notes:**
```
Store prompt templates in configuration files for easy iteration.
Track prompt versions and performance metrics.
Consider A/B testing different prompt structures.
```

---

### Phase 4: EDI Generation & Validation (Week 8)
**Status:** Not Started
**Goal:** Convert claim data to X12 837P format

**Tasks:**
- [ ] Research EDI libraries
  - [ ] Evaluate Node.js EDI generators
  - [ ] Review Office Ally-specific requirements
  - [ ] Select library or build custom generator
- [ ] Implement CMS-1500 to X12 837P mapping
  - [ ] Map all CMS-1500 fields to X12 segments
  - [ ] Handle loops and hierarchical structure
  - [ ] Implement data transformation layer
- [ ] Enhanced validation
  - [ ] Office Ally-specific rules
  - [ ] Payer-specific validation (if applicable)
  - [ ] Common rejection prevention
- [ ] Payer ID mapping
  - [ ] Query Supabase for Office Ally Payer ID
  - [ ] Handle routing based on transaction type (837P)
  - [ ] Build payer selection logic

**Deliverables:**
- EDI generator producing valid X12 837P files
- Comprehensive validation preventing rejections
- Correct payer routing

**Testing:**
- Generate EDI files for test claims
- Validate against X12 837P specification
- Test with Office Ally validation tools (if available)
- Verify payer ID mapping is correct

**EDI Notes:**
```
X12 837P is complex. Consider using a battle-tested library.
Office Ally may have specific formatting requirements beyond standard X12.
Keep EDI generation logic modular for easy debugging.
```

---

### Phase 5: Claim Submission (Week 9)
**Status:** Not Started
**Goal:** Submit claims to Office Ally via SFTP

**Tasks:**
- [ ] SFTP upload implementation
  - [ ] Secure connection to Office Ally SFTP
  - [ ] File upload logic
  - [ ] Batch submission capability
  - [ ] Receipt/confirmation handling
- [ ] Submission tracking
  - [ ] Record submission in local database
  - [ ] Update claim status
  - [ ] Store submission timestamp and metadata
  - [ ] Implement submission history log
- [ ] Error handling
  - [ ] Connection failure handling
  - [ ] Retry logic (exponential backoff)
  - [ ] Alert on repeated failures
  - [ ] User notification system

**Deliverables:**
- End-to-end claim submission working
- Submission tracking in database
- Robust error handling

**Testing:**
- Submit test claims to Office Ally
- Verify claims received and processed
- Test error scenarios (network issues, invalid files)
- Test batch submission with 10+ claims

---

### Phase 6: Eligibility & Benefits Check + Copay Tracking (Week 10)
**Status:** Not Started
**Goal:** Integrate real-time eligibility verification and copay payment tracking

**Tasks:**
- [ ] REALTIME API integration
  - [ ] Connect to Office Ally REALTIME endpoint
  - [ ] Implement eligibility query
  - [ ] Parse response data
- [ ] Display eligibility information
  - [ ] Coverage status
  - [ ] Benefit details
  - [ ] Copay amounts
  - [ ] Deductible information
- [ ] Pre-submission checks
  - [ ] Add "Check Eligibility" button
  - [ ] Flag potential coverage issues
  - [ ] Integrate with claim creation workflow
- [ ] **Copay Tracking Dashboard Integration**
  - [ ] Integrate IntakeQ Invoice API ([docs](https://support.intakeq.com/article/385-intakeq-invoice-api))
  - [ ] Add copay status icon next to claim status on each appointment row
  - [ ] Display copay indicator showing:
    - Whether patient owes a copay (from Office Ally REALTIME)
    - Whether copay has been paid (from IntakeQ Invoice API)
  - [ ] Visual states:
    - ✅ Copay Paid (green): Copay collected and recorded in IntakeQ
    - ⏳ Copay Owed (yellow): Copay required but not yet paid
    - ➖ No Copay (gray): No copay required per insurance
    - ❓ Unknown (gray): Eligibility not yet checked
  - [ ] Click icon to view copay details modal:
    - Expected copay amount (from Office Ally)
    - Payment status (from IntakeQ invoices)
    - Payment date if paid
    - Link to IntakeQ invoice

**Deliverables:**
- Working eligibility check
- Clear display of coverage information
- Warnings for inactive coverage
- Copay tracking visual indicators on dashboard
- Integration with IntakeQ Invoice API for payment status

**Testing:**
- Test with various insurance providers
- Verify copay data accuracy
- Test edge cases (no coverage, multiple policies)
- Test copay tracking with paid/unpaid invoices
- Verify IntakeQ Invoice API integration

---

### Phase 7: Polish & Optimization (Weeks 11-12)
**Status:** Not Started
**Goal:** Enhance UX and add convenience features

**Tasks:**
- [ ] Bulk operations
  - [ ] Multi-select appointments
  - [ ] Bulk "Code My Note"
  - [ ] Batch claim submission
- [ ] Smart defaults & learning
  - [ ] Remember user preferences
  - [ ] Suggest codes based on patterns
  - [ ] Quick-fill templates
- [ ] Reporting & analytics
  - [ ] Claims metrics dashboard
  - [ ] Rejection rate tracking
  - [ ] Revenue cycle insights
- [ ] UX refinements
  - [ ] Keyboard shortcuts
  - [ ] Improved error messages
  - [ ] Tutorial/onboarding flow
  - [ ] Performance optimization

**Deliverables:**
- Production-ready application
- Analytics dashboard
- Comprehensive user documentation

**Testing:**
- User acceptance testing with claims staff
- Performance testing with realistic data volumes
- Accessibility testing

---

### Phase 8: Testing & Rollout (Week 13)
**Status:** Not Started
**Goal:** Comprehensive testing and production deployment

**Tasks:**
- [ ] End-to-end testing
  - [ ] Test all workflows
  - [ ] Edge case handling
  - [ ] Load testing
- [ ] Documentation
  - [ ] User guide for claims staff
  - [ ] Technical documentation
  - [ ] Troubleshooting guide
  - [ ] API documentation
- [ ] Gradual rollout
  - [ ] Parallel processing (IntakeQ + new app)
  - [ ] Compare results for accuracy
  - [ ] Monitor for issues
  - [ ] Full transition plan

**Deliverables:**
- Fully tested application
- Complete documentation
- Successful production deployment

**Testing:**
- Final UAT with all staff
- Parallel processing for 1-2 weeks
- Compare submission accuracy
- Monitor Office Ally acceptance rates

---

## Data Models

### Local Database Schema (Supabase)

#### Existing Tables

**providers**
```sql
Table: providers
Columns:
- id (uuid, primary key)
- name (text)
- npi (text, unique)
- type (enum: 'individual', 'organization')
- phone (text)
- address (jsonb)
- email (text)
- is_supervising (boolean)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

**payers**
```sql
Table: payers
Columns:
- id (uuid, primary key)
- name (text)
- office_ally_payer_id_837p (text)
- office_ally_payer_id_835 (text)
- requires_supervising_npi (boolean)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

#### New Tables to Create

**claims**
```sql
Table: claims
Columns:
- id (uuid, primary key)
- intakeq_appointment_id (text, unique)
- intakeq_client_id (text)
- intakeq_practitioner_id (text)
- patient_info (jsonb) -- Cached patient demographics
- insurance_info (jsonb) -- Cached insurance information
- rendering_provider_id (uuid, FK to providers)
- billing_provider_id (uuid, FK to providers)
- payer_id (uuid, FK to payers)
- diagnosis_codes (jsonb) -- Array of ICD-10 codes
- service_lines (jsonb) -- Array of CPT codes with details
- claim_status (enum: 'draft', 'validated', 'submitted', 'accepted', 'rejected', 'paid')
- submission_date (timestamp)
- edi_file_path (text) -- Path to generated EDI file
- edi_content (text) -- Full EDI content for debugging
- office_ally_transaction_id (text)
- validation_errors (jsonb)
- ai_coding_used (boolean)
- ai_coding_details (jsonb) -- Store AI reasoning for audit
- manual_overrides (jsonb) -- Track what was manually changed
- created_by (uuid) -- User who created claim
- created_at (timestamp)
- updated_at (timestamp)
```

**claim_submissions**
```sql
Table: claim_submissions
Columns:
- id (uuid, primary key)
- claim_id (uuid, FK to claims)
- submission_method (enum: 'sftp', 'manual')
- status (enum: 'pending', 'success', 'failed')
- office_ally_response (jsonb)
- error_message (text)
- submitted_at (timestamp)
- created_at (timestamp)
```

**claim_status_updates**
```sql
Table: claim_status_updates
Columns:
- id (uuid, primary key)
- claim_id (uuid, FK to claims)
- status (text) -- From X12 remit responses
- status_code (text)
- status_date (timestamp)
- remit_data (jsonb) -- Full remit response
- created_at (timestamp)
```

**ai_coding_log**
```sql
Table: ai_coding_log
Columns:
- id (uuid, primary key)
- claim_id (uuid, FK to claims)
- intakeq_note_id (text)
- note_content_hash (text) -- Hash for deduplication
- diagnosis_suggestions (jsonb)
- cpt_suggestions (jsonb)
- gemini_response_raw (jsonb)
- accepted (boolean) -- Did user accept suggestions?
- manual_modifications (jsonb)
- processing_time_ms (integer)
- created_at (timestamp)
```

**audit_log**
```sql
Table: audit_log
Columns:
- id (uuid, primary key)
- user_id (uuid)
- action (text) -- e.g., 'claim_created', 'claim_submitted'
- resource_type (text) -- e.g., 'claim', 'appointment'
- resource_id (uuid)
- changes (jsonb) -- Before/after for updates
- ip_address (inet)
- user_agent (text)
- created_at (timestamp)
```

**eligibility_checks**
```sql
Table: eligibility_checks
Columns:
- id (uuid, primary key)
- intakeq_client_id (text)
- payer_id (uuid, FK to payers)
- check_date (timestamp)
- coverage_status (text)
- benefits_data (jsonb)
- copay_amount (numeric)
- deductible_info (jsonb)
- office_ally_response (jsonb)
- created_at (timestamp)
```

**copay_tracking**
```sql
Table: copay_tracking
Columns:
- id (uuid, primary key)
- intakeq_appointment_id (text, unique)
- intakeq_invoice_id (text)
- intakeq_client_id (text)
- expected_copay_amount (numeric) -- From Office Ally eligibility check
- actual_copay_amount (numeric) -- From IntakeQ invoice
- payment_status (enum: 'unknown', 'not_required', 'owed', 'paid', 'waived')
- payment_date (timestamp) -- When copay was collected
- eligibility_check_id (uuid, FK to eligibility_checks) -- Link to eligibility data
- intakeq_invoice_data (jsonb) -- Full invoice response for reference
- notes (text) -- Manual notes about copay (e.g., "Patient financial hardship waiver")
- last_synced_at (timestamp) -- Last time we checked IntakeQ Invoice API
- created_at (timestamp)
- updated_at (timestamp)
```

### Claim State Machine

```
draft → validated → submitted → accepted/rejected → paid
  ↓         ↓          ↓              ↓
  └─────────┴──────────┴──────────────┴──→ Can return to draft for edits
```

**State Transitions:**
- **draft:** Initial state, claim being created/edited
- **validated:** Passed all validation checks, ready to submit
- **submitted:** EDI file sent to Office Ally
- **accepted:** Payer accepted claim (from X12 277 or 835)
- **rejected:** Payer rejected claim (from X12 277 or 835)
- **paid:** Payment received (from X12 835)

---

## Security & Compliance

### HIPAA Requirements

**PHI Handling:**
1. **Encryption at Rest**
   - All database tables with PHI must be encrypted
   - Use Supabase encryption features
   - EDI files stored encrypted

2. **Encryption in Transit**
   - HTTPS for all API calls
   - TLS 1.2+ for SFTP connections
   - Secure WebSocket connections if used

3. **Access Controls**
   - Role-based access control (RBAC)
   - Minimum necessary principle
   - Audit all PHI access

4. **Audit Logging**
   - Log all data access and modifications
   - Include: user, timestamp, action, resource
   - Never log PHI in plain text logs
   - Store audit logs separately with retention policy

5. **Data Retention**
   - Define retention policy for claims (typically 7 years)
   - Secure deletion process for expired data
   - Backup and disaster recovery plan

### Gemini API HIPAA Configuration

```javascript
// Example configuration for HIPAA-compliant Gemini usage
const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY,
  // Ensure HIPAA compliance settings are enabled
  dataProcessingAddendum: true,
  // Do not allow model training on our data
  useForTraining: false,
  // Set appropriate timeout
  timeout: 30000,
};
```

**Important:**
- Verify BAA (Business Associate Agreement) with Google for Gemini
- Never send more PHI than necessary to AI
- Consider de-identification before AI processing when possible
- Log all AI interactions for audit purposes

### Credential Management

**Never hardcode credentials. Use environment variables:**

```bash
# IntakeQ
INTAKEQ_API_KEY=xxx

# Office Ally
OFFICE_ALLY_SFTP_HOST=xxx
OFFICE_ALLY_SFTP_USER=xxx
OFFICE_ALLY_SFTP_PASSWORD=xxx
OFFICE_ALLY_REALTIME_API_KEY=xxx

# Gemini
GEMINI_API_KEY=xxx

# Supabase
SUPABASE_URL=xxx
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Application
APP_SECRET=xxx
JWT_SECRET=xxx
```

**Use a secrets manager in production (AWS Secrets Manager, Vault, etc.)**

### Error Handling & Logging

**Logging Best Practices:**
```javascript
// ✅ GOOD - No PHI in logs
logger.info('Claim created', {
  claimId: claim.id,
  appointmentId: appointment.id,
  practitionerId: appointment.practitionerId,
});

// ❌ BAD - Contains PHI
logger.info('Claim created for patient John Doe, DOB 1990-01-01');

// ✅ GOOD - Structured error without PHI
logger.error('Claim submission failed', {
  claimId: claim.id,
  error: error.message,
  errorCode: error.code,
});
```

---

## API Integration Details

### IntakeQ APIs

#### Authentication
```javascript
// All IntakeQ API calls require API key in header
const headers = {
  'X-Auth-Key': process.env.INTAKEQ_API_KEY,
  'Content-Type': 'application/json',
};
```

#### Appointments API
**GET /api/v1/appointments**
```javascript
// Fetch appointments with date range
const params = {
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  practitionerId: 'optional', // Filter by practitioner
  clientId: 'optional', // Filter by client
};

// Response structure
{
  appointments: [
    {
      id: 'appt_123',
      serviceId: 'service_456',
      serviceName: 'Psychiatric Follow-up',
      practitionerId: 'pract_789',
      practitionerName: 'Dr. Smith',
      practitionerEmail: 'smith@moonlit.com',
      clientId: 'client_101',
      startDate: '2024-03-15T10:00:00Z',
      endDate: '2024-03-15T11:00:00Z',
      status: 'completed',
    },
    // ... more appointments
  ]
}
```

#### Clients API
**GET /api/v1/clients/{clientId}**
```javascript
// Response structure
{
  id: 'client_101',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
  email: 'jane.doe@email.com',
  phone: '555-0123',
  address: {
    street: '123 Main St',
    city: 'Salt Lake City',
    state: 'UT',
    zip: '84101',
  },
  insurance: {
    primary: {
      carrier: 'Blue Cross',
      memberId: 'ABC123456',
      groupId: 'GRP789',
      subscriberFirstName: 'Jane',
      subscriberLastName: 'Doe',
      subscriberDateOfBirth: '1990-01-15',
      relationshipToSubscriber: 'self',
    },
    // secondary insurance if applicable
  },
  diagnoses: [
    {
      code: 'F41.1',
      description: 'Generalized anxiety disorder',
      isPrimary: true,
    },
    // ... more diagnoses
  ],
}
```

#### Notes API
**GET /api/v1/notes/{noteId}**
```javascript
// Response structure
{
  id: 'note_456',
  appointmentId: 'appt_123',
  clientId: 'client_101',
  practitionerId: 'pract_789',
  createdDate: '2024-03-15T11:05:00Z',
  noteType: 'Progress Note',
  content: 'Full note text here...',
  // May include structured fields if template used
  fields: {
    chiefComplaint: '...',
    assessment: '...',
    plan: '...',
  },
}
```

#### Invoice API
**GET /api/v1/invoices?appointmentId={appointmentId}**
```javascript
// Fetch invoices for a specific appointment
const params = {
  appointmentId: 'appt_123', // Filter by appointment
  // Can also filter by: clientId, status, dateFrom, dateTo
};

// Response structure
{
  invoices: [
    {
      id: 'inv_789',
      appointmentId: 'appt_123',
      clientId: 'client_101',
      amount: 150.00,
      amountPaid: 30.00,
      amountDue: 120.00,
      status: 'PartiallyPaid', // 'Paid', 'Unpaid', 'PartiallyPaid'
      createdDate: '2024-03-15T12:00:00Z',
      paidDate: '2024-03-15T12:30:00Z',
      lineItems: [
        {
          description: 'Copay',
          amount: 30.00,
          paid: true,
        },
        {
          description: 'Session Fee',
          amount: 120.00,
          paid: false,
        },
      ],
    },
  ]
}
```

**Copay Detection Logic:**
```javascript
// Determine copay status from invoice data
function getCopayStatus(invoice, expectedCopay) {
  if (!invoice) return 'unknown';

  // Look for copay line item
  const copayItem = invoice.lineItems?.find(
    item => item.description.toLowerCase().includes('copay')
  );

  if (!copayItem && expectedCopay === 0) return 'not_required';
  if (!copayItem) return 'unknown';

  if (copayItem.paid) {
    return 'paid';
  } else {
    return 'owed';
  }
}
```

### Office Ally APIs

#### SFTP Connection
```javascript
// Connection details
const sftpConfig = {
  host: process.env.OFFICE_ALLY_SFTP_HOST,
  port: 22,
  username: process.env.OFFICE_ALLY_SFTP_USER,
  password: process.env.OFFICE_ALLY_SFTP_PASSWORD,
};

// Upload EDI file
// File naming convention: [YourID]_[Timestamp].837
// Example: MOONLIT_20240315120000.837
```

**Upload Process:**
1. Generate EDI file (X12 837P format)
2. Name file according to Office Ally convention
3. Connect to SFTP server
4. Upload to designated directory
5. Disconnect
6. Monitor for acknowledgment files (997, 999)

#### REALTIME API
**Eligibility Check Request**
```javascript
// POST to REALTIME endpoint
const eligibilityRequest = {
  payerId: 'BCBSUT', // Office Ally payer ID
  provider: {
    npi: '1234567890',
  },
  subscriber: {
    memberId: 'ABC123456',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
  },
  serviceDate: '2024-03-15',
};

// Response structure (X12 271)
{
  eligibilityStatus: 'active',
  coverage: {
    mentalHealth: {
      active: true,
      copay: 30.00,
      deductible: {
        individual: 1000.00,
        remaining: 600.00,
      },
    },
  },
  // ... more benefit details
}
```

### Gemini API

#### Diagnosis Extraction Prompt
```javascript
const diagnosisPrompt = `
You are a medical coding assistant specializing in psychiatry. 
Extract the primary and any secondary psychiatric diagnoses from the following clinical note.

Instructions:
1. Look for explicitly stated diagnoses first
2. If no explicit diagnosis, infer from symptoms, medications, and treatment described
3. Provide ICD-10 code for each diagnosis
4. Rate your confidence: high (>90%), medium (70-90%), low (<70%)
5. Explain your reasoning briefly

Clinical Note:
${noteContent}

Respond in the following JSON format:
{
  "primaryDiagnosis": {
    "condition": "Diagnosis name",
    "icd10Code": "F41.1",
    "confidence": "high|medium|low",
    "reasoning": "Brief explanation of how diagnosis was determined"
  },
  "secondaryDiagnoses": [
    {
      "condition": "Diagnosis name",
      "icd10Code": "F33.1",
      "confidence": "high|medium|low",
      "reasoning": "Brief explanation"
    }
  ]
}
`;
```

#### CPT Code Assignment Prompt
```javascript
const cptPrompt = `
You are a medical coding expert specializing in psychiatric E/M coding.
Determine the appropriate CPT code for this psychiatric visit based on AMA criteria.

AMA Criteria for Outpatient Psychiatry E/M:
- 99214 (Moderate Complexity MDM): 2 of 3: multiple diagnoses/problems, moderate data review, moderate risk
- 99215 (High Complexity MDM): 2 of 3: extensive diagnoses/problems, extensive data review, high risk

Consider:
1. Number and complexity of problems addressed
2. Amount and complexity of data reviewed (labs, records, etc.)
3. Risk of complications, morbidity, mortality
4. Psychotherapy time (for add-on codes 90833, 90836, 90838)

Clinical Note:
${noteContent}

Respond in the following JSON format:
{
  "emCode": {
    "cptCode": "99214|99215",
    "confidence": "high|medium|low",
    "reasoning": "Concise explanation adhering to AMA criteria",
    "keyFactors": [
      "Problem complexity: ...",
      "Data reviewed: ...",
      "Risk level: ..."
    ]
  },
  "psychotherapyAddOn": {
    "applicable": true,
    "cptCode": "90833|90836|90838",
    "estimatedMinutes": 30,
    "confidence": "high|medium|low",
    "reasoning": "How psychotherapy time was estimated from note"
  }
}
`;
```

**API Call Example:**
```javascript
const generateContent = async (prompt) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistency
          maxOutputTokens: 1000,
        },
      }),
    }
  );
  
  const data = await response.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
};
```

---

## Testing Strategy

### Unit Tests
- Test individual functions and utilities
- Mock external API calls
- Test validation logic thoroughly
- Test EDI generation with known inputs

### Integration Tests
- Test API integrations with test accounts
- Test database operations
- Test claim generation end-to-end
- Test SFTP upload to test environment

### End-to-End Tests
- Test complete user workflows
- Parallel processing comparison (IntakeQ vs. new app)
- Load testing with realistic data volumes

### Test Data
**Create test dataset:**
- 50+ test appointments with various scenarios
- Mix of appointment types (initial, follow-up, therapy)
- Various insurance carriers
- Edge cases: no insurance, missing data, complex diagnoses

**Test Claims:**
- Generate test claims and compare to manually created claims
- Submit to Office Ally test environment
- Verify acceptance and processing

### AI Testing
**Prompt Performance Tracking:**
```
Track for each AI coding attempt:
- Diagnosis accuracy (vs. manual coding)
- CPT code accuracy (vs. manual coding)
- Confidence score calibration
- Processing time
- Token usage

Set targets:
- Diagnosis accuracy: >85%
- CPT code accuracy: >85%
- High confidence predictions: >90% accuracy
- Processing time: <10 seconds
```

---

## Deployment & Rollout

### Pre-Production Checklist
- [ ] All tests passing
- [ ] Security audit completed
- [ ] HIPAA compliance verified
- [ ] Documentation complete
- [ ] User training conducted
- [ ] Backup and disaster recovery plan in place

### Rollout Strategy

**Week 1: Parallel Processing**
- Use both IntakeQ and new app
- Submit claims through IntakeQ
- Generate claims with new app but don't submit
- Compare results for accuracy

**Week 2: Soft Launch**
- Submit 10-20% of claims through new app
- Monitor Office Ally acceptance rates
- Gather user feedback
- Fix any issues discovered

**Week 3: Ramp Up**
- Submit 50% of claims through new app
- Continue monitoring and gathering feedback
- Adjust workflows as needed

**Week 4: Full Transition**
- Submit 100% of claims through new app
- Keep IntakeQ as backup for 1 month
- Monitor success metrics

### Success Metrics

**Quantitative:**
- Time per claim (target: 50% reduction)
- Auto-population accuracy (target: >90%)
- AI coding accuracy (target: >85%)
- Claim acceptance rate (maintain or improve from baseline)
- First-pass acceptance rate

**Qualitative:**
- User satisfaction surveys
- Ease of use ratings
- Perceived time savings
- Stress reduction

### Monitoring & Maintenance

**Daily:**
- Check claim submission success rate
- Monitor for API failures
- Review error logs

**Weekly:**
- Review AI coding accuracy
- Analyze rejection reasons
- User feedback review

**Monthly:**
- Performance metrics dashboard
- Revenue cycle metrics
- Cost-benefit analysis
- Feature requests prioritization

---

## Development Notes & Best Practices

### Code Organization
```
project-root/
├── frontend/
│   ├── components/
│   │   ├── appointments/
│   │   │   ├── AppointmentsList.jsx
│   │   │   ├── AppointmentCard.jsx
│   │   │   └── StatusBadge.jsx
│   │   ├── claims/
│   │   │   ├── CMS1500Modal.jsx
│   │   │   ├── ClaimField.jsx
│   │   │   └── ValidationErrors.jsx
│   │   └── ai-coding/
│   │       ├── CodeMyNoteButton.jsx
│   │       ├── AIResultsDisplay.jsx
│   │       └── NoteViewer.jsx
│   ├── services/
│   │   ├── intakeqService.js
│   │   ├── officeAllyService.js
│   │   └── geminiService.js
│   └── utils/
│       ├── validation.js
│       ├── formatting.js
│       └── constants.js
├── backend/
│   ├── routes/
│   │   ├── appointments.js
│   │   ├── claims.js
│   │   └── eligibility.js
│   ├── services/
│   │   ├── intakeq/
│   │   ├── officeAlly/
│   │   ├── gemini/
│   │   └── edi/
│   ├── models/
│   │   └── claim.js
│   └── utils/
│       ├── validation.js
│       └── logger.js
├── database/
│   ├── migrations/
│   └── seeds/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    ├── API.md
    ├── USER_GUIDE.md
    └── TROUBLESHOOTING.md
```

### Git Workflow
- Use feature branches for all development
- Require code reviews before merging
- Tag releases (v0.1.0, v0.2.0, etc.)
- Keep main branch deployable

### Error Handling Patterns
```javascript
// Consistent error handling
try {
  const result = await externalAPI.call();
  return { success: true, data: result };
} catch (error) {
  logger.error('API call failed', {
    service: 'IntakeQ',
    endpoint: '/appointments',
    errorCode: error.code,
    errorMessage: error.message,
  });
  return {
    success: false,
    error: {
      message: 'Failed to fetch appointments',
      code: error.code,
      retryable: isRetryableError(error),
    },
  };
}
```

### Validation Helpers
```javascript
// Reusable validation functions
const validators = {
  npi: (value) => /^\d{10}$/.test(value),
  icd10: (value) => /^[A-Z]\d{2}(\.\d{1,4})?$/.test(value),
  cpt: (value) => /^\d{5}$/.test(value),
  date: (value) => !isNaN(Date.parse(value)),
  zipCode: (value) => /^\d{5}(-\d{4})?$/.test(value),
};
```

---

## FAQ & Troubleshooting

### Common Issues

**Q: IntakeQ API returns empty diagnoses**
A: Check if physician entered diagnoses in correct field. May need to extract from note using AI.

**Q: Office Ally rejects claim**
A: Check validation errors in rejection response. Common issues: invalid NPI, missing required fields, incorrect payer ID.

**Q: Gemini API timeout**
A: Note may be too long. Consider chunking or summarizing. Check API rate limits.

**Q: SFTP connection fails**
A: Verify credentials, check firewall rules, ensure IP whitelisting with Office Ally.

### Performance Optimization

**Caching Strategy:**
- Cache IntakeQ client data (short TTL: 1 hour)
- Cache provider/payer data (longer TTL: 24 hours)
- Cache eligibility checks (TTL: 1 week)

**Batch Processing:**
- Fetch appointments in batches
- Process AI coding in parallel (with rate limiting)
- Batch EDI submissions

### Monitoring Alerts

**Set up alerts for:**
- API failure rate >5%
- Claim rejection rate >10%
- AI processing time >30 seconds
- SFTP connection failures
- Database connection issues

---

## Appendix

### Useful Resources

**EDI/X12 Documentation:**
- X12 837P Implementation Guide
- Office Ally Developer Documentation
- CMS-1500 to 837P Mapping Guide

**Medical Coding:**
- AMA CPT Code Guidelines
- ICD-10-CM Official Guidelines
- CMS E/M Documentation Guidelines

**HIPAA Compliance:**
- HIPAA Security Rule
- HIPAA Privacy Rule
- HITECH Act Requirements

### Glossary

- **837P:** HIPAA standard electronic claim format for professional services
- **835:** Electronic remittance advice (payment explanation)
- **277:** Claim status response
- **997/999:** Functional acknowledgment (EDI received successfully)
- **CMS-1500:** Standard paper claim form for professional services
- **E/M:** Evaluation and Management services
- **EDI:** Electronic Data Interchange
- **ICD-10:** International Classification of Diseases, 10th revision
- **MDM:** Medical Decision Making
- **NPI:** National Provider Identifier
- **PHI:** Protected Health Information
- **Type 1 NPI:** Individual provider NPI
- **Type 2 NPI:** Organization NPI

---

## Version History

**v1.0.0** - Initial CLAUDE.md creation
- Complete project specification
- 8-phase development roadmap
- Technical architecture defined
- All API integrations documented

**v1.1.0** - Phase 1 & 2 Completion (2025-10-16)
- ✅ Appointments Dashboard fully functional
- ✅ CMS-1500 Claim Modal with intelligent auto-population
- ✅ IntakeQ Client API integration for patient/insurance data
- 📝 Key learnings documented below

---

## Implementation Notes & Key Learnings

### Phase 1 & 2 Completion Summary (Oct 2025)

#### What Was Built:

**1. Appointments Dashboard** (`/app/dashboard/page.tsx`)
- Successfully displays 100+ appointments from IntakeQ
- Real-time filtering by date range, status, and search
- Smooth UI with loading states and error handling
- "Make My Claim" and "Code My Note" action buttons (Code My Note to be implemented in Phase 3)

**2. CMS-1500 Claim Modal** (`/components/ClaimModal.tsx`)
- Full-featured modal with all standard CMS-1500 fields
- Intelligent auto-population from multiple sources
- Visual indicators: blue background = auto-populated, white = manual entry
- All fields editable for manual override
- Responsive design with proper form layout

**3. IntakeQ Integration** (`/services/intakeq/client.ts`, `/app/api/clients/[clientId]/route.ts`)
- Successfully integrated with IntakeQ Client API
- Correct endpoint usage: `GET /clients?search={clientId}&includeProfile=true`
- Fetches complete patient demographics and insurance data
- Handles both numeric and UUID client IDs

#### Critical API Discovery - IntakeQ Client API:

**IMPORTANT:** The IntakeQ Client API works differently than initially expected:

1. **Endpoint Structure:**
   - ❌ NOT: `/clients/{clientId}` (returns 404)
   - ✅ CORRECT: `/clients?search={clientId}&includeProfile=true`

2. **Insurance Field Names (Exact mapping needed for claims):**
   ```javascript
   // Primary Insurance
   - PrimaryInsuranceCompany → Insurance Company Name
   - PrimaryInsurancePolicyNumber → Member/Policy ID
   - PrimaryInsuranceGroupNumber → Group Number
   - PrimaryInsuranceHolderName → Subscriber Name
   - PrimaryInsuranceHolderDateOfBirth → Subscriber DOB (Unix timestamp)
   - PrimaryInsuranceRelationship → Relationship to Insured

   // Secondary Insurance (available but not yet implemented)
   - SecondaryInsuranceCompany
   - SecondaryInsurancePolicyNumber
   - SecondaryInsuranceGroupNumber
   - SecondaryInsuranceHolderName
   - SecondaryInsuranceHolderDateOfBirth
   - SecondaryInsuranceRelationship
   ```

3. **Patient Demographics Fields:**
   ```javascript
   - FirstName, LastName
   - DateOfBirth (Unix timestamp in milliseconds)
   - Address, City, State, Zip
   - HomePhone, MobilePhone
   - Email
   ```

4. **Date Handling:**
   - DateOfBirth comes as Unix timestamp (milliseconds)
   - Must convert: `new Date(timestamp * 1000).toISOString().split('T')[0]`
   - Insurance holder DOB follows same pattern

#### Auto-Population Logic:

The modal now intelligently fetches and populates data from:

1. **IntakeQ Client Data (Primary Source):**
   - Patient name, DOB, address, phone
   - Primary insurance company, member ID, group number
   - Subscriber name, DOB, relationship

2. **IntakeQ Appointment Data (Fallback):**
   - Patient name if not in client data
   - Patient phone if not in client data
   - Service date, place of service
   - Charges (from appointment price)

3. **Visual Tracking:**
   - Fields auto-populated from either source → Blue background
   - Empty fields or manual overrides → White background
   - User can always manually edit any field

#### Files Created/Modified:

**Created:**
- `/app/api/clients/[clientId]/route.ts` - Client data API endpoint
- `/app/api/intakes/[intakeId]/route.ts` - Intake forms API (explored but not primary data source)
- `/components/ClaimModal.tsx` - Full CMS-1500 modal component
- `/utils/intakeParser.ts` - Helper functions (for future intake parsing if needed)

**Modified:**
- `/services/intakeq/client.ts` - Added correct `getClient()` method
- `/app/dashboard/page.tsx` - Wired up ClaimModal
- `/types/index.ts` - Added IntakeQ type definitions

#### Known Limitations & Future Work:

1. **Diagnosis Codes:** Not yet implemented
   - Will be handled in Phase 3 with AI-powered note coding
   - IntakeQ does have a diagnoses field, but not consistently populated

2. **CPT Codes:** Not yet implemented
   - Will be determined from ServiceId mapping or AI coding in Phase 3

3. **Rendering Provider NPI Logic:** Not yet implemented
   - Need to query Supabase for provider data
   - Implement payer credentialing logic

4. **Validation Engine:** Basic validation only
   - Need comprehensive validation before submission
   - Format checks, business logic, Office Ally compatibility

5. **EDI Generation:** Not yet implemented (Phase 4)

6. **Claim Submission:** Not yet implemented (Phase 5)

#### Testing Notes:

- Tested with real IntakeQ data (100+ appointments)
- Test clients (ID 12, 13) don't have complete address/insurance data
- System correctly handles missing data gracefully
- Auto-population works when data exists in IntakeQ

#### Recommendations for Next Session:

1. **Phase 3: AI-Powered Note Coding**
   - Implement "Code My Note" button functionality
   - Integrate with IntakeQ Notes API
   - Set up Gemini API for diagnosis extraction and CPT coding
   - Create prompts based on the templates in this doc

2. **Provider Data Integration**
   - Connect to Supabase to fetch provider data
   - Implement rendering provider NPI selection logic
   - Handle payer credentialing requirements

3. **Enhanced Validation**
   - Build comprehensive validation engine
   - Add "Validate Claim" button functionality
   - Check required fields, formats, business rules

4. **Save/Draft Functionality**
   - Implement "Save Draft" button
   - Store partial claims in local database
   - Allow users to resume claim creation

---

## Notes for Claude Code

**When working on this project:**

1. **Always reference this document** before starting any new feature or phase
2. **Update this document** as architecture decisions are made
3. **Follow the phased approach** - don't skip ahead without completing prerequisites
4. **Test thoroughly** at each phase before moving forward
5. **Keep security top of mind** - HIPAA compliance is non-negotiable
6. **Ask clarifying questions** if any requirement is ambiguous
7. **Document decisions** - update this file with architectural choices and rationales

**Current Phase:** Phase 3 (AI-Powered Note Coding)
**Last Updated:** 2025-10-17
**Project Status:** Phases 1-2 Complete + IntakeQ Claims Backfill

---

### Session Update: 2025-10-17 - Claim Status Integration & Backfill

#### Issues Resolved:

**1. Webpack Native Module Bundling Issue** ✅
- **Problem**: Next.js webpack was trying to bundle ssh2 native `.node` files, causing build failures
- **Solution**: Implemented webpack externals configuration for server-side builds
- **Files Modified**: `/next.config.js`
- **Result**: Build succeeds, native modules work in API routes

**2. Zero Claims in Database (All Showing "Not Submitted")** ✅
- **Problem**: Dashboard showed all appointments as "Not Submitted" because no claims existed in database
- **Root Cause**: Claims exist in IntakeQ, but not in the new app's database
- **Solution**: Built IntakeQ Claims API backfill system

#### What Was Built:

**1. IntakeQ Claims API Integration** (`/services/intakeq/claims.ts`)
- Fetches claims from IntakeQ Claims API with pagination
- Maps IntakeQ status codes (0-105) to our ClaimStatus enum
- Handles all 15 IntakeQ claim statuses
- **Key Discovery**: API response format differs from documentation (uses PascalCase fields)
- **Critical Fix**: Dynamic API key loading to support dotenv in scripts

**2. Claims Backfill Script** (`/scripts/backfill-intakeq-claims.ts`)
- Imports all existing IntakeQ claims into database
- Matches claims to appointments via `AppointmentId` field in Procedures array
- Prevents duplicates (checks `intakeq_claim_id`)
- Provides detailed progress and statistics
- **Result**: Successfully imported 83 claims with 0 errors

**3. Database Migration** (`/supabase/migrations/003_add_intakeq_claim_id.sql`)
- Added `intakeq_claim_id` field to claims table (unique constraint)
- Created index for fast lookups
- Enables tracking of IntakeQ-sourced claims

**4. Status Code Mapping**
```javascript
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

#### Backfill Results:
- **Total Claims Found**: 83
- **Successfully Imported**: 83
- **Errors**: 0
- **Status Breakdown**:
  - Paid: 41
  - Processing: 20
  - Acknowledged: 14
  - Denied: 4
  - Draft: 2
  - Validated: 1
  - Rejected: 1

#### Performance Optimization:

**Auto-Refresh Frequency Adjustment**
- **Previous**: Poll Office Ally SFTP every 30 seconds
- **New**: Poll every 1 hour (3,600,000ms)
- **Reasoning**:
  - SFTP downloads are likely FREE (no documented fees)
  - Claim statuses don't change frequently
  - Reduces server load on both sides
  - Users can manually refresh anytime via "Update Statuses" button
- **Files Modified**: `/app/dashboard/page.tsx`

#### Key Technical Learnings:

**1. IntakeQ Claims API Quirks:**
- Endpoint: `GET /api/v1/claims`
- Returns max 100 claims per page (requires pagination)
- Response uses PascalCase field names (not camelCase)
- `AppointmentId` is nested in `Procedures` array, not top-level
- `PatientAccountNumber` is the claim ID (e.g., "C84P133")

**2. Dynamic Environment Variable Loading:**
- Module-level constants load before dotenv runs
- Scripts need dynamic functions to read env vars at runtime
- Fixed pattern:
```javascript
// ❌ Wrong (loads before dotenv)
const API_KEY = process.env.API_KEY;

// ✅ Correct (loads at runtime)
function getApiKey() {
  return process.env.API_KEY || '';
}
```

**3. Office Ally SFTP Pricing:**
- SFTP downloads appear to be FREE (no documented fees)
- Costs apply to: eligibility checks ($0.10/tx), claim submissions
- No charges for downloading 277 status files or 835 remittance files

#### Files Created:
- `/services/intakeq/claims.ts` - IntakeQ Claims API service
- `/scripts/backfill-intakeq-claims.ts` - Claims backfill script
- `/supabase/migrations/003_add_intakeq_claim_id.sql` - Database migration
- `/INTAKEQ_CLAIMS_BACKFILL_GUIDE.md` - Complete backfill documentation

#### Files Modified:
- `/next.config.js` - Webpack externals for native modules
- `/app/dashboard/page.tsx` - Auto-refresh reduced to 1 hour
- `/app/api/claims/submit/route.ts` - Fixed ClaimStatus enum usage
- `/services/officeAlly/sftpClient.ts` - TypeScript type fixes

#### Current State:
- ✅ Dashboard now displays correct claim statuses from IntakeQ
- ✅ 83 historical claims imported and matched to appointments
- ✅ Automatic status updates running hourly
- ✅ Manual refresh button available for instant updates
- ✅ Build system working with native modules

#### Next Steps for Phase 3:
1. Implement "Code My Note" functionality
2. Integrate IntakeQ Notes API
3. Set up Gemini API for AI coding
4. Build diagnosis extraction prompts
5. Build CPT coding prompts
6. Create note viewer modal

---

*This document is the single source of truth for the Moonlit Claims App development. Keep it updated as the project evolves.*
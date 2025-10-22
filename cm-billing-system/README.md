# CM Billing System

Contingency Management (CM) Billing System for Utah Medicaid Traditional FFS patients in acute care settings.

## 🎯 Project Overview

This system provides **real-time eligibility verification** for the CM program, ensuring patients are enrolled in Traditional Medicaid Fee-For-Service (Targeted Adult Medicaid) before enrollment and billing.

### Key Features

✅ **Real-time eligibility checking** via Office Ally X12 270/271
✅ **Traditional FFS detection** - distinguishes from managed care
✅ **Targeted Adult Medicaid identification**
✅ **Clear qualification status** - QUALIFIED / NOT QUALIFIED
✅ **Patient demographic retrieval** including Medicaid ID

## 🏗️ Architecture

```
cm-billing-system/
├── apps/
│   └── cpss-portal/           # CPSS staff interface (Next.js)
├── services/
│   └── eligibility-service/   # Office Ally X12 270/271 integration
├── test-data/                 # X12 271 sample responses
└── .env.local                 # Configuration (DO NOT COMMIT)
```

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- npm or yarn
- Office Ally credentials (already configured)

### 2. Installation

```bash
cd cm-billing-system
npm install
```

### 3. Environment Setup

The `.env.local` file is already configured with Office Ally credentials:

```bash
# Office Ally Configuration
OFFICE_ALLY_ENDPOINT=https://wsd.officeally.com/TransactionService/rtx.svc
OFFICE_ALLY_USERNAME=moonlit
OFFICE_ALLY_PASSWORD=h@i9hiS4}92PEwd5
OFFICE_ALLY_SENDER_ID=1161680
PROVIDER_NPI=1275348807
PROVIDER_NAME=MOONLIT_PLLC
```

### 4. Run the Application

```bash
# Start the CPSS Portal
npm run dev:cpss
```

Visit **http://localhost:3000** to access the eligibility checking interface.

## 🧪 Testing

### Test the X12 271 Parser

```bash
node test-jeremy-montoya.js
```

Expected output:
```
✅ SUCCESS: Jeremy Montoya QUALIFIES for CM Program
   - Enrolled in Targeted Adult Medicaid (Traditional FFS)
   - No managed care indicators detected
   - Eligible for H0038 billing
```

### Test Patient Data

The system includes test data for **Jeremy Montoya** (DOB: 1984-07-17):
- Click **"Load Test Data"** button in the UI
- Or use the real X12 271 sample in `test-data/`

## 📋 How It Works

### Eligibility Check Flow

```
User Input (Name + DOB)
    ↓
Generate X12 270 Request
    ↓
Send to Office Ally (SOAP/XML)
    ↓
Receive X12 271 Response
    ↓
Parse Response (Enhanced Parser)
    ↓
Detect Traditional FFS vs Managed Care
    ↓
Display Qualification Status
```

### Traditional FFS Detection Logic

The parser looks for specific markers in the X12 271 response:

1. **Utah Medicaid Payer**: `NM1*PR*2*MEDICAID UTAH*****PI*UTMCD`
2. **Targeted Adult Medicaid**: `*MC*TARGETED ADULT MEDICAID`
3. **No Managed Care**: Excludes Molina, SelectHealth, Anthem, etc.

### Qualification Statuses

| Status | Meaning | CM Eligible |
|--------|---------|-------------|
| ✅ **QUALIFIED** | Traditional FFS (Targeted Adult Medicaid) | YES |
| ⚠️ **ENROLLED BUT NOT QUALIFIED** | Managed care plan | NO |
| ❌ **NOT QUALIFIED** | Not enrolled in Utah Medicaid | NO |

## 🎨 User Interface

### Eligibility Checking Form

**Input Fields:**
- First Name
- Last Name
- Date of Birth
- Gender (optional)

**Actions:**
- **Check Eligibility** - Queries Office Ally in real-time
- **Load Test Data** - Pre-fills with Jeremy Montoya data

**Results Display:**
- Clear qualification status with visual indicators
- Program details (Targeted Adult Medicaid)
- Plan type (Traditional FFS vs Managed Care)
- Patient Medicaid ID
- Response time

## 🔧 API Documentation

### POST `/api/eligibility/check`

Check patient eligibility for CM program.

**Request Body:**
```json
{
  "firstName": "Jeremy",
  "lastName": "Montoya",
  "dateOfBirth": "1984-07-17",
  "gender": "M"
}
```

**Response (Qualified):**
```json
{
  "qualifiesForCM": true,
  "enrolled": true,
  "program": "Targeted Adult Medicaid",
  "planType": "TRADITIONAL_FFS",
  "details": "Enrolled in Utah Targeted Adult Medicaid (Traditional FFS) - QUALIFIES for CM Program",
  "verified": true,
  "patientInfo": {
    "firstName": "JEREMY",
    "lastName": "MONTOYA",
    "medicaidId": "0900412827"
  },
  "processingTimeMs": 847
}
```

**Response (Not Qualified - Managed Care):**
```json
{
  "qualifiesForCM": false,
  "enrolled": true,
  "program": "Utah Medicaid",
  "planType": "MANAGED_CARE",
  "details": "Enrolled in Managed Care plan - DOES NOT QUALIFY for CM Program",
  "verified": true
}
```

## 📊 Business Rules

### CM Program Eligibility Criteria

**MUST have ALL of the following:**
1. ✅ Enrolled in **Utah Medicaid**
2. ✅ Enrolled in **Targeted Adult Medicaid** (Traditional FFS)
3. ✅ **NOT** enrolled in managed care (Molina, SelectHealth, Anthem)

**Billing Information:**
- **CPT Code**: H0038 (Peer Support)
- **Rate**: $21.16 per 15-minute unit
- **Minimum**: 8 minutes per session
- **Modifiers**: 95 (Telehealth AV), 93 (Telehealth Audio), HQ (Group)

## 🔐 Security & Compliance

### HIPAA Compliance
- All PHI encrypted in transit (HTTPS/TLS)
- No PHI stored in logs
- Office Ally credentials secured in `.env.local`
- Patient data only displayed to authorized CPSS staff

### Data Handling
- Real-time queries (no caching of eligibility)
- X12 271 responses logged in `test-data/` for debugging (dev only)
- No sensitive data committed to version control

## 🐛 Troubleshooting

### Common Issues

**Issue: "Missing required Office Ally configuration"**
- Solution: Ensure `.env.local` exists with all required fields

**Issue: "Unable to verify eligibility"**
- Check Office Ally credentials are correct
- Verify network connectivity to Office Ally endpoint
- Check patient name spelling (must match Medicaid records exactly)

**Issue: "Patient shows as Managed Care but should be FFS"**
- Review the raw X12 271 response in `test-data/`
- Look for managed care organization names (Molina, SelectHealth, etc.)
- Contact Utah Medicaid to verify patient's actual enrollment

## 📈 Next Steps (Phase 2+)

Future enhancements planned:

- [ ] **Patient Onboarding** - Streamlined enrollment workflow
- [ ] **H0038 Billing Engine** - Unit calculation and same-day aggregation
- [ ] **Encounter Capture** - Session timer and group roster management
- [ ] **Claims Submission** - X12 837P generation and submission to Office Ally
- [ ] **Provider Management** - NPI routing and credentialing logic
- [ ] **Reporting Dashboard** - Claims metrics and rejection tracking

## 📝 Testing Log

### Jeremy Montoya Test Results ✅

**Patient:** Jeremy Montoya (DOB: 1984-07-17)
**Result:** QUALIFIED for CM Program
**Program:** Targeted Adult Medicaid
**Plan Type:** Traditional FFS
**Medicaid ID:** 0900412827

**X12 271 Analysis:**
- ✅ Utah Medicaid payer detected
- ✅ Targeted Adult Medicaid coverage confirmed
- ✅ No managed care indicators (HM segments were transportation benefits only)
- ✅ Active eligibility confirmed

## 🤝 Contributing

When making changes:

1. Test with `node test-jeremy-montoya.js` to verify parser logic
2. Test the UI at http://localhost:3000
3. Verify real Office Ally integration (if credentials available)
4. Update this README if adding new features

## 📞 Support

For questions or issues:
- Review the `CLAUDE.md` implementation guide
- Check Office Ally X12 271 responses in `test-data/`
- Contact the development team

## 📄 License

Proprietary - Moonlit PLLC

---

**Built with:** Next.js, TypeScript, Tailwind CSS, Office Ally X12 270/271
**Last Updated:** October 2025
**Status:** Phase 1 Complete ✅
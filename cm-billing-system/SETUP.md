# CM Billing System - Setup Guide

## ✅ Phase 1 Complete!

The CM Billing System eligibility checking feature is now fully implemented and tested.

## 🎯 What Was Built

### Core Features Implemented

1. **✅ Office Ally X12 270/271 Integration**
   - Real-time SOAP API communication
   - X12 270 request generation
   - X12 271 response parsing
   - Error handling and timeout management

2. **✅ Enhanced X12 271 Parser**
   - Traditional FFS detection
   - Managed care identification
   - Targeted Adult Medicaid recognition
   - Patient demographic extraction

3. **✅ CPSS Portal (Next.js App)**
   - Eligibility checking form
   - Real-time API integration
   - Visual qualification status display
   - Test data loading capability

4. **✅ API Endpoint**
   - POST `/api/eligibility/check`
   - Request validation
   - Error handling
   - Demo mode support

## 🚀 Getting Started

### Step 1: Start the Application

```bash
cd cm-billing-system
npm run dev:cpss
```

The application will start on **http://localhost:3000**

### Step 2: Test with Jeremy Montoya

1. Visit http://localhost:3000
2. Click **"Load Test Data"** button
3. Click **"Check Eligibility"**

**Expected Result:**
- ✅ **QUALIFIED**
- Program: Targeted Adult Medicaid
- Plan Type: Traditional FFS
- Medicaid ID: 0900412827

### Step 3: Test the Parser Directly

```bash
node test-jeremy-montoya.js
```

This validates the X12 271 parsing logic without making a live API call.

## 📁 Project Structure

```
cm-billing-system/
├── apps/
│   └── cpss-portal/
│       ├── app/
│       │   ├── page.tsx                    # Main eligibility form
│       │   └── api/
│       │       └── eligibility/
│       │           └── check/
│       │               └── route.ts        # API endpoint
│       └── package.json
├── services/
│   └── eligibility-service/
│       └── officeAlly.js                   # Office Ally integration
├── test-data/
│   └── raw_x12_271_jeremy_montoya_sample.txt
├── .env.local                               # Configuration
├── package.json                             # Root package.json
├── test-jeremy-montoya.js                   # Test script
├── README.md                                # Documentation
└── SETUP.md                                 # This file
```

## 🔑 Key Files Explained

### 1. `apps/cpss-portal/app/page.tsx`
The main UI component with:
- Form inputs (name, DOB, gender)
- API integration
- Results display with color-coded statuses
- Test data loading

### 2. `apps/cpss-portal/app/api/eligibility/check/route.ts`
The API route that:
- Validates request data
- Calls Office Ally service
- Returns eligibility results
- Handles errors gracefully

### 3. `services/eligibility-service/officeAlly.js`
The core Office Ally integration:
- X12 270 generation
- SOAP envelope creation
- API communication
- X12 271 parsing with Traditional FFS detection

### 4. `.env.local`
Configuration file with:
- Office Ally credentials
- Provider NPI and name
- Utah Medicaid payer ID

## 🧪 Testing Checklist

### ✅ Parser Test (Offline)
```bash
node test-jeremy-montoya.js
```
**Expected:** ✅ TEST PASSED

### ✅ UI Test (Browser)
1. Navigate to http://localhost:3000
2. Load test data
3. Submit form
4. Verify qualification status display

### ✅ API Test (Live - Optional)
If you want to test with the real Office Ally API:
1. Use actual patient data (with consent)
2. Submit through the UI
3. Verify X12 271 response is saved to `test-data/`

## 🎨 User Interface Features

### Form Features
- ✅ Required field validation
- ✅ Date picker for DOB
- ✅ Gender selection
- ✅ Test data quick-load button
- ✅ Loading states during API calls

### Results Display
- ✅ Color-coded status (green/yellow/red)
- ✅ Large visual indicators (✅/⚠️/❌)
- ✅ Clear qualification messaging
- ✅ Patient information display
- ✅ Response time tracking
- ✅ Explanatory notes for disqualifications

## 🔒 Security Notes

### DO NOT commit:
- `.env.local` (contains Office Ally credentials)
- Any files with real patient PHI
- X12 271 responses from production (keep in `test-data/` only for dev)

### Already in `.gitignore`:
```
.env.local
.env*.local
test-data/x12_271_*.txt
node_modules/
```

## 🐛 Common Issues & Solutions

### Issue: Module not found errors
```bash
npm install
```

### Issue: "Missing required Office Ally configuration"
Verify `.env.local` exists with all fields:
- OFFICE_ALLY_USERNAME
- OFFICE_ALLY_PASSWORD
- OFFICE_ALLY_SENDER_ID
- PROVIDER_NPI
- PROVIDER_NAME

### Issue: Port 3000 already in use
```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run dev:cpss
```

### Issue: Test fails with "HM segments detected"
This was fixed! The parser now correctly distinguishes between:
- HM segments for transportation benefits (NOT managed care)
- HM segments for actual managed care enrollment

## 📊 Success Criteria Met

Based on the CLAUDE.md requirements:

✅ **USARA staff can input patient name + DOB**
✅ **System calls Office Ally real-time and gets X12 271 response**
✅ **System correctly identifies Traditional Medicaid FFS vs Managed Care**
✅ **Clear qualification status displayed: QUALIFIED/NOT QUALIFIED**
✅ **Jeremy Montoya test case works with real X12 271 data**
✅ **Error handling for API timeouts and failures**
✅ **Single directory with no external dependencies**
✅ **Independent Office Ally integration**
✅ **Proper X12 271 parsing with Traditional FFS detection**

## 🚀 Next Steps (Phase 2)

When you're ready to continue building:

1. **Patient Onboarding Workflow**
   - Consent forms
   - Program explanation
   - Enrollment tracking

2. **H0038 Billing Engine**
   - Unit calculation (15-minute increments, 8-min minimum)
   - Same-day encounter aggregation
   - Group session ratio enforcement (1:8)

3. **Encounter Capture**
   - Session timer
   - Real-time unit calculation
   - Group roster management

See `CLAUDE.md` for complete Phase 2-8 roadmap.

## 💡 Tips for Development

### Hot Reload
The Next.js app has hot reload enabled. Make changes to `app/page.tsx` and see them instantly.

### Debugging
- Check browser console for client-side errors
- Check terminal for server-side errors
- Review X12 271 files saved in `test-data/` for parsing issues

### Adding New Features
1. Read the relevant section in `CLAUDE.md`
2. Update the API endpoint in `apps/cpss-portal/app/api/`
3. Update the UI in `apps/cpss-portal/app/page.tsx`
4. Test with real data

## 📞 Need Help?

1. Review `README.md` for API documentation
2. Review `CLAUDE.md` for implementation details
3. Check the test script: `node test-jeremy-montoya.js`
4. Review Office Ally X12 responses in `test-data/`

---

**Phase 1 Status:** ✅ **COMPLETE**

You now have a fully functional eligibility checking system that can verify Traditional Medicaid FFS enrollment for the CM program!
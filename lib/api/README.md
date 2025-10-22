# API Layer Documentation

## Overview

This directory contains Next.js API routes that expose backend functionality to the frontend.

## API Structure

```
/api
├── /appointments      - IntakeQ appointment management
├── /claims            - Claim creation, validation, submission
├── /eligibility       - Insurance eligibility checks
├── /ai-coding         - AI diagnosis and CPT code suggestions
├── /providers         - Provider management
└── /payers            - Payer management
```

## Authentication

Currently, the application uses Supabase service role key for all operations. Future versions will implement proper authentication with Row Level Security (RLS).

## HIPAA Compliance

All API routes must:
1. Log all PHI access to audit_log table
2. Never return PHI in error messages
3. Use HTTPS in production
4. Validate and sanitize all inputs

## Error Handling

Standard error response format:

```typescript
{
  success: false,
  error: {
    message: "User-friendly error message",
    code: "ERROR_CODE",
    retryable: boolean
  }
}
```

## Example API Routes

### POST /api/appointments

Fetch appointments from IntakeQ with optional filters.

Request:
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "practitionerId": "optional"
}
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "appt_123",
      "serviceName": "Psychiatric Follow-up",
      "practitionerName": "Dr. Smith",
      "startDate": "2024-03-15T10:00:00Z",
      "endDate": "2024-03-15T11:00:00Z",
      "status": "completed"
    }
  ]
}
```

### POST /api/eligibility/check

Check patient eligibility via Office Ally.

Request:
```json
{
  "clientId": "client_123",
  "payerId": "payer_uuid",
  "serviceDate": "2024-03-15"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "coverageStatus": "active",
    "copayAmount": 30.00,
    "benefitsData": {
      "mentalHealth": {
        "active": true
      }
    }
  }
}
```

### POST /api/ai-coding/diagnoses

Extract diagnoses from clinical note using AI.

Request:
```json
{
  "noteId": "note_123",
  "noteContent": "Patient presents with..."
}
```

Response:
```json
{
  "success": true,
  "data": {
    "primaryDiagnosis": {
      "condition": "Generalized anxiety disorder",
      "icd10Code": "F41.1",
      "confidence": "high",
      "reasoning": "Explicitly stated in assessment"
    },
    "secondaryDiagnoses": []
  }
}
```

### POST /api/claims/create

Create a new claim.

Request:
```json
{
  "appointmentId": "appt_123",
  "clientId": "client_456",
  "practitionerId": "pract_789",
  "patientInfo": { /* ... */ },
  "insuranceInfo": { /* ... */ },
  "diagnosisCodes": [ /* ... */ ],
  "serviceLines": [ /* ... */ ]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "claim_uuid",
    "status": "draft",
    "validationErrors": []
  }
}
```

### POST /api/claims/validate

Validate a claim before submission.

Request:
```json
{
  "claimId": "claim_uuid"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "errors": [],
    "warnings": []
  }
}
```

### POST /api/claims/submit

Submit a claim to Office Ally.

Request:
```json
{
  "claimId": "claim_uuid"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionId": "MOONLIT_20240315_claim_uuid.837",
    "submissionDate": "2024-03-15T14:30:00Z"
  }
}
```

## Rate Limiting

Future implementation should include rate limiting for:
- Gemini API calls (cost management)
- Office Ally API calls (quota management)
- General API abuse prevention

## Testing

All API routes should have integration tests that:
1. Test successful requests
2. Test error scenarios
3. Test validation logic
4. Verify audit logging

// app/api/eligibility/check/route.ts
// API endpoint for checking patient eligibility via Office Ally

import { NextRequest, NextResponse } from 'next/server';

// Import the Office Ally service
// We'll use a relative path to the service in development
const officeAllyPath = process.env.NODE_ENV === 'production'
  ? '@cm-billing/eligibility-service'
  : '../../../../../services/eligibility-service/officeAlly';

interface EligibilityRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD format
  gender?: 'M' | 'F' | 'U';
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: EligibilityRequest = await request.json();

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.dateOfBirth) {
      return NextResponse.json(
        {
          error: 'Missing required fields: firstName, lastName, dateOfBirth',
          qualifiesForCM: false,
          verified: false
        },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.dateOfBirth)) {
      return NextResponse.json(
        {
          error: 'Invalid date format. Please use YYYY-MM-DD',
          qualifiesForCM: false,
          verified: false
        },
        { status: 400 }
      );
    }

    // Special case: Demo mode for testing
    if (body.firstName === 'Demo' && body.lastName === 'Patient') {
      console.log('Demo mode detected - returning mock response');
      return NextResponse.json({
        qualifiesForCM: true,
        enrolled: true,
        program: 'Targeted Adult Medicaid (Demo)',
        planType: 'TRADITIONAL_FFS',
        details: 'Demo patient - Enrolled in Utah Targeted Adult Medicaid (Traditional FFS) - QUALIFIES for CM Program',
        verified: true,
        patientInfo: {
          firstName: 'Demo',
          lastName: 'Patient',
          medicaidId: 'DEMO123456'
        },
        processingTimeMs: 100,
        demoMode: true
      });
    }

    // Import Office Ally service dynamically
    const { checkEligibility } = await import(officeAllyPath);

    // Check eligibility via Office Ally
    const eligibilityResult = await checkEligibility({
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      dateOfBirth: body.dateOfBirth,
      gender: body.gender || 'U'
    });

    // Return the result
    return NextResponse.json(eligibilityResult);

  } catch (error) {
    console.error('Eligibility check error:', error);

    return NextResponse.json(
      {
        error: 'Unable to verify eligibility at this time. Please try again later.',
        qualifiesForCM: false,
        verified: false,
        planType: 'ERROR'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'eligibility-check',
    timestamp: new Date().toISOString()
  });
}
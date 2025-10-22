/**
 * IntakeQ Intake Parser
 * Extracts patient and insurance information from IntakeQ intake forms
 */

import { IntakeQIntake } from '@/types';

interface PatientData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  phone: string;
  email: string;
}

interface InsuranceData {
  carrier: string;
  memberId: string;
  groupNumber: string;
  subscriberName: string;
  subscriberDateOfBirth: string;
  subscriberAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  relationshipToSubscriber: 'self' | 'spouse' | 'child' | 'other';
}

/**
 * Extract patient information from intake form
 */
export function extractPatientData(intake: IntakeQIntake): Partial<PatientData> {
  const data: Partial<PatientData> = {};

  intake.Questions.forEach((q) => {
    const answer = q.Answer;
    if (!answer || !q.ClientProfileFieldId) return;

    switch (q.ClientProfileFieldId) {
      case 'FirstName':
        data.firstName = answer;
        break;
      case 'LastName':
        data.lastName = answer;
        break;
      case 'DateOfBirth':
        data.dateOfBirth = answer;
        break;
      case 'StreetAddress':
        if (!data.address) data.address = {} as any;
        data.address!.street = answer;
        break;
      case 'City':
        if (!data.address) data.address = {} as any;
        data.address!.city = answer;
        break;
      case 'State':
        if (!data.address) data.address = {} as any;
        data.address!.state = answer;
        break;
      case 'ZipCode':
        if (!data.address) data.address = {} as any;
        data.address!.zip = answer;
        break;
      case 'Phone':
        data.phone = answer;
        break;
      case 'Email':
        data.email = answer;
        break;
    }
  });

  return data;
}

/**
 * Extract primary insurance information from intake form
 */
export function extractInsuranceData(intake: IntakeQIntake): Partial<InsuranceData> {
  const data: Partial<InsuranceData> = {};

  intake.Questions.forEach((q) => {
    const answer = q.Answer;
    if (!answer || !q.ClientProfileFieldId) return;

    switch (q.ClientProfileFieldId) {
      case 'PrimaryInsuranceCompany':
        data.carrier = answer;
        break;
      case 'PrimaryInsurancePolicyNumber':
        data.memberId = answer;
        break;
      case 'PrimaryInsuranceGroupNumber':
        data.groupNumber = answer;
        break;
      case 'PrimaryInsuranceHolderName':
        data.subscriberName = answer;
        break;
      case 'PrimaryInsuranceHolderBirthday':
        data.subscriberDateOfBirth = answer;
        break;
      case 'PrimaryInsuredStreetAddress':
        if (!data.subscriberAddress) data.subscriberAddress = {} as any;
        data.subscriberAddress!.street = answer;
        break;
      case 'PrimaryInsuredCity':
        if (!data.subscriberAddress) data.subscriberAddress = {} as any;
        data.subscriberAddress!.city = answer;
        break;
      case 'PrimaryInsuredState':
        if (!data.subscriberAddress) data.subscriberAddress = {} as any;
        data.subscriberAddress!.state = answer;
        break;
      case 'PrimaryInsuredZipCode':
        if (!data.subscriberAddress) data.subscriberAddress = {} as any;
        data.subscriberAddress!.zip = answer;
        break;
      case 'RelationshipToInsured':
        // Map the answer to our standard format
        const rel = answer.toLowerCase();
        if (rel.includes('self')) data.relationshipToSubscriber = 'self';
        else if (rel.includes('spouse')) data.relationshipToSubscriber = 'spouse';
        else if (rel.includes('child')) data.relationshipToSubscriber = 'child';
        else data.relationshipToSubscriber = 'other';
        break;
    }
  });

  return data;
}

/**
 * Check if intake has sufficient data for claim creation
 */
export function validateIntakeData(patientData: Partial<PatientData>, insuranceData: Partial<InsuranceData>): {
  isValid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  // Required patient fields
  if (!patientData.firstName) missingFields.push('First Name');
  if (!patientData.lastName) missingFields.push('Last Name');
  if (!patientData.dateOfBirth) missingFields.push('Date of Birth');

  // Required insurance fields
  if (!insuranceData.carrier) missingFields.push('Insurance Company');
  if (!insuranceData.memberId) missingFields.push('Member ID');

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

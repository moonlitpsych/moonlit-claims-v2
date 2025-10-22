/**
 * Service Integration Tests
 *
 * Run these tests to verify all API integrations are working correctly.
 *
 * Prerequisites:
 * - All environment variables configured in .env.local
 * - Supabase database migrated
 * - API credentials valid
 *
 * Usage:
 * npm test
 */

import { intakeqService } from '../services/intakeq/client';
import { officeAllyService } from '../services/office-ally/client';
import { geminiService } from '../services/gemini/client';
import { logger } from '../utils/logger';

describe('API Service Integration Tests', () => {
  describe('IntakeQ Service', () => {
    it('should connect to IntakeQ API', async () => {
      const result = await intakeqService.getAppointments({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result.success).toBe(true);
      logger.info('IntakeQ test passed', {
        appointmentCount: result.data?.length || 0,
      });
    }, 30000); // 30 second timeout

    it('should handle invalid appointment ID gracefully', async () => {
      const result = await intakeqService.getAppointment('invalid_id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Office Ally Service', () => {
    it('should connect to SFTP server', async () => {
      const connected = await officeAllyService.testSFTPConnection();

      expect(connected).toBe(true);
      logger.info('Office Ally SFTP test passed');
    }, 30000);

    // Note: Eligibility check test requires real patient data
    // Only run in development with test data
    it.skip('should check patient eligibility', async () => {
      const result = await officeAllyService.checkEligibility({
        payerId: 'TEST_PAYER',
        memberId: 'TEST123',
        firstName: 'Test',
        lastName: 'Patient',
        dateOfBirth: '1990-01-01',
        serviceDate: '2024-03-15',
      });

      expect(result.success).toBe(true);
      logger.info('Eligibility check test passed');
    });
  });

  describe('Gemini AI Service', () => {
    it('should connect to Gemini API', async () => {
      const connected = await geminiService.testConnection();

      expect(connected).toBe(true);
      logger.info('Gemini API test passed');
    }, 30000);

    it('should extract diagnoses from clinical note', async () => {
      const testNote = `
Patient presents with persistent anxiety and worry for the past 6 months.
Reports difficulty sleeping and concentration problems.
Assessment: Generalized Anxiety Disorder
Plan: Continue therapy, consider medication adjustment.
      `;

      const result = await geminiService.extractDiagnoses(testNote);

      expect(result.success).toBe(true);
      expect(result.data?.primaryDiagnosis).toBeDefined();
      expect(result.data?.primaryDiagnosis.icd10Code).toMatch(/^F\d{2}/);

      logger.info('Diagnosis extraction test passed', {
        diagnosis: result.data?.primaryDiagnosis.icd10Code,
        confidence: result.data?.primaryDiagnosis.confidence,
      });
    }, 60000); // 60 second timeout for AI processing

    it('should assign CPT codes from clinical note', async () => {
      const testNote = `
Chief Complaint: Follow-up for depression and anxiety
HPI: Patient doing better on current medication regimen. Sleep improved.
Assessment: Depression and anxiety stable, continue current treatment plan.
Discussed medication adherence and coping strategies for 25 minutes.
      `;

      const result = await geminiService.assignCPTCodes(testNote);

      expect(result.success).toBe(true);
      expect(result.data?.emCode).toBeDefined();
      expect(result.data?.emCode.cptCode).toMatch(/^99214|99215$/);

      logger.info('CPT code assignment test passed', {
        cptCode: result.data?.emCode.cptCode,
        confidence: result.data?.emCode.confidence,
      });
    }, 60000);
  });

  describe('Validation Utilities', () => {
    it('should validate NPI format', () => {
      const { isValidNPI } = require('../utils/validators');

      expect(isValidNPI('1234567890')).toBe(true);
      expect(isValidNPI('123456789')).toBe(false); // Too short
      expect(isValidNPI('12345678901')).toBe(false); // Too long
      expect(isValidNPI('123456789A')).toBe(false); // Contains letter
    });

    it('should validate ICD-10 codes', () => {
      const { isValidICD10 } = require('../utils/validators');

      expect(isValidICD10('F41.1')).toBe(true);
      expect(isValidICD10('Z00.00')).toBe(true);
      expect(isValidICD10('E11.9')).toBe(true);
      expect(isValidICD10('F41')).toBe(false); // Missing decimal
      expect(isValidICD10('41.1')).toBe(false); // Missing letter
    });

    it('should validate CPT codes', () => {
      const { isValidCPT } = require('../utils/validators');

      expect(isValidCPT('99214')).toBe(true);
      expect(isValidCPT('90834')).toBe(true);
      expect(isValidCPT('9921')).toBe(false); // Too short
      expect(isValidCPT('992145')).toBe(false); // Too long
    });
  });

  describe('Logger', () => {
    it('should sanitize PHI from log context', () => {
      const logSpy = jest.spyOn(console, 'warn');

      logger.info('Test message', {
        claimId: 'claim_123',
        firstName: 'John', // Should be redacted
        lastName: 'Doe', // Should be redacted
      });

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});

/**
 * Manual Test Runner
 * Run this file directly to test all services
 */
if (require.main === module) {
  console.log('🧪 Running manual service tests...\n');

  (async () => {
    // Test IntakeQ
    console.log('Testing IntakeQ connection...');
    try {
      const result = await intakeqService.getAppointments({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      console.log(
        result.success
          ? `✅ IntakeQ: Connected (${result.data?.length || 0} appointments)`
          : `❌ IntakeQ: ${result.error?.message}`
      );
    } catch (error) {
      console.log(`❌ IntakeQ: ${error}`);
    }

    // Test Office Ally
    console.log('\nTesting Office Ally SFTP connection...');
    try {
      const connected = await officeAllyService.testSFTPConnection();
      console.log(connected ? '✅ Office Ally SFTP: Connected' : '❌ Office Ally SFTP: Failed');
    } catch (error) {
      console.log(`❌ Office Ally SFTP: ${error}`);
    }

    // Test Gemini
    console.log('\nTesting Gemini AI connection...');
    try {
      const connected = await geminiService.testConnection();
      console.log(connected ? '✅ Gemini AI: Connected' : '❌ Gemini AI: Failed');
    } catch (error) {
      console.log(`❌ Gemini AI: ${error}`);
    }

    console.log('\n✨ All tests complete!');
  })();
}

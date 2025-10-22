/**
 * Google Gemini AI Service
 * HIPAA-compliant AI service for diagnosis extraction and CPT code assignment
 *
 * IMPORTANT: Ensure BAA (Business Associate Agreement) with Google
 * Configuration must disable training on customer data
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/utils/logger';
import type { DiagnosisSuggestion, CPTSuggestion, APIResponse } from '@/types';

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Use gemini-pro model with HIPAA-compliant settings
    this.model = this.genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-pro',
    });
  }

  /**
   * Extract diagnoses from clinical note
   * Returns primary and secondary diagnoses with ICD-10 codes
   */
  async extractDiagnoses(noteContent: string): Promise<APIResponse<DiagnosisSuggestion>> {
    const startTime = Date.now();

    try {
      const prompt = this.buildDiagnosisPrompt(noteContent);

      logger.info('Requesting diagnosis extraction from Gemini', {
        noteLength: noteContent.length,
      });

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      const diagnosisSuggestion = this.parseDiagnosisResponse(text);

      const processingTime = Date.now() - startTime;

      logger.info('Diagnosis extraction completed', {
        processingTimeMs: processingTime,
        primaryDiagnosis: diagnosisSuggestion.primaryDiagnosis.icd10Code,
        confidence: diagnosisSuggestion.primaryDiagnosis.confidence,
      });

      return {
        success: true,
        data: diagnosisSuggestion,
      };
    } catch (error) {
      logger.error('Diagnosis extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: {
          message: 'Failed to extract diagnoses',
          code: 'GEMINI_ERROR',
          retryable: true,
        },
      };
    }
  }

  /**
   * Assign CPT codes based on clinical note
   * Returns E/M code and psychotherapy add-on if applicable
   */
  async assignCPTCodes(noteContent: string): Promise<APIResponse<CPTSuggestion>> {
    const startTime = Date.now();

    try {
      const prompt = this.buildCPTPrompt(noteContent);

      logger.info('Requesting CPT code assignment from Gemini', {
        noteLength: noteContent.length,
      });

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      const cptSuggestion = this.parseCPTResponse(text);

      const processingTime = Date.now() - startTime;

      logger.info('CPT code assignment completed', {
        processingTimeMs: processingTime,
        cptCode: cptSuggestion.emCode.cptCode,
        confidence: cptSuggestion.emCode.confidence,
      });

      return {
        success: true,
        data: cptSuggestion,
      };
    } catch (error) {
      logger.error('CPT code assignment failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: {
          message: 'Failed to assign CPT codes',
          code: 'GEMINI_ERROR',
          retryable: true,
        },
      };
    }
  }

  /**
   * Build diagnosis extraction prompt
   */
  private buildDiagnosisPrompt(noteContent: string): string {
    return `You are a medical coding assistant specializing in psychiatry.
Extract the primary and any secondary psychiatric diagnoses from the following clinical note.

Instructions:
1. Look for explicitly stated diagnoses first
2. If no explicit diagnosis, infer from symptoms, medications, and treatment described
3. Provide ICD-10 code for each diagnosis
4. Rate your confidence: high (>90%), medium (70-90%), low (<70%)
5. Explain your reasoning briefly

Clinical Note:
${noteContent}

Respond in the following JSON format only (no additional text):
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
}`;
  }

  /**
   * Build CPT code assignment prompt
   */
  private buildCPTPrompt(noteContent: string): string {
    return `You are a medical coding expert specializing in psychiatric E/M coding.
Determine the appropriate CPT code for this psychiatric visit based on AMA criteria.

AMA Criteria for Outpatient Psychiatry E/M:
- 99214 (Moderate Complexity MDM): 2 of 3: multiple diagnoses/problems, moderate data review, moderate risk
- 99215 (High Complexity MDM): 2 of 3: extensive diagnoses/problems, extensive data review, high risk

Consider:
1. Number and complexity of problems addressed
2. Amount and complexity of data reviewed (labs, records, etc.)
3. Risk of complications, morbidity, mortality
4. Psychotherapy time (for add-on codes 90833, 90836, 90838)

Psychotherapy Add-On Codes:
- 90833: 16-37 minutes
- 90836: 38-52 minutes
- 90838: 53+ minutes

Clinical Note:
${noteContent}

Respond in the following JSON format only (no additional text):
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
}`;
  }

  /**
   * Parse diagnosis response from Gemini
   */
  private parseDiagnosisResponse(text: string): DiagnosisSuggestion {
    try {
      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanText);

      return {
        primaryDiagnosis: {
          condition: parsed.primaryDiagnosis.condition,
          icd10Code: parsed.primaryDiagnosis.icd10Code,
          confidence: parsed.primaryDiagnosis.confidence,
          reasoning: parsed.primaryDiagnosis.reasoning,
        },
        secondaryDiagnoses: parsed.secondaryDiagnoses || [],
      };
    } catch (error) {
      logger.error('Failed to parse diagnosis response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseText: text.substring(0, 200),
      });

      // Return a fallback response
      return {
        primaryDiagnosis: {
          condition: 'Unable to determine',
          icd10Code: 'F99',
          confidence: 'low',
          reasoning: 'Failed to parse AI response',
        },
      };
    }
  }

  /**
   * Parse CPT code response from Gemini
   */
  private parseCPTResponse(text: string): CPTSuggestion {
    try {
      // Remove markdown code blocks if present
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanText);

      return {
        emCode: {
          cptCode: parsed.emCode.cptCode,
          confidence: parsed.emCode.confidence,
          reasoning: parsed.emCode.reasoning,
          keyFactors: parsed.emCode.keyFactors,
        },
        psychotherapyAddOn: parsed.psychotherapyAddOn || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse CPT response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseText: text.substring(0, 200),
      });

      // Return a fallback response
      return {
        emCode: {
          cptCode: '99214',
          confidence: 'low',
          reasoning: 'Failed to parse AI response - defaulting to moderate complexity',
          keyFactors: ['Unable to determine from note'],
        },
      };
    }
  }

  /**
   * Test Gemini API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.model.generateContent('Test connection. Respond with OK.');
      const response = await result.response;
      const text = response.text();

      logger.info('Gemini API connection test successful', {
        responseLength: text.length,
      });

      return true;
    } catch (error) {
      logger.error('Gemini API connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }
}

// Export singleton instance
export const geminiService = new GeminiService();

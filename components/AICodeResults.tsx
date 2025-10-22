/**
 * AI Code Results Component
 * Displays AI-generated diagnosis and CPT code suggestions with reasoning
 */

'use client';

import { useState } from 'react';
import { DiagnosisSuggestion, CPTSuggestion } from '@/types';

interface AICodeResultsProps {
  diagnosisSuggestion: DiagnosisSuggestion;
  cptSuggestion: CPTSuggestion;
  onApplyToClaim: () => void;
}

export function AICodeResults({
  diagnosisSuggestion,
  cptSuggestion,
  onApplyToClaim,
}: AICodeResultsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-red-100 text-red-800 border-red-200',
    };

    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          colors[confidence as keyof typeof colors] || colors.medium
        }`}
      >
        {confidence.toUpperCase()} CONFIDENCE
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">AI Analysis Complete</h3>
            <p className="mt-1 text-sm text-green-700">
              Review the suggestions below and apply them to your claim
            </p>
          </div>
        </div>
      </div>

      {/* Diagnosis Suggestions */}
      <div className="rounded-lg border border-gray-300 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Diagnosis Codes</h3>
        </div>

        {/* Primary Diagnosis */}
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-blue-900">PRIMARY DIAGNOSIS</span>
            {getConfidenceBadge(diagnosisSuggestion.primaryDiagnosis.confidence)}
          </div>
          <div className="mt-3">
            <div className="text-lg font-semibold text-gray-900">
              {diagnosisSuggestion.primaryDiagnosis.icd10Code}
            </div>
            <div className="mt-1 text-sm text-gray-700">
              {diagnosisSuggestion.primaryDiagnosis.condition}
            </div>
          </div>
          <button
            onClick={() => toggleSection('primary-reasoning')}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          >
            <svg
              className={`h-4 w-4 transition-transform ${
                expandedSections.has('primary-reasoning') ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {expandedSections.has('primary-reasoning') ? 'Hide' : 'Show'} Reasoning
          </button>
          {expandedSections.has('primary-reasoning') && (
            <div className="mt-3 rounded border border-blue-200 bg-white p-3 text-sm text-gray-700">
              {diagnosisSuggestion.primaryDiagnosis.reasoning}
            </div>
          )}
        </div>

        {/* Secondary Diagnoses */}
        {diagnosisSuggestion.secondaryDiagnoses &&
          diagnosisSuggestion.secondaryDiagnoses.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-500">SECONDARY DIAGNOSES</div>
              <div className="space-y-3">
                {diagnosisSuggestion.secondaryDiagnoses.map((diagnosis, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">
                        SECONDARY {index + 1}
                      </span>
                      {getConfidenceBadge(diagnosis.confidence)}
                    </div>
                    <div className="mt-2">
                      <div className="font-semibold text-gray-900">{diagnosis.icd10Code}</div>
                      <div className="mt-1 text-sm text-gray-700">{diagnosis.condition}</div>
                    </div>
                    <button
                      onClick={() => toggleSection(`secondary-${index}`)}
                      className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                      <svg
                        className={`h-4 w-4 transition-transform ${
                          expandedSections.has(`secondary-${index}`) ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      {expandedSections.has(`secondary-${index}`) ? 'Hide' : 'Show'} Reasoning
                    </button>
                    {expandedSections.has(`secondary-${index}`) && (
                      <div className="mt-2 rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                        {diagnosis.reasoning}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* CPT Code Suggestions */}
      <div className="rounded-lg border border-gray-300 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">CPT Codes</h3>
        </div>

        {/* E/M Code */}
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-purple-900">EVALUATION & MANAGEMENT</span>
            {getConfidenceBadge(cptSuggestion.emCode.confidence)}
          </div>
          <div className="mt-3">
            <div className="text-lg font-semibold text-gray-900">
              {cptSuggestion.emCode.cptCode}
            </div>
            <div className="mt-1 text-sm text-gray-700">{cptSuggestion.emCode.reasoning}</div>
          </div>
          <button
            onClick={() => toggleSection('em-factors')}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-700 hover:text-purple-900"
          >
            <svg
              className={`h-4 w-4 transition-transform ${
                expandedSections.has('em-factors') ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {expandedSections.has('em-factors') ? 'Hide' : 'Show'} Key Factors
          </button>
          {expandedSections.has('em-factors') && (
            <div className="mt-3 rounded border border-purple-200 bg-white p-3">
              <ul className="space-y-1 text-sm text-gray-700">
                {cptSuggestion.emCode.keyFactors.map((factor, index) => (
                  <li key={index} className="flex items-start">
                    <svg
                      className="mt-0.5 mr-2 h-4 w-4 flex-shrink-0 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {factor}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Psychotherapy Add-On */}
        {cptSuggestion.psychotherapyAddOn?.applicable && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-indigo-900">PSYCHOTHERAPY ADD-ON</span>
              {getConfidenceBadge(cptSuggestion.psychotherapyAddOn.confidence)}
            </div>
            <div className="mt-3">
              <div className="text-lg font-semibold text-gray-900">
                {cptSuggestion.psychotherapyAddOn.cptCode}
              </div>
              <div className="mt-1 text-sm text-gray-700">
                Estimated {cptSuggestion.psychotherapyAddOn.estimatedMinutes} minutes
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {cptSuggestion.psychotherapyAddOn.reasoning}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-green-300 bg-green-50 p-6">
        <div className="text-center">
          <button
            onClick={onApplyToClaim}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Apply These Codes to Claim
          </button>
          <p className="mt-2 text-xs text-gray-600">
            You can still edit the codes after applying them
          </p>
        </div>
      </div>
    </div>
  );
}

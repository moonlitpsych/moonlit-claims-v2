/**
 * Eligibility Check Page
 * Standalone page for checking patient insurance eligibility via Office Ally
 */

'use client';

import { useState } from 'react';
import { IntakeQClient } from '@/types';

interface EligibilityResult {
  success: boolean;
  coverageStatus?: 'active' | 'inactive' | 'unknown';
  copayAmount?: number;
  deductibleInfo?: {
    individual?: number;
    family?: number;
    remaining?: number;
  };
  benefitsData?: {
    mentalHealth?: {
      active: boolean;
      copay?: number;
      coinsurance?: number;
      limitations?: string;
    };
  };
  error?: string;
}

export default function EligibilityPage() {
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [patientInfo, setPatientInfo] = useState<any>(null);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckEligibility = async () => {
    if (!patientId.trim()) {
      setError('Please enter a patient ID');
      return;
    }

    setLoading(true);
    setError(null);
    setPatientInfo(null);
    setEligibilityResult(null);

    try {
      const response = await fetch(`/api/test-eligibility?patientId=${patientId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to check eligibility');
      }

      setPatientInfo(data.patientInfo);
      setEligibilityResult(data.eligibilityResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCheckEligibility();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Insurance Eligibility Check</h1>
              <p className="mt-1 text-sm text-gray-600">
                Real-time eligibility verification via Office Ally
              </p>
            </div>
            <a
              href="/dashboard"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Search Form */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Patient Lookup</h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter an IntakeQ patient ID to check insurance eligibility
          </p>

          <div className="mt-6 flex gap-3">
            <div className="flex-1">
              <label htmlFor="patientId" className="block text-sm font-medium text-gray-700">
                Patient ID
              </label>
              <input
                type="text"
                id="patientId"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., 78, 0042"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCheckEligibility}
                disabled={loading || !patientId.trim()}
                className="rounded-md bg-primary-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking...
                  </span>
                ) : (
                  'Check Eligibility'
                )}
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setPatientId('78')}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Try: 78 (Hayden Cook - UUHP)
            </button>
            <span className="text-xs text-gray-400">|</span>
            <button
              onClick={() => setPatientId('0042')}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Try: 0042 (Tella Silver - Aetna)
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {patientInfo && eligibilityResult && (
          <div className="mt-6 space-y-6">
            {/* Patient Information */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Patient Information</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">{patientInfo.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                  <dd className="mt-1 text-sm text-gray-900">{patientInfo.dob}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Insurance</dt>
                  <dd className="mt-1 text-sm text-gray-900">{patientInfo.insurance}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Member ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{patientInfo.memberId}</dd>
                </div>
              </dl>
            </div>

            {/* Coverage Status */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Coverage Status</h2>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    eligibilityResult.coverageStatus === 'active'
                      ? 'bg-green-100 text-green-800'
                      : eligibilityResult.coverageStatus === 'inactive'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {eligibilityResult.coverageStatus?.toUpperCase() || 'UNKNOWN'}
                </span>
              </div>

              {eligibilityResult.coverageStatus === 'active' && (
                <div className="mt-4">
                  <div className="rounded-md bg-green-50 p-4">
                    <div className="flex">
                      <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">Coverage is Active</h3>
                        <p className="mt-1 text-sm text-green-700">Patient has active insurance coverage</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Benefits Information */}
            {(eligibilityResult.deductibleInfo || eligibilityResult.copayAmount !== undefined || eligibilityResult.benefitsData) && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Benefits Information</h2>

                <div className="mt-4 space-y-4">
                  {/* Deductible */}
                  {eligibilityResult.deductibleInfo && (
                    <div className="border-b border-gray-200 pb-4">
                      <h3 className="text-sm font-medium text-gray-700">Deductible</h3>
                      <dl className="mt-2 grid grid-cols-2 gap-4">
                        {eligibilityResult.deductibleInfo.individual !== undefined && (
                          <div>
                            <dt className="text-xs text-gray-500">Individual</dt>
                            <dd className="mt-1 text-sm font-medium text-gray-900">
                              ${eligibilityResult.deductibleInfo.individual.toFixed(2)}
                            </dd>
                          </div>
                        )}
                        {eligibilityResult.deductibleInfo.remaining !== undefined && (
                          <div>
                            <dt className="text-xs text-gray-500">Remaining</dt>
                            <dd className="mt-1 text-sm font-medium text-gray-900">
                              ${eligibilityResult.deductibleInfo.remaining.toFixed(2)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Copay */}
                  {eligibilityResult.copayAmount !== undefined && eligibilityResult.copayAmount !== null && (
                    <div className="border-b border-gray-200 pb-4">
                      <h3 className="text-sm font-medium text-gray-700">Copay</h3>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">
                        ${eligibilityResult.copayAmount.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Mental Health Benefits */}
                  {eligibilityResult.benefitsData?.mentalHealth && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700">Mental Health Coverage</h3>
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              eligibilityResult.benefitsData.mentalHealth.active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {eligibilityResult.benefitsData.mentalHealth.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {eligibilityResult.benefitsData.mentalHealth.copay !== undefined && (
                          <p className="text-sm text-gray-600">
                            Copay: ${eligibilityResult.benefitsData.mentalHealth.copay.toFixed(2)}
                          </p>
                        )}
                        {eligibilityResult.benefitsData.mentalHealth.coinsurance !== undefined && (
                          <p className="text-sm text-gray-600">
                            Coinsurance: {eligibilityResult.benefitsData.mentalHealth.coinsurance}%
                          </p>
                        )}
                        {eligibilityResult.benefitsData.mentalHealth.limitations && (
                          <p className="text-sm text-gray-600">
                            Note: {eligibilityResult.benefitsData.mentalHealth.limitations}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

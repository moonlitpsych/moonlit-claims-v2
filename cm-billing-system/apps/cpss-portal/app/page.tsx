'use client';

import { useState } from 'react';

interface EligibilityResult {
  qualifiesForCM: boolean;
  enrolled: boolean;
  program?: string;
  planType?: string;
  details?: string;
  error?: string;
  patientInfo?: {
    firstName: string;
    lastName: string;
    medicaidId?: string;
  };
  processingTimeMs?: number;
}

export default function Home() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'U' as 'M' | 'F' | 'U'
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/eligibility/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check eligibility');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Pre-fill with Jeremy Montoya data for testing
  const loadTestData = () => {
    setFormData({
      firstName: 'Jeremy',
      lastName: 'Montoya',
      dateOfBirth: '1984-07-17',
      gender: 'M'
    });
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            CM Billing System - Eligibility Check
          </h1>
          <p className="mt-2 text-gray-600">
            Verify Traditional Medicaid FFS enrollment for Contingency Management program
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter patient's first name"
            />
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter patient's last name"
            />
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              id="dateOfBirth"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="U">Unknown</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Checking...' : 'Check Eligibility'}
            </button>
            <button
              type="button"
              onClick={loadTestData}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Load Test Data
            </button>
          </div>
        </form>

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-300 rounded-lg">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className={`mt-6 p-6 rounded-lg border-2 ${
            result.qualifiesForCM
              ? 'bg-green-50 border-green-500'
              : result.enrolled
              ? 'bg-yellow-50 border-yellow-500'
              : 'bg-red-50 border-red-500'
          }`}>
            {/* Qualification Status */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`text-4xl ${
                result.qualifiesForCM ? 'text-green-500' :
                result.enrolled ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {result.qualifiesForCM ? '✅' : result.enrolled ? '⚠️' : '❌'}
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {result.qualifiesForCM ? 'QUALIFIED' :
                   result.enrolled ? 'ENROLLED BUT NOT QUALIFIED' : 'NOT QUALIFIED'}
                </h2>
                <p className="text-gray-700 mt-1">{result.details || result.error}</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              {result.program && (
                <div className="flex">
                  <span className="font-medium text-gray-600 w-32">Program:</span>
                  <span className="text-gray-900">{result.program}</span>
                </div>
              )}
              {result.planType && (
                <div className="flex">
                  <span className="font-medium text-gray-600 w-32">Plan Type:</span>
                  <span className={`font-semibold ${
                    result.planType === 'TRADITIONAL_FFS' ? 'text-green-700' :
                    result.planType === 'MANAGED_CARE' ? 'text-yellow-700' : 'text-gray-700'
                  }`}>
                    {result.planType.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {result.patientInfo?.medicaidId && (
                <div className="flex">
                  <span className="font-medium text-gray-600 w-32">Medicaid ID:</span>
                  <span className="text-gray-900">{result.patientInfo.medicaidId}</span>
                </div>
              )}
              {result.processingTimeMs && (
                <div className="flex">
                  <span className="font-medium text-gray-600 w-32">Response Time:</span>
                  <span className="text-gray-900">{result.processingTimeMs}ms</span>
                </div>
              )}
            </div>

            {/* Explanation for CM Program */}
            {!result.qualifiesForCM && result.enrolled && (
              <div className="mt-4 p-3 bg-white rounded border border-gray-300">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> This patient is enrolled in Medicaid but does not qualify for the
                  Contingency Management program. Only patients enrolled in Traditional Fee-For-Service
                  (Targeted Adult Medicaid) qualify. Managed care patients (Molina, SelectHealth, Anthem, etc.)
                  are not eligible.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Information Box */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">About This Tool</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Verifies eligibility via Office Ally X12 270/271 transactions</li>
            <li>• Checks for Traditional Medicaid FFS (Targeted Adult Medicaid)</li>
            <li>• Excludes managed care plans (Molina, SelectHealth, Anthem)</li>
            <li>• Real-time verification with Utah Medicaid</li>
            <li>• Required for CM program enrollment and H0038 billing</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

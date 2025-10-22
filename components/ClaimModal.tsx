/**
 * CMS-1500 Claim Modal
 * Modal for creating and editing claims with auto-population
 */

'use client';

import { useState, useEffect } from 'react';
import { IntakeQAppointment, DiagnosisSuggestion, CPTSuggestion, ValidationError } from '@/types';

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: IntakeQAppointment | null;
  aiCodingResults?: {
    diagnoses: DiagnosisSuggestion;
    cpt: CPTSuggestion;
  } | null;
}

interface ClaimFormData {
  // Patient Information (Box 2-7)
  patientName: string;
  patientDOB: string;
  patientAddress: string;
  patientCity: string;
  patientState: string;
  patientZip: string;
  patientPhone: string;

  // Insurance Information (Box 1, 11-13)
  insuranceType: string;
  insuranceCompany: string;
  memberId: string;
  groupNumber: string;

  // Insured Information (Box 4, 7)
  insuredName: string;
  insuredDOB: string;
  relationshipToInsured: 'self' | 'spouse' | 'child' | 'other';

  // Service Information (Box 24)
  dateOfService: string;
  placeOfService: string;
  cptCode: string;
  cptAddOnCode: string;
  diagnosisCodes: string[]; // Array of ICD-10 codes
  diagnosisPointer: string;
  charges: string;

  // Auto-populated flags
  autoPopulated: Set<string>;
}

export function ClaimModal({ isOpen, onClose, appointment, aiCodingResults }: ClaimModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClaimFormData | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [ediContent, setEdiContent] = useState<string | null>(null);
  const [showEDIPreview, setShowEDIPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && appointment) {
      fetchAndPopulateClaim();
    }
  }, [isOpen, appointment]);

  // Apply AI coding results when they're provided
  useEffect(() => {
    if (aiCodingResults && formData) {
      applyAICodingResults(aiCodingResults);
    }
  }, [aiCodingResults]);

  const fetchAndPopulateClaim = async () => {
    if (!appointment) return;

    setLoading(true);
    setError(null);

    try {
      const autoPopulated = new Set<string>();

      // Fetch client data for patient demographics and insurance
      let clientData: any = {};

      if (appointment.ClientId) {
        const clientResponse = await fetch(`/api/clients/${appointment.ClientId}`);
        if (clientResponse.ok) {
          const clientResult = await clientResponse.json();
          if (clientResult.success) {
            clientData = clientResult.data;
          }
        }
      }

      // Build form data with auto-population tracking
      const formData: ClaimFormData = {
        // Patient Information
        patientName: clientData.FirstName && clientData.LastName
          ? `${clientData.LastName}, ${clientData.FirstName}`
          : appointment.ClientName,
        patientDOB: clientData.DateOfBirth
          ? new Date(clientData.DateOfBirth * 1000).toISOString().split('T')[0]
          : appointment.ClientDateOfBirth || '',
        patientAddress: clientData.Address || '',
        patientCity: clientData.City || '',
        patientState: clientData.State || '',
        patientZip: clientData.Zip || '',
        patientPhone: clientData.HomePhone || clientData.MobilePhone || appointment.ClientPhone || '',

        // Insurance Information
        insuranceType: 'Other', // Default, can be changed
        insuranceCompany: clientData.PrimaryInsuranceCompany || '',
        memberId: clientData.PrimaryInsurancePolicyNumber || '',
        groupNumber: clientData.PrimaryInsuranceGroupNumber || '',

        // Insured Information
        insuredName: clientData.PrimaryInsuranceHolderName || '',
        insuredDOB: clientData.PrimaryInsuranceHolderDateOfBirth
          ? new Date(clientData.PrimaryInsuranceHolderDateOfBirth).toISOString().split('T')[0]
          : '',
        relationshipToInsured: clientData.PrimaryInsuranceRelationship?.toLowerCase() || 'self',

        // Service Information
        dateOfService: appointment.StartDateLocal?.split('T')[0] || '',
        placeOfService: appointment.PlaceOfService || '02', // Default to telehealth
        cptCode: '', // Will be determined from ServiceId or AI
        cptAddOnCode: '', // Psychotherapy add-on if applicable
        diagnosisCodes: [], // Will be populated by AI or manual entry
        diagnosisPointer: '',
        charges: (appointment.Price / 100).toFixed(2), // Convert cents to dollars

        autoPopulated: new Set(),
      };

      // Track what was auto-populated (from client data OR appointment)
      if (clientData.FirstName || appointment.ClientName) autoPopulated.add('patientName');
      if (clientData.DateOfBirth || appointment.ClientDateOfBirth) autoPopulated.add('patientDOB');
      if (clientData.Address) autoPopulated.add('patientAddress');
      if (clientData.City) autoPopulated.add('patientCity');
      if (clientData.State) autoPopulated.add('patientState');
      if (clientData.Zip) autoPopulated.add('patientZip');
      if (clientData.HomePhone || clientData.MobilePhone || appointment.ClientPhone) autoPopulated.add('patientPhone');
      if (clientData.PrimaryInsuranceCompany) autoPopulated.add('insuranceCompany');
      if (clientData.PrimaryInsurancePolicyNumber) autoPopulated.add('memberId');
      if (clientData.PrimaryInsuranceGroupNumber) autoPopulated.add('groupNumber');
      if (clientData.PrimaryInsuranceHolderName) autoPopulated.add('insuredName');
      if (clientData.PrimaryInsuranceHolderDateOfBirth) autoPopulated.add('insuredDOB');
      if (appointment.StartDateLocal) autoPopulated.add('dateOfService');
      if (appointment.PlaceOfService) autoPopulated.add('placeOfService');
      if (appointment.Price) autoPopulated.add('charges');

      formData.autoPopulated = autoPopulated;
      setFormData(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claim data');
    } finally {
      setLoading(false);
    }
  };

  const applyAICodingResults = (results: { diagnoses: DiagnosisSuggestion; cpt: CPTSuggestion }) => {
    if (!formData) return;

    const { diagnoses, cpt } = results;
    const autoPopulated = new Set(formData.autoPopulated);

    // Build diagnosis codes array
    const diagnosisCodes = [diagnoses.primaryDiagnosis.icd10Code];
    if (diagnoses.secondaryDiagnoses) {
      diagnosisCodes.push(...diagnoses.secondaryDiagnoses.map((d) => d.icd10Code));
    }

    // Apply CPT codes
    const cptCode = cpt.emCode.cptCode;
    const cptAddOnCode = cpt.psychotherapyAddOn?.applicable ? cpt.psychotherapyAddOn.cptCode || '' : '';

    // Mark as auto-populated
    autoPopulated.add('diagnosisCodes');
    autoPopulated.add('cptCode');
    if (cptAddOnCode) autoPopulated.add('cptAddOnCode');

    setFormData({
      ...formData,
      diagnosisCodes,
      cptCode,
      cptAddOnCode,
      autoPopulated,
    });
  };

  const handleValidateClaim = async () => {
    if (!formData) return;

    setValidating(true);
    setError(null);
    setValidationErrors([]);

    try {
      // Split patient name for API
      const nameParts = formData.patientName.split(', ');
      const patientLastName = nameParts[0] || '';
      const patientFirstName = nameParts[1] || '';

      // Split insured name
      const insuredNameParts = formData.insuredName.split(' ');
      const subscriberFirstName = insuredNameParts[0] || '';
      const subscriberLastName = insuredNameParts.slice(1).join(' ') || '';

      // Call EDI generation endpoint
      const response = await fetch('/api/claims/generate-edi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Patient info
          patientFirstName,
          patientLastName,
          patientDateOfBirth: formData.patientDOB,
          patientAddress: formData.patientAddress,
          patientCity: formData.patientCity,
          patientState: formData.patientState,
          patientZip: formData.patientZip,

          // Insurance info
          insuranceCompany: formData.insuranceCompany,
          subscriberMemberId: formData.memberId,
          subscriberGroupNumber: formData.groupNumber,
          subscriberFirstName,
          subscriberLastName,
          subscriberDateOfBirth: formData.insuredDOB,
          relationshipToInsured: formData.relationshipToInsured,

          // Provider info (will be filled from Supabase in future)
          renderingProviderName: appointment?.PractitionerName || 'Unknown',
          renderingProviderNPI: '1234567890', // TODO: Get from Supabase

          // Service info
          dateOfService: formData.dateOfService,
          placeOfService: formData.placeOfService,
          cptCode: formData.cptCode,
          cptAddOnCode: formData.cptAddOnCode,
          charges: formData.charges,
          diagnosisCodes: formData.diagnosisCodes,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setEdiContent(result.data.ediContent);
        setShowEDIPreview(true);
      } else {
        // Show validation errors
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors);
        } else if (result.error) {
          setError(result.error.message || 'Validation failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate claim');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmitClaim = async () => {
    if (!formData || !appointment) return;

    setSubmitting(true);
    setError(null);

    try {
      // Split patient name for API
      const nameParts = formData.patientName.split(', ');
      const patientLastName = nameParts[0] || '';
      const patientFirstName = nameParts[1] || '';

      // Split insured name
      const insuredNameParts = formData.insuredName.split(' ');
      const subscriberFirstName = insuredNameParts[0] || '';
      const subscriberLastName = insuredNameParts.slice(1).join(' ') || '';

      // Call claim submission endpoint
      const response = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // IntakeQ References
          intakeqAppointmentId: appointment.Id,
          intakeqClientId: appointment.ClientId,
          intakeqPractitionerId: appointment.PractitionerId,

          // Patient info
          patientFirstName,
          patientLastName,
          patientDateOfBirth: formData.patientDOB,
          patientAddress: formData.patientAddress,
          patientCity: formData.patientCity,
          patientState: formData.patientState,
          patientZip: formData.patientZip,

          // Insurance info
          insuranceCompany: formData.insuranceCompany,
          subscriberMemberId: formData.memberId,
          subscriberGroupNumber: formData.groupNumber,
          subscriberFirstName,
          subscriberLastName,
          subscriberDateOfBirth: formData.insuredDOB,
          relationshipToInsured: formData.relationshipToInsured,

          // Provider info
          renderingProviderName: appointment.PractitionerName,
          renderingProviderNPI: '1234567890', // TODO: Get from Supabase

          // Service info
          dateOfService: formData.dateOfService,
          placeOfService: formData.placeOfService,
          cptCode: formData.cptCode,
          cptAddOnCode: formData.cptAddOnCode,
          charges: formData.charges,
          diagnosisCodes: formData.diagnosisCodes,

          // AI coding details if used
          aiCodingUsed: formData.autoPopulated.has('diagnosisCodes'),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSubmitSuccess(true);
        // Show success for 2 seconds then close
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        // Show validation errors or error message
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors);
        } else if (result.error) {
          setError(result.error.message || 'Failed to submit claim');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-6xl rounded-lg bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Create Claim</h2>
              <p className="mt-1 text-sm text-gray-600">
                CMS-1500 Professional Claim Form
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600"></div>
                  <p className="mt-4 text-sm text-gray-600">Loading claim data...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-red-900">
                  Validation Errors ({validationErrors.filter(e => e.severity === 'error').length})
                </h4>
                <ul className="space-y-1">
                  {validationErrors.map((err, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <span className={err.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}>
                        {err.severity === 'error' ? '✕' : '⚠'}
                      </span>
                      <span className="text-red-700">
                        <strong>{err.field}:</strong> {err.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && !error && formData && (
              <div className="space-y-6">
                {/* Appointment Info */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">Appointment Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Patient:</span>{' '}
                      <span className="font-medium">{appointment?.ClientName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Service:</span>{' '}
                      <span className="font-medium">{appointment?.ServiceName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Date:</span>{' '}
                      <span className="font-medium">{appointment?.StartDateLocalFormatted}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Practitioner:</span>{' '}
                      <span className="font-medium">{appointment?.PractitionerName}</span>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-sm bg-blue-100 border border-blue-300"></div>
                    <span className="text-gray-600">Auto-populated</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-sm bg-white border border-gray-300"></div>
                    <span className="text-gray-600">Manual entry</span>
                  </div>
                </div>

                {/* CMS-1500 Form Fields */}
                <div className="space-y-6">
                  {/* Patient Information */}
                  <div className="rounded-lg border border-gray-300 p-4">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900">
                      Patient Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Patient Name (Box 2)
                        </label>
                        <input
                          type="text"
                          value={formData.patientName}
                          onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('patientName')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Date of Birth (Box 3)
                        </label>
                        <input
                          type="date"
                          value={formData.patientDOB}
                          onChange={(e) => setFormData({ ...formData, patientDOB: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('patientDOB')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Address (Box 5)
                        </label>
                        <input
                          type="text"
                          value={formData.patientAddress}
                          onChange={(e) => setFormData({ ...formData, patientAddress: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('patientAddress')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                          placeholder="Street address"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={formData.patientCity}
                          onChange={(e) => setFormData({ ...formData, patientCity: e.target.value })}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            value={formData.patientState}
                            onChange={(e) => setFormData({ ...formData, patientState: e.target.value })}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            maxLength={2}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">ZIP</label>
                          <input
                            type="text"
                            value={formData.patientZip}
                            onChange={(e) => setFormData({ ...formData, patientZip: e.target.value })}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insurance Information */}
                  <div className="rounded-lg border border-gray-300 p-4">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900">
                      Insurance Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Insurance Company (Box 11)
                        </label>
                        <input
                          type="text"
                          value={formData.insuranceCompany}
                          onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('insuranceCompany')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Member ID (Box 11a)
                        </label>
                        <input
                          type="text"
                          value={formData.memberId}
                          onChange={(e) => setFormData({ ...formData, memberId: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('memberId')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Group Number (Box 11c)
                        </label>
                        <input
                          type="text"
                          value={formData.groupNumber}
                          onChange={(e) => setFormData({ ...formData, groupNumber: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('groupNumber')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Diagnosis Codes */}
                  <div className="rounded-lg border border-gray-300 p-4">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900">
                      Diagnosis Codes (Box 21)
                    </h3>
                    <div className="space-y-3">
                      {formData.diagnosisCodes.length > 0 ? (
                        <div className="space-y-2">
                          {formData.diagnosisCodes.map((code, index) => (
                            <div key={index} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                              formData.autoPopulated.has('diagnosisCodes')
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-white border-gray-300'
                            }`}>
                              <span className="text-xs font-medium text-gray-500">
                                {index === 0 ? 'PRIMARY' : `SECONDARY ${index}`}:
                              </span>
                              <span className="font-mono font-semibold">{code}</span>
                              <button
                                onClick={() => {
                                  const newCodes = [...formData.diagnosisCodes];
                                  newCodes.splice(index, 1);
                                  setFormData({ ...formData, diagnosisCodes: newCodes });
                                }}
                                className="ml-auto text-red-600 hover:text-red-800"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                          <p className="text-sm text-gray-600">
                            No diagnosis codes yet. Use &quot;Code My Note&quot; to extract from clinical notes.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Service Information */}
                  <div className="rounded-lg border border-gray-300 p-4">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900">
                      Service Information (Box 24)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Date of Service (Box 24A)
                        </label>
                        <input
                          type="date"
                          value={formData.dateOfService}
                          onChange={(e) => setFormData({ ...formData, dateOfService: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('dateOfService')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Place of Service (Box 24B)
                        </label>
                        <select
                          value={formData.placeOfService}
                          onChange={(e) => setFormData({ ...formData, placeOfService: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('placeOfService')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                        >
                          <option value="02">02 - Telehealth</option>
                          <option value="10">10 - Telehealth (patient home)</option>
                          <option value="11">11 - Office</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          CPT Code (Box 24D)
                        </label>
                        <input
                          type="text"
                          value={formData.cptCode}
                          onChange={(e) => setFormData({ ...formData, cptCode: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm font-mono ${
                            formData.autoPopulated.has('cptCode')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                          placeholder="99214"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Add-On Code (Optional)
                        </label>
                        <input
                          type="text"
                          value={formData.cptAddOnCode}
                          onChange={(e) => setFormData({ ...formData, cptAddOnCode: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm font-mono ${
                            formData.autoPopulated.has('cptAddOnCode')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                          placeholder="90836"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Charges (Box 24F)
                        </label>
                        <input
                          type="text"
                          value={formData.charges}
                          onChange={(e) => setFormData({ ...formData, charges: e.target.value })}
                          className={`w-full rounded-md border px-3 py-2 text-sm ${
                            formData.autoPopulated.has('charges')
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-300'
                          }`}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* EDI Preview */}
                {showEDIPreview && ediContent && (
                  <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-green-900">
                        ✓ Claim Validated - X12 837P EDI Content
                      </h3>
                      <button
                        onClick={() => setShowEDIPreview(false)}
                        className="text-green-700 hover:text-green-900"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="rounded-md bg-white border border-green-200 p-4 max-h-60 overflow-y-auto">
                      <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all">
                        {ediContent}
                      </pre>
                    </div>
                    <div className="mt-3 flex gap-2 text-xs text-green-700">
                      <span>✓ All required fields validated</span>
                      <span>•</span>
                      <span>{ediContent.split('~').length - 1} segments</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                disabled={loading}
              >
                Save Draft
              </button>
              {!showEDIPreview ? (
                <button
                  onClick={handleValidateClaim}
                  className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                  disabled={loading || validating}
                >
                  {validating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Validate Claim</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleSubmitClaim}
                  className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  disabled={loading || submitting || submitSuccess}
                >
                  {submitSuccess ? (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Claim Submitted!</span>
                    </>
                  ) : submitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span>Submitting to Office Ally...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Submit Claim</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

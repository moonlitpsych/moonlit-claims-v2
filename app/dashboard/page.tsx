/**
 * Appointments Dashboard Page
 * Main dashboard for viewing and managing appointments with claim status
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { IntakeQAppointment, DiagnosisSuggestion, CPTSuggestion, ClaimStatus, CopayStatus } from '@/types';
import { AppointmentCard } from '@/components/AppointmentCard';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ClaimModal } from '@/components/ClaimModal';
import { NoteViewerModal } from '@/components/NoteViewerModal';
import { CopayDetailsModal } from '@/components/CopayDetailsModal';
import { format, subDays } from 'date-fns';

export default function DashboardPage() {
  const [appointments, setAppointments] = useState<IntakeQAppointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<IntakeQAppointment[]>([]);
  const [claimStatuses, setClaimStatuses] = useState<Record<string, ClaimStatus>>({});
  const [copayStatuses, setCopayStatuses] = useState<Record<string, { status: CopayStatus; amount?: number }>>({});
  const [loading, setLoading] = useState(true);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<IntakeQAppointment | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedAppointmentForNote, setSelectedAppointmentForNote] = useState<string | null>(null);
  const [isCopayModalOpen, setIsCopayModalOpen] = useState(false);
  const [selectedAppointmentForCopay, setSelectedAppointmentForCopay] = useState<string | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<Date | null>(null);
  const [aiCodingResults, setAiCodingResults] = useState<{
    diagnoses: DiagnosisSuggestion;
    cpt: CPTSuggestion;
  } | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/appointments?startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }

      const data = await response.json();

      if (data.success) {
        setAppointments(data.data || []);
      } else {
        throw new Error(data.error?.message || 'Failed to fetch appointments');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Fetch claim statuses for all appointments
  const fetchClaimStatuses = useCallback(async () => {
    if (appointments.length === 0) return;

    try {
      setStatusesLoading(true);

      // First, trigger download and processing of 277 files from Office Ally
      // This updates the database with latest statuses
      try {
        const statusUpdateResponse = await fetch('/api/claims/status-updates', {
          method: 'POST',
        });

        if (statusUpdateResponse.ok) {
          const updateData = await statusUpdateResponse.json();
          console.log('277 status update:', updateData);
        }
      } catch (updateErr) {
        // Continue even if 277 update fails - we'll still show cached statuses
        console.warn('277 status update failed, using cached data:', updateErr);
      }

      // Fetch claims from database (now with updated statuses)
      const response = await fetch('/api/claims?includeStatuses=true');

      if (!response.ok) {
        throw new Error('Failed to fetch claim statuses');
      }

      const data = await response.json();

      if (data.success && data.data) {
        // Build status map: appointmentId -> claimStatus
        const statusMap: Record<string, ClaimStatus> = {};

        data.data.forEach((claim: any) => {
          if (claim.intakeq_appointment_id) {
            statusMap[claim.intakeq_appointment_id] = claim.status as ClaimStatus;
          }
        });

        setClaimStatuses(statusMap);
        setLastStatusUpdate(new Date());
      }
    } catch (err) {
      console.error('Error fetching claim statuses:', err);
      // Don't show error to user - statuses are supplementary
    } finally {
      setStatusesLoading(false);
    }
  }, [appointments]);

  // Fetch appointments on mount and when date range changes
  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Fetch copay statuses for appointments (sample of first 10 for now)
  const fetchCopayStatuses = useCallback(async () => {
    if (appointments.length === 0) return;

    try {
      // Fetch copay statuses for first 10 appointments (to avoid too many API calls)
      const appointmentsToCheck = appointments.slice(0, 10);

      const copayStatusMap: Record<string, { status: CopayStatus; amount?: number }> = {};

      // Fetch copay statuses SEQUENTIALLY to avoid IntakeQ rate limiting
      // Add 500ms delay between requests
      for (const appointment of appointmentsToCheck) {
        try {
          // Now passing clientId as a query parameter
          const response = await fetch(`/api/copay/${appointment.Id}?clientId=${appointment.ClientId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              copayStatusMap[appointment.Id] = {
                status: data.data.paymentStatus as CopayStatus,
                amount: data.data.expectedCopayAmount || data.data.actualCopayAmount,
              };
            }
          }
          // Add delay to avoid rate limiting (IntakeQ allows ~2 req/sec)
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to fetch copay status for appointment ${appointment.Id}:`, error);
        }
      }

      setCopayStatuses(copayStatusMap);
    } catch (error) {
      console.error('Error fetching copay statuses:', error);
    }
  }, [appointments]);

  // Fetch claim statuses when appointments change
  useEffect(() => {
    if (appointments.length > 0) {
      fetchClaimStatuses();
      fetchCopayStatuses(); // Also fetch copay statuses
    }
  }, [appointments, fetchClaimStatuses, fetchCopayStatuses]);

  // Set up polling for claim statuses every hour
  useEffect(() => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Only poll if we have appointments
    if (appointments.length > 0) {
      pollingIntervalRef.current = setInterval(() => {
        fetchClaimStatuses();
      }, 3600000); // 1 hour (3600000 milliseconds)
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [appointments, fetchClaimStatuses]);

  // Apply filters
  useEffect(() => {
    let filtered = [...appointments];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (apt) =>
          apt.PractitionerName.toLowerCase().includes(query) ||
          apt.ServiceName.toLowerCase().includes(query) ||
          apt.ClientName.toLowerCase().includes(query) ||
          apt.Id.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      // Map lowercase filter values to IntakeQ status format
      const statusMap: Record<string, string> = {
        'completed': 'Completed',
        'scheduled': 'Scheduled',
        'confirmed': 'Confirmed',
        'cancelled': 'Cancelled',
        'no-show': 'No-Show',
      };
      const intakeqStatus = statusMap[statusFilter] || statusFilter;
      filtered = filtered.filter((apt) => apt.Status === intakeqStatus);
    }

    setFilteredAppointments(filtered);
  }, [appointments, searchQuery, statusFilter]);

  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleMakeClaim = (appointmentId: string) => {
    const appointment = appointments.find(apt => apt.Id === appointmentId);
    if (appointment) {
      setSelectedAppointment(appointment);
      setIsModalOpen(true);
    }
  };

  const handleCodeNote = (appointmentId: string) => {
    setSelectedAppointmentForNote(appointmentId);
    setIsNoteModalOpen(true);
  };

  const handleCloseNoteModal = () => {
    setIsNoteModalOpen(false);
    setSelectedAppointmentForNote(null);
  };

  const handleCopayClick = (appointmentId: string) => {
    setSelectedAppointmentForCopay(appointmentId);
    setIsCopayModalOpen(true);
  };

  const handleCloseCopayModal = () => {
    setIsCopayModalOpen(false);
    setSelectedAppointmentForCopay(null);
  };

  const handleApplyAICodingToClaim = (diagnoses: DiagnosisSuggestion, cpt: CPTSuggestion) => {
    // Store AI coding results
    setAiCodingResults({ diagnoses, cpt });

    // Close note modal
    setIsNoteModalOpen(false);

    // Find the appointment and open claim modal
    const appointment = appointments.find(apt => apt.Id === selectedAppointmentForNote);
    if (appointment) {
      setSelectedAppointment(appointment);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAppointment(null);
    setAiCodingResults(null); // Clear AI coding results when modal closes
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Appointments Dashboard</h1>
              <div className="mt-1 flex items-center gap-3">
                <p className="text-sm text-gray-600">
                  Manage appointments and create claims
                </p>
                {lastStatusUpdate && (
                  <span className="text-xs text-gray-500">
                    • Last status update: {format(lastStatusUpdate, 'h:mm:ss a')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchClaimStatuses}
                disabled={statusesLoading || appointments.length === 0}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {statusesLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                  </span>
                ) : (
                  'Update Statuses'
                )}
              </button>
              <button
                onClick={fetchAppointments}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Refresh All
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar - Filters */}
          <aside className="lg:col-span-1">
            <div className="space-y-6">
              {/* Date Range Filter */}
              <DateRangeFilter onDateRangeChange={handleDateRangeChange} />

              {/* Status Filter */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  Appointment Status
                </h3>
                <div className="space-y-2">
                  {['all', 'completed', 'scheduled', 'cancelled', 'no-show'].map((status) => (
                    <label key={status} className="flex items-center">
                      <input
                        type="radio"
                        name="status"
                        value={status}
                        checked={statusFilter === status}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {status === 'all' ? 'All Statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-medium text-gray-700">Statistics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Appointments</span>
                    <span className="font-semibold text-gray-900">{appointments.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Filtered Results</span>
                    <span className="font-semibold text-gray-900">
                      {filteredAppointments.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content - Appointments List */}
          <div className="lg:col-span-3">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by practitioner, service, or appointment ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600"></div>
                  <p className="mt-4 text-sm text-gray-600">Loading appointments...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6">
                <div className="flex items-start">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error loading appointments</h3>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                    <button
                      onClick={fetchAppointments}
                      className="mt-3 text-sm font-medium text-red-600 hover:text-red-500"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredAppointments.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  No appointments found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No appointments in the selected date range'}
                </p>
              </div>
            )}

            {/* Appointments List */}
            {!loading && !error && filteredAppointments.length > 0 && (
              <div className="space-y-4">
                {filteredAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.Id}
                    appointment={appointment}
                    claimStatus={claimStatuses[appointment.Id]}
                    copayStatus={copayStatuses[appointment.Id]?.status}
                    copayAmount={copayStatuses[appointment.Id]?.amount}
                    onMakeClaim={handleMakeClaim}
                    onCodeNote={handleCodeNote}
                    onCopayClick={handleCopayClick}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Claim Modal */}
      <ClaimModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        appointment={selectedAppointment}
        aiCodingResults={aiCodingResults}
      />

      {/* Note Viewer Modal */}
      <NoteViewerModal
        isOpen={isNoteModalOpen}
        onClose={handleCloseNoteModal}
        appointmentId={selectedAppointmentForNote}
        onApplyToClaimExternal={handleApplyAICodingToClaim}
      />

      {/* Copay Details Modal */}
      <CopayDetailsModal
        isOpen={isCopayModalOpen}
        onClose={handleCloseCopayModal}
        appointmentId={selectedAppointmentForCopay || ''}
        copayData={
          selectedAppointmentForCopay
            ? {
                paymentStatus: copayStatuses[selectedAppointmentForCopay]?.status || CopayStatus.UNKNOWN,
                expectedCopayAmount: copayStatuses[selectedAppointmentForCopay]?.amount,
              }
            : undefined
        }
        patientName={
          selectedAppointmentForCopay
            ? appointments.find((apt) => apt.Id === selectedAppointmentForCopay)?.ClientName
            : undefined
        }
        serviceDate={
          selectedAppointmentForCopay
            ? appointments.find((apt) => apt.Id === selectedAppointmentForCopay)?.StartDateIso
            : undefined
        }
      />
    </div>
  );
}

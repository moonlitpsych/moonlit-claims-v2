/**
 * Appointment Card Component
 * Displays individual appointment with claim status and copay status
 */

import { IntakeQAppointment, ClaimStatus, CopayStatus } from '@/types';
import { StatusBadge } from './StatusBadge';
import { CopayStatusIcon } from './CopayStatusIcon';
import { format } from 'date-fns';

interface AppointmentCardProps {
  appointment: IntakeQAppointment;
  claimStatus?: ClaimStatus;
  copayStatus?: CopayStatus;
  copayAmount?: number;
  onMakeClaim?: (appointmentId: string) => void;
  onCodeNote?: (appointmentId: string) => void;
  onCopayClick?: (appointmentId: string) => void;
}

export function AppointmentCard({
  appointment,
  claimStatus,
  copayStatus,
  copayAmount,
  onMakeClaim,
  onCodeNote,
  onCopayClick,
}: AppointmentCardProps) {
  // IntakeQ provides ISO date strings
  const startDate = new Date(appointment.StartDateIso);
  const endDate = new Date(appointment.EndDateIso);

  // Duration is provided directly by IntakeQ
  const durationMinutes = appointment.Duration;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Date and Time */}
          <div className="mb-2 flex items-center gap-3">
            <time className="text-lg font-semibold text-gray-900">
              {format(startDate, 'MMM d, yyyy')}
            </time>
            <span className="text-sm text-gray-500">
              {format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')} ({durationMinutes} min)
            </span>
          </div>

          {/* Service Name */}
          <h3 className="mb-2 text-base font-medium text-gray-900">
            {appointment.ServiceName}
          </h3>

          {/* Practitioner */}
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>{appointment.PractitionerName}</span>
          </div>

          {/* Patient Name */}
          <div className="mb-3 text-sm text-gray-600">
            <span className="font-medium">Patient:</span> {appointment.ClientName}
          </div>

          {/* Appointment Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Appointment:</span>
            <span
              className={`text-xs font-medium ${
                appointment.Status === 'Completed'
                  ? 'text-green-600'
                  : appointment.Status === 'Confirmed'
                    ? 'text-blue-600'
                    : 'text-gray-600'
              }`}
            >
              {appointment.Status}
            </span>
          </div>
        </div>

        {/* Status Badges */}
        <div className="ml-4 flex items-center gap-2">
          {/* Claim Status Badge */}
          <StatusBadge status={claimStatus || 'not_submitted'} />

          {/* Copay Status Icon */}
          <CopayStatusIcon
            status={copayStatus || CopayStatus.UNKNOWN}
            amount={copayAmount}
            onClick={() => onCopayClick?.(appointment.Id)}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onMakeClaim?.(appointment.Id)}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Make My Claim
        </button>
        <button
          onClick={() => onCodeNote?.(appointment.Id)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Code My Note
        </button>
      </div>

      {/* Appointment ID (for debugging) */}
      <div className="mt-3 text-xs text-gray-400">
        ID: {appointment.Id}
      </div>
    </div>
  );
}

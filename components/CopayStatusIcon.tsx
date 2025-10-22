/**
 * Copay Status Icon Component
 * Visual indicator for copay payment status with tooltip
 */

import { CopayStatus } from '@/types';

interface CopayStatusIconProps {
  status: CopayStatus;
  amount?: number;
  onClick?: () => void;
  loading?: boolean;
}

export function CopayStatusIcon({ status, amount, onClick, loading }: CopayStatusIconProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <svg
          className="h-5 w-5 animate-spin text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  // Determine icon, color, and tooltip based on status
  const getStatusConfig = () => {
    switch (status) {
      case CopayStatus.PAID:
        return {
          icon: (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ),
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          tooltip: amount ? `Copay Paid: $${amount.toFixed(2)}` : 'Copay Paid',
        };

      case CopayStatus.OWED:
        return {
          icon: (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
          ),
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          tooltip: amount ? `Copay Owed: $${amount.toFixed(2)}` : 'Copay Owed',
        };

      case CopayStatus.NOT_REQUIRED:
        return {
          icon: (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          ),
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
          tooltip: 'No Copay Required',
        };

      case CopayStatus.WAIVED:
        return {
          icon: (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ),
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          tooltip: 'Copay Waived',
        };

      case CopayStatus.UNKNOWN:
      default:
        return {
          icon: (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          ),
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
          tooltip: amount
            ? `Expected Copay: $${amount.toFixed(2)} (Status Unknown)`
            : 'Copay Status Unknown',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${config.bgColor} ${config.color} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`}
        title={config.tooltip}
        aria-label={config.tooltip}
      >
        {config.icon}
      </button>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg">
          {config.tooltip}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      </div>
    </div>
  );
}

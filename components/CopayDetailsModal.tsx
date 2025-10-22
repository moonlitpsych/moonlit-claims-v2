/**
 * Copay Details Modal Component
 * Displays detailed copay information with option to check eligibility
 */

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { CopayStatus } from '@/types';
import { format } from 'date-fns';

interface CopayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  copayData?: {
    paymentStatus: CopayStatus;
    expectedCopayAmount?: number;
    actualCopayAmount?: number;
    paymentDate?: string;
    invoiceId?: string;
    lastSyncedAt?: string;
    cached?: boolean;
  };
  patientName?: string;
  serviceDate?: string;
  onCheckEligibility?: () => void;
}

export function CopayDetailsModal({
  isOpen,
  onClose,
  appointmentId,
  copayData,
  patientName,
  serviceDate,
  onCheckEligibility,
}: CopayDetailsModalProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger refresh by calling API again
    try {
      const response = await fetch(`/api/copay/${appointmentId}`);
      if (response.ok) {
        // Parent component should re-fetch
        window.location.reload(); // Simple approach - could be improved with state management
      }
    } catch (error) {
      console.error('Failed to refresh copay status:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusDisplay = (status: CopayStatus) => {
    switch (status) {
      case CopayStatus.PAID:
        return {
          label: 'Paid',
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          icon: '✓',
        };
      case CopayStatus.OWED:
        return {
          label: 'Owed',
          color: 'text-yellow-700',
          bgColor: 'bg-yellow-100',
          icon: '⏳',
        };
      case CopayStatus.NOT_REQUIRED:
        return {
          label: 'Not Required',
          color: 'text-gray-700',
          bgColor: 'bg-gray-100',
          icon: '—',
        };
      case CopayStatus.WAIVED:
        return {
          label: 'Waived',
          color: 'text-blue-700',
          bgColor: 'bg-blue-100',
          icon: 'ℹ',
        };
      case CopayStatus.UNKNOWN:
      default:
        return {
          label: 'Unknown',
          color: 'text-gray-700',
          bgColor: 'bg-gray-100',
          icon: '?',
        };
    }
  };

  const statusDisplay = copayData
    ? getStatusDisplay(copayData.paymentStatus)
    : getStatusDisplay(CopayStatus.UNKNOWN);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Copay Details
                </Dialog.Title>

                <div className="mt-4 space-y-4">
                  {/* Patient & Service Info */}
                  {(patientName || serviceDate) && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      {patientName && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Patient:</span> {patientName}
                        </p>
                      )}
                      {serviceDate && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Service Date:</span>{' '}
                          {format(new Date(serviceDate), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Payment Status
                    </label>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}
                      >
                        <span className="mr-1.5">{statusDisplay.icon}</span>
                        {statusDisplay.label}
                      </span>
                    </div>
                  </div>

                  {/* Expected Copay Amount */}
                  {copayData?.expectedCopayAmount !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Expected Copay (from Eligibility)
                      </label>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        ${copayData.expectedCopayAmount.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Actual Copay Amount */}
                  {copayData?.actualCopayAmount !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Actual Copay (from Invoice)
                      </label>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        ${copayData.actualCopayAmount.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Payment Date */}
                  {copayData?.paymentDate && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Payment Date
                      </label>
                      <p className="mt-1 text-sm text-gray-900">
                        {format(new Date(copayData.paymentDate), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  )}

                  {/* Invoice Link */}
                  {copayData?.invoiceId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        IntakeQ Invoice
                      </label>
                      <a
                        href={`https://intakeq.com/admin/invoices/${copayData.invoiceId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
                      >
                        View Invoice
                        <svg
                          className="ml-1 h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                  )}

                  {/* Last Synced */}
                  {copayData?.lastSyncedAt && (
                    <div className="text-xs text-gray-500">
                      Last updated: {format(new Date(copayData.lastSyncedAt), 'MMM d, h:mm a')}
                      {copayData.cached && ' (cached)'}
                    </div>
                  )}

                  {/* No Data Message */}
                  {!copayData && (
                    <div className="rounded-lg bg-yellow-50 p-4">
                      <p className="text-sm text-yellow-800">
                        No copay information available. Check eligibility to get expected copay
                        amount.
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-3">
                  {onCheckEligibility && (
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                      onClick={onCheckEligibility}
                    >
                      Check Eligibility
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

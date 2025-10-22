/**
 * Date Range Filter Component
 * Allows users to select a date range for filtering appointments
 */

'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';

interface DateRangeFilterProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
}

export function DateRangeFilter({ onDateRangeChange }: DateRangeFilterProps) {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

  const handleApply = () => {
    onDateRangeChange(startDate, endDate);
  };

  const handlePreset = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year') => {
    let start: Date;
    const end: Date = today;

    switch (preset) {
      case 'today':
        start = today;
        break;
      case 'week':
        start = subDays(today, 7);
        break;
      case 'month':
        start = subDays(today, 30);
        break;
      case 'quarter':
        start = subDays(today, 90);
        break;
      case 'year':
        start = subDays(today, 365);
        break;
    }

    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    setStartDate(startStr);
    setEndDate(endStr);
    onDateRangeChange(startStr, endStr);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-gray-700">Date Range</h3>

      {/* Date Inputs */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="mb-1 block text-xs text-gray-600">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="mb-1 block text-xs text-gray-600">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Quick Presets */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => handlePreset('today')}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Today
        </button>
        <button
          onClick={() => handlePreset('week')}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Last 7 Days
        </button>
        <button
          onClick={() => handlePreset('month')}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Last 30 Days
        </button>
        <button
          onClick={() => handlePreset('quarter')}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Last 90 Days
        </button>
        <button
          onClick={() => handlePreset('year')}
          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          Last Year
        </button>
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApply}
        className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        Apply Filter
      </button>
    </div>
  );
}

/**
 * Note Viewer Modal
 * Displays clinical note and allows user to trigger AI coding analysis
 */

'use client';

import { useState, useEffect } from 'react';
import { IntakeQNote, DiagnosisSuggestion, CPTSuggestion } from '@/types';
import { AICodeResults } from './AICodeResults';

interface NoteViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string | null;
  onApplyToClaimExternal?: (diagnoses: DiagnosisSuggestion, cpt: CPTSuggestion) => void;
}

export function NoteViewerModal({
  isOpen,
  onClose,
  appointmentId,
  onApplyToClaimExternal,
}: NoteViewerModalProps) {
  const [note, setNote] = useState<IntakeQNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [diagnosisSuggestion, setDiagnosisSuggestion] = useState<DiagnosisSuggestion | null>(null);
  const [cptSuggestion, setCptSuggestion] = useState<CPTSuggestion | null>(null);

  // Fetch note when modal opens
  useEffect(() => {
    if (isOpen && appointmentId) {
      fetchNote();
    } else {
      // Reset state when modal closes
      setNote(null);
      setError(null);
      setShowResults(false);
      setDiagnosisSuggestion(null);
      setCptSuggestion(null);
    }
  }, [isOpen, appointmentId]);

  const fetchNote = async () => {
    if (!appointmentId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/notes/${appointmentId}`);
      const result = await response.json();

      if (result.success && result.data) {
        setNote(result.data);
      } else {
        setError(result.error?.message || 'Note not found for this appointment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch note');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeNote = async () => {
    if (!note?.Questions || note.Questions.length === 0) return;

    setAnalyzing(true);
    setError(null);

    try {
      // Build note content from Questions array
      const noteContent = note.Questions
        .filter((q) => q.Answer && q.Answer.trim())
        .map((q) => `${q.Text || 'Question'}: ${q.Answer}`)
        .join('\n\n');

      if (!noteContent) {
        setError('No content found in note');
        setAnalyzing(false);
        return;
      }

      // Call both AI endpoints in parallel
      const [diagnosisResponse, cptResponse] = await Promise.all([
        fetch('/api/ai-coding/diagnoses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteContent }),
        }),
        fetch('/api/ai-coding/cpt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteContent }),
        }),
      ]);

      const diagnosisResult = await diagnosisResponse.json();
      const cptResult = await cptResponse.json();

      if (diagnosisResult.success && cptResult.success) {
        setDiagnosisSuggestion(diagnosisResult.data);
        setCptSuggestion(cptResult.data);
        setShowResults(true);
      } else {
        const errors = [];
        if (!diagnosisResult.success) errors.push('diagnosis extraction');
        if (!cptResult.success) errors.push('CPT code suggestion');
        setError(`Failed to complete: ${errors.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze note');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyToClaim = () => {
    if (diagnosisSuggestion && cptSuggestion && onApplyToClaimExternal) {
      onApplyToClaimExternal(diagnosisSuggestion, cptSuggestion);
      onClose();
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
              <h2 className="text-2xl font-bold text-gray-900">Clinical Note</h2>
              <p className="mt-1 text-sm text-gray-600">
                {showResults
                  ? 'Review AI coding suggestions'
                  : 'Review note and analyze with AI'}
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
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600"></div>
                  <p className="mt-4 text-sm text-gray-600">Loading note...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
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
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Note Display */}
            {!loading && !error && note && !showResults && (
              <div className="space-y-4">
                {/* Note Metadata */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">Note Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Note Name:</span>{' '}
                      <span className="font-medium">{note.NoteName || 'Clinical Note'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Date:</span>{' '}
                      <span className="font-medium">
                        {note.Date ? new Date(note.Date).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Client:</span>{' '}
                      <span className="font-medium">{note.ClientName}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Practitioner:</span>{' '}
                      <span className="font-medium">{note.PractitionerName}</span>
                    </div>
                  </div>
                </div>

                {/* Note Content */}
                <div className="rounded-lg border border-gray-300 bg-white p-6">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900">Note Content</h3>
                  {note.Questions && note.Questions.length > 0 ? (
                    <div className="space-y-4">
                      {note.Questions.filter((q) => q.Answer && q.Answer.trim()).map(
                        (question, index) => (
                          <div key={question.Id || index} className="border-b border-gray-200 pb-4">
                            <div className="mb-1 text-sm font-medium text-gray-700">
                              {question.Text || `Question ${index + 1}`}
                            </div>
                            <div className="text-sm text-gray-600 whitespace-pre-wrap">
                              {question.Answer}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No content available in this note.</div>
                  )}
                </div>

                {/* Call to Action */}
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-primary-300 bg-primary-50 p-6">
                  <div className="text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-primary-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    <h3 className="mt-4 text-sm font-medium text-gray-900">
                      Ready to analyze with AI?
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      AI will extract diagnoses and suggest CPT codes based on this note
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Results Display */}
            {!loading && !error && showResults && diagnosisSuggestion && cptSuggestion && (
              <AICodeResults
                diagnosisSuggestion={diagnosisSuggestion}
                cptSuggestion={cptSuggestion}
                onApplyToClaim={handleApplyToClaim}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {showResults ? 'Close' : 'Cancel'}
            </button>
            {!showResults && note && (
              <button
                onClick={handleAnalyzeNote}
                disabled={analyzing || !note.Questions || note.Questions.length === 0}
                className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    <span>Analyze with AI</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

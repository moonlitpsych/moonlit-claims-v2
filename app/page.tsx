import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 sm:p-24">
      <main className="w-full max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900 sm:text-5xl">
          Moonlit Claims
        </h1>
        <p className="mb-8 text-xl text-gray-600">
          AI-Powered Claims Submission Application
        </p>

        <div className="rounded-lg bg-white p-8 shadow-lg">
          <div className="mb-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
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
            </div>
            <p className="text-lg font-semibold text-gray-900">
              Phase 0: Foundation Complete ✅
            </p>
            <p className="mt-2 text-sm text-gray-600">
              All infrastructure, database, and API integrations are ready
            </p>
          </div>

          <div className="mb-6 rounded-md bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">
              🚀 Phase 1: Appointments Dashboard - In Progress
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-block rounded-md bg-primary-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Go to Dashboard
          </Link>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">✅ IntakeQ</p>
              <p className="mt-1 text-xs text-gray-500">API Connected</p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">✅ Office Ally</p>
              <p className="mt-1 text-xs text-gray-500">SFTP & REALTIME</p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">✅ Gemini AI</p>
              <p className="mt-1 text-xs text-gray-500">HIPAA Configured</p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Version 0.1.0 - Phase 1 Development
        </p>
      </main>
    </div>
  );
}

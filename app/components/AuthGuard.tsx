'use client';

import { useAuth } from '../lib/auth-context';
import AuthForm from './AuthForm';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // E2E test mode bypasses Supabase auth to allow deterministic browser automation.
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <>{children}</>;
}

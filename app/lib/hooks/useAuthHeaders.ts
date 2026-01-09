import { useCallback } from 'react';
import { useAuth } from '@/app/lib/auth-context';

export function useAuthHeaders() {
  const { session } = useAuth();

  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session]);

  return getAuthHeaders;
}

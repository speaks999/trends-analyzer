// Supabase client for browser/client-side use
// Uses publishable key (safe for browser, respects RLS policies)

import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

// Create Supabase client with error handling for build-time
// During build, env vars might not be set, so we handle that gracefully
let supabase: ReturnType<typeof createClient<Database>>;

try {
  // E2E mode: never call Supabase (tests should run without external services).
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
    supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'E2E mode' } }),
        signUp: async () => ({ data: { user: null, session: null }, error: { message: 'E2E mode' } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
      },
    } as unknown as ReturnType<typeof createClient<Database>>;
  } else
  // Check if we have valid credentials
  if (supabaseUrl && supabasePublishableKey && 
      supabaseUrl.startsWith('http') && 
      supabasePublishableKey.length > 20) {
    // Valid credentials - create normal client
    supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } else {
    // Missing or invalid credentials - return a local stub (avoid network calls).
    console.warn('Supabase credentials missing or invalid - using stub client');
    supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured', status: 500 } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Not configured' } }),
        signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Not configured' } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
      },
    } as unknown as ReturnType<typeof createClient<Database>>;
  }
} catch (error) {
  // If client creation fails during build, create a minimal stub
  console.warn('Supabase client creation failed during build, using stub:', error);
  // This stub will fail gracefully at runtime when actually used
  supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured', status: 500 } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Not configured' } }),
      signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Not configured' } }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
    },
  } as unknown as ReturnType<typeof createClient<Database>>;
}

export { supabase };

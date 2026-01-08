// Supabase client for browser/client-side use
// Uses publishable key (safe for browser, respects RLS policies)

import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Use publishable key for client-side (safe to expose in browser, respects RLS)
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Supabase URL or Publishable Key is missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables.');
}

// Create a Supabase client for browser use with auth persistence
// Uses publishable key which is safe for client-side and respects Row Level Security
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

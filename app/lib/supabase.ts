// Supabase client configuration for server-side ADMIN operations ONLY
// ⚠️ WARNING: This client uses the service role key and bypasses RLS policies.
// 
// For user-authenticated operations, ALWAYS use getAuthenticatedSupabaseClient()
// from auth-helpers.ts which respects RLS and user permissions.
//
// Only use this client for:
// - Admin operations that need to bypass RLS
// - Server-side operations that don't require user context
// - Background jobs or system-level tasks

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
// Use service role key (secret key) for admin operations only
// This bypasses RLS - use with caution!
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Secret Key is missing. Admin operations may not work. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.');
}

// Create a Supabase client for server-side ADMIN use only
// ⚠️ This bypasses Row Level Security - do not use for user-scoped operations!
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Database types
export interface Database {
  public: {
    Tables: {
      queries: {
        Row: {
          id: string;
          text: string;
          template: string | null;
          stage: string | null;
          function: string | null;
          pain: string | null;
          asset: string | null;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          text: string;
          template?: string | null;
          stage?: string | null;
          function?: string | null;
          pain?: string | null;
          asset?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          text?: string;
          template?: string | null;
          stage?: string | null;
          function?: string | null;
          pain?: string | null;
          asset?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
      };
      trend_snapshots: {
        Row: {
          id: string;
          query_id: string;
          date: string;
          interest_value: number;
          region: string | null;
          window: '30d';
          created_at: string;
        };
        Insert: {
          id?: string;
          query_id: string;
          date: string;
          interest_value: number;
          region?: string | null;
          window: '30d';
          created_at?: string;
        };
        Update: {
          id?: string;
          query_id?: string;
          date?: string;
          interest_value?: number;
          region?: string | null;
          window?: '30d';
          created_at?: string;
        };
      };
      trend_scores: {
        Row: {
          id: string;
          query_id: string;
          score: number;
          slope: number;
          acceleration: number;
          consistency: number;
          breadth: number;
          window: '30d' | null;
          calculated_at: string;
        };
        Insert: {
          id?: string;
          query_id: string;
          score: number;
          slope: number;
          acceleration: number;
          consistency: number;
          breadth: number;
          window?: '30d' | null;
          calculated_at?: string;
        };
        Update: {
          id?: string;
          query_id?: string;
          score?: number;
          slope?: number;
          acceleration?: number;
          consistency?: number;
          breadth?: number;
          window?: '30d' | null;
          calculated_at?: string;
        };
      };
      intent_classifications: {
        Row: {
          id: string;
          query_id: string;
          intent_type: 'pain' | 'tool' | 'transition' | 'education';
          confidence: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          query_id: string;
          intent_type: 'pain' | 'tool' | 'transition' | 'education';
          confidence: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          query_id?: string;
          intent_type?: 'pain' | 'tool' | 'transition' | 'education';
          confidence?: number;
          created_at?: string;
        };
      };
      opportunity_clusters: {
        Row: {
          id: string;
          name: string;
          intent_type: 'pain' | 'tool' | 'transition' | 'education';
          average_score: number;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          intent_type: 'pain' | 'tool' | 'transition' | 'education';
          average_score: number;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          intent_type?: 'pain' | 'tool' | 'transition' | 'education';
          average_score?: number;
          user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cluster_queries: {
        Row: {
          cluster_id: string;
          query_id: string;
        };
        Insert: {
          cluster_id: string;
          query_id: string;
        };
        Update: {
          cluster_id?: string;
          query_id?: string;
        };
      };
    };
  };
}

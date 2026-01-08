// Supabase client configuration for server-side use
// Uses secret key for server-side operations (bypasses RLS for admin operations)

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
// Use secret key for server-side operations (NOT exposed to client)
// Falls back to publishable key if secret key not available (will still work with RLS)
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Key is missing. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) environment variables.');
}

// Create a single supabase client for server-side use
// Using secret key allows admin operations that bypass RLS
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
          window: '30d' | '90d' | '12m';
          created_at: string;
        };
        Insert: {
          id?: string;
          query_id: string;
          date: string;
          interest_value: number;
          region?: string | null;
          window: '30d' | '90d' | '12m';
          created_at?: string;
        };
        Update: {
          id?: string;
          query_id?: string;
          date?: string;
          interest_value?: number;
          region?: string | null;
          window?: '30d' | '90d' | '12m';
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          intent_type: 'pain' | 'tool' | 'transition' | 'education';
          average_score: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          intent_type?: 'pain' | 'tool' | 'transition' | 'education';
          average_score?: number;
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

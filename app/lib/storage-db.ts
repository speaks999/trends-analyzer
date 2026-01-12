// Supabase-based data storage for the trends analyzer
// Supports both client-side and server-side usage
// TODO: Regenerate Database types from Supabase to fix TypeScript errors

import { supabase as clientSupabase } from './supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdsKeywordMetrics,
  EntrepreneurProfile,
  IntentClassification,
  OpportunityCluster,
  OpportunityScore,
  PeopleAlsoAsk,
  Query,
  RelatedQuestion,
  RelatedTopic,
  TrendScore,
  TrendSnapshot,
} from './storage';

// Type assertion helper to work around Database type issues until types are regenerated
const defaultTypedSupabase = clientSupabase as any;

// Configuration for direct PostgREST calls (used as fallback when Supabase client fails)
interface DirectPostgRESTConfig {
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
}

export class DatabaseStorage {
  private supabase: any;
  // Optional direct PostgREST config for server-side fallback
  private directConfig?: DirectPostgRESTConfig;

  constructor(supabaseClient?: SupabaseClient<any>, directConfig?: DirectPostgRESTConfig) {
    // If a Supabase client is provided (for server-side), use it
    // Otherwise use the default client-side one
    this.supabase = supabaseClient ? (supabaseClient as any) : defaultTypedSupabase;
    this.directConfig = directConfig;
  }

  // Direct PostgREST query (bypasses Supabase client for more reliable RLS)
  private async directPostgRESTQuery<T>(table: string, params: Record<string, string>): Promise<T[]> {
    if (!this.directConfig) {
      console.log('[Storage] No directConfig, using Supabase client');
      return [];
    }

    const { supabaseUrl, apiKey, accessToken } = this.directConfig;
    const queryString = new URLSearchParams(params).toString();
    const url = `${supabaseUrl}/rest/v1/${table}?${queryString}`;

    console.log(`[Storage Direct] Querying ${table} with JWT`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Request-Id': `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Storage Direct] Error ${response.status}: ${errorText}`);
        return [];
      }

      const data = await response.json();
      console.log(`[Storage Direct] ${table} returned ${data?.length || 0} rows`);
      return data || [];
    } catch (error) {
      console.error(`[Storage Direct] Exception querying ${table}:`, error);
      return [];
    }
  }

  // Get current user ID (works for both client-side and server-side)
  private async getCurrentUserId(): Promise<string> {
    // Try getUser() first (works for both client and server if token is in headers)
    // This works for server-side when Authorization header is set in global headers
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      if (user && !error) {
        return user.id;
      }
    } catch {
      // Continue to try getSession()
    }

    // Fallback: Check if we have a session (client-side)
    // This works for client-side when session is stored in browser
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        return session.user.id;
      }
    } catch {
      // Fall through to error
    }

    throw new Error('User must be authenticated');
  }

  // Query management
  async addQuery(query: Omit<Query, 'id' | 'created_at'>): Promise<Query> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('queries')
      .insert({
        text: query.text,
        template: query.template || null,
        stage: query.stage || null,
        function: query.function || null,
        pain: query.pain || null,
        asset: query.asset || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      // If duplicate (same text for same user), try to get existing query
      if (error.code === '23505') { // Unique violation
        const { data: existing } = await this.supabase
          .from('queries')
          .select()
          .eq('text', query.text)
          .eq('user_id', userId)
          .single();
        
        if (existing) {
          return this.mapQueryFromDb(existing);
        }
      }
      throw new Error(`Failed to add query: ${error.message}`);
    }

    return this.mapQueryFromDb(data);
  }

  async getQuery(id: string): Promise<Query | undefined> {
    const { data, error } = await this.supabase
      .from('queries')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) return undefined;
    return this.mapQueryFromDb(data);
  }

  async getAllQueries(): Promise<Query[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('queries')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching queries:', error);
      return [];
    }

    return (data || []).map(this.mapQueryFromDb);
  }

  async removeQuery(id: string): Promise<boolean> {
    // Cascade delete will handle related records
    const { error } = await this.supabase
      .from('queries')
      .delete()
      .eq('id', id);

    return !error;
  }

  // Trend snapshot management
  async addTrendSnapshot(snapshot: TrendSnapshot): Promise<void> {
    // Ensure interest_value is a valid number
    // Handle string values that may be returned (legacy from cached data)
    // Runtime validation since TypeScript types don't guarantee runtime values
    let interestValue: number;
    const rawValue: any = (snapshot as any).interest_value;
    
    if (typeof rawValue === 'string') {
      // Handle "<1" format - parse as 0.5
      if (rawValue.startsWith('<')) {
        interestValue = 0.5;
      } else {
        interestValue = parseFloat(rawValue) || 0;
      }
    } else if (typeof rawValue === 'number' && !isNaN(rawValue)) {
      interestValue = rawValue;
    } else {
      interestValue = 0;
    }

    const { error } = await this.supabase
      .from('trend_snapshots')
      .upsert({
        query_id: snapshot.query_id,
        date: snapshot.date.toISOString(),
        interest_value: interestValue,
        region: snapshot.region || null,
        window: snapshot.window,
      }, {
        onConflict: 'query_id,date,region,window',
      });

    if (error) {
      console.error('Error adding trend snapshot:', error);
      throw new Error(`Failed to add trend snapshot: ${error.message}`);
    }
  }

  // Batch insert trend snapshots (more efficient than individual inserts)
  async addTrendSnapshotsBatch(snapshots: TrendSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;

    // Prepare data for batch insert
    const data = snapshots.map(snapshot => {
      // Ensure interest_value is a valid number
      let interestValue: number;
      const rawValue: any = (snapshot as any).interest_value;
      
      if (typeof rawValue === 'string') {
        // Handle "<1" format - parse as 0.5
        if (rawValue.startsWith('<')) {
          interestValue = 0.5;
        } else {
          interestValue = parseFloat(rawValue) || 0;
        }
      } else if (typeof rawValue === 'number' && !isNaN(rawValue)) {
        interestValue = rawValue;
      } else {
        interestValue = 0;
      }

      return {
        query_id: snapshot.query_id,
        date: snapshot.date.toISOString(),
        interest_value: interestValue,
        region: snapshot.region || null,
        window: snapshot.window,
      };
    });

    const { error } = await this.supabase
      .from('trend_snapshots')
      .upsert(data, {
        onConflict: 'query_id,date,region,window',
      });

    if (error) {
      console.error('Error batch adding trend snapshots:', error);
      throw new Error(`Failed to batch add trend snapshots: ${error.message}`);
    }
  }

  async getTrendSnapshots(queryId: string, window?: '90d', region?: string): Promise<TrendSnapshot[]> {
    let query = this.supabase
      .from('trend_snapshots')
      .select()
      .eq('query_id', queryId);

    if (window) {
      query = query.eq('window', window);
    }

    if (region) {
      query = query.eq('region', region);
    }

    const { data, error } = await query.order('date', { ascending: true });

    if (error) {
      console.error('Error fetching trend snapshots:', error);
      return [];
    }

    return (data || []).map(this.mapSnapshotFromDb);
  }

  // Check if we have cached data for a query/window/region combination
  async hasCachedTrendData(queryId: string, window: '90d', region: string): Promise<boolean> {
    const snapshots = await this.getTrendSnapshots(queryId, window, region);
    
    // Consider data cached if we have at least some data points
    // For 90d: expect ~90 points (daily) or ~13 points (weekly)
    const minExpectedPoints = 75; // 90d window - minimum expected data points
    
    return snapshots.length >= minExpectedPoints;
  }

  // Batch check if multiple queries have cached data for a window/region combination
  async batchHasCachedTrendData(
    queryIdMap: Map<string, string>,
    window: '90d',
    region: string
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    // Get all query IDs
    const queryIds = Array.from(queryIdMap.values());
    if (queryIds.length === 0) {
      return results;
    }

    // Batch query: get all snapshots for these queries in this window/region
    const { data: snapshots, error } = await this.supabase
      .from('trend_snapshots')
      .select('query_id')
      .in('query_id', queryIds)
      .eq('window', window)
      .eq('region', region);

    if (error) {
      console.error('Error batch checking cache:', error);
      // Return all false on error
      queryIdMap.forEach((_, queryText) => results.set(queryText, false));
      return results;
    }

    // Count snapshots per query ID
    const snapshotCounts = new Map<string, number>();
    (snapshots || []).forEach((s: any) => {
      snapshotCounts.set(s.query_id, (snapshotCounts.get(s.query_id) || 0) + 1);
    });

    // Determine if each query has enough cached data
    const minExpectedPoints = 75; // 90d window - minimum expected data points
    
    queryIdMap.forEach((queryId, queryText) => {
      const count = snapshotCounts.get(queryId) || 0;
      results.set(queryText, count >= minExpectedPoints);
    });

    return results;
  }

  // Get cached trend data for a query, reconstructing InterestOverTimeResult format
  async getCachedTrendData(
    queryText: string,
    queryId: string,
    window: '90d',
    region: string
  ): Promise<{ query: string; data: Array<{ date: Date; value: number }>; window: '90d'; geo?: string } | null> {
    const snapshots = await this.getTrendSnapshots(queryId, window, region);
    
    if (snapshots.length === 0) {
      return null;
    }

    // Convert snapshots to TrendDataPoint format
    const data = snapshots.map(s => ({
      date: s.date,
      value: s.interest_value,
    }));

    // Remove region suffix since we only search US now
    return {
      query: queryText, // No region suffix
      data,
      window,
      geo: region,
    };
  }

  async getLatestSnapshot(queryId: string, window: '90d'): Promise<TrendSnapshot | undefined> {
    try {
      const { data, error } = await this.supabase
        .from('trend_snapshots')
        .select()
        .eq('query_id', queryId)
        .eq('window', window)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() to avoid 406 when no snapshot exists

      if (error || !data) return undefined;
      return this.mapSnapshotFromDb(data);
    } catch (error) {
      console.error('Unexpected error in getLatestSnapshot:', error);
      return undefined;
    }
  }

  // Trend score management
  async setTrendScore(score: TrendScore & { window?: '90d' }): Promise<void> {
    const window = score.window || '90d';
    
    const { error } = await this.supabase
      .from('trend_scores')
      .upsert({
        query_id: score.query_id,
        score: score.score,
        slope: score.slope,
        acceleration: score.acceleration,
        consistency: score.consistency,
        breadth: score.breadth,
        window: window,
        calculated_at: score.calculated_at.toISOString(),
      }, {
        onConflict: 'query_id,window', // Uses the unique constraint trend_scores_query_id_window_key
      });

    if (error) {
      console.error('Error setting trend score:', error);
      throw new Error(`Failed to set trend score: ${error.message}`);
    }
  }

  async getTrendScore(queryId: string, window: '90d' = '90d'): Promise<TrendScore | undefined> {
    try {
      const { data, error } = await this.supabase
        .from('trend_scores')
        .select()
        .eq('query_id', queryId)
        .eq('window', window)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() to avoid 406 when no score exists

      if (error || !data) return undefined;
      return this.mapTrendScoreFromDb(data);
    } catch (error) {
      console.error('Unexpected error in getTrendScore:', error);
      return undefined;
    }
  }

  async getAllTrendScores(window: '90d' = '90d'): Promise<TrendScore[]> {
    const userId = await this.getCurrentUserId();
    
    // First get all query IDs for this user
    const { data: userQueries, error: queryError } = await this.supabase
      .from('queries')
      .select('id')
      .eq('user_id', userId);

    if (queryError || !userQueries || userQueries.length === 0) {
      return [];
    }

    const queryIds = (userQueries || []).map((q: any) => q.id);

    // Get scores for queries that belong to this user
    const { data, error } = await this.supabase
      .from('trend_scores')
      .select('*')
      .eq('window', window)
      .in('query_id', queryIds)
      .order('score', { ascending: false });

    if (error) {
      console.error('Error fetching trend scores:', error);
      return [];
    }

    return (data || []).map(this.mapTrendScoreFromDb);
  }

  // Get top ranked queries by TOS score for a specific window
  async getTopRankedQueries(limit: number = 10, window: '90d' = '90d', minScore: number = 0): Promise<TrendScore[]> {
    const userId = await this.getCurrentUserId();
    
    // First get all query IDs for this user
    const { data: userQueries, error: queryError } = await this.supabase
      .from('queries')
      .select('id')
      .eq('user_id', userId);

    if (queryError || !userQueries || userQueries.length === 0) {
      return [];
    }

    const queryIds = (userQueries || []).map((q: any) => q.id);

    // Get top scores for queries that belong to this user
    const { data, error } = await this.supabase
      .from('trend_scores')
      .select('*')
      .eq('window', window)
      .in('query_id', queryIds)
      .gte('score', minScore)
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching top ranked queries:', error);
      return [];
    }

    return (data || []).map(this.mapTrendScoreFromDb);
  }

  // Keyword metrics management (from DataForSEO)
  async upsertAdsKeywordMetrics(metrics: Omit<AdsKeywordMetrics, 'id' | 'fetched_at'>): Promise<void> {
    const { error } = await this.supabase
      .from('ads_keyword_metrics')
      .upsert(
        {
          query_id: metrics.query_id,
          geo: metrics.geo,
          language_code: metrics.language_code,
          network: metrics.network,
          currency_code: metrics.currency_code,
          avg_monthly_searches: metrics.avg_monthly_searches ?? null,
          competition: metrics.competition ?? null,
          competition_index: metrics.competition_index ?? null,
          top_of_page_bid_low_micros: metrics.top_of_page_bid_low_micros ?? null,
          top_of_page_bid_high_micros: metrics.top_of_page_bid_high_micros ?? null,
          // Ad traffic metrics
          ad_impressions: metrics.ad_impressions ?? null,
          clicks: metrics.clicks ?? null,
          ctr: metrics.ctr ?? null,
          avg_cpc_micros: metrics.avg_cpc_micros ?? null,
          raw: metrics.raw ?? null,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'query_id,geo,language_code,network' }
      );

    if (error) {
      console.error('Error upserting ads keyword metrics:', error);
      throw new Error(`Failed to upsert ads keyword metrics: ${error.message}`);
    }
  }

  async getAdsKeywordMetrics(
    queryId: string,
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH'
  ): Promise<AdsKeywordMetrics | undefined> {
    const { data, error } = await this.supabase
      .from('ads_keyword_metrics')
      .select('*')
      .eq('query_id', queryId)
      .eq('geo', geo)
      .eq('language_code', languageCode)
      .eq('network', network)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return undefined;
    return this.mapAdsKeywordMetricsFromDb(data);
  }

  async getAdsKeywordMetricsForQueries(
    queryIds: string[],
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH'
  ): Promise<Map<string, AdsKeywordMetrics>> {
    const result = new Map<string, AdsKeywordMetrics>();
    if (!queryIds || queryIds.length === 0) return result;

    const { data, error } = await this.supabase
      .from('ads_keyword_metrics')
      .select('*')
      .in('query_id', queryIds)
      .eq('geo', geo)
      .eq('language_code', languageCode)
      .eq('network', network)
      .order('fetched_at', { ascending: false });

    if (error || !data) return result;

    // Keep the newest per query_id.
    for (const row of data) {
      if (!row?.query_id) continue;
      if (!result.has(row.query_id)) {
        result.set(row.query_id, this.mapAdsKeywordMetricsFromDb(row));
      }
    }
    return result;
  }

  // Check if ads keyword metrics exist and are recent (within maxAgeDays)
  async hasRecentAdsKeywordMetrics(
    queryId: string,
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH',
    maxAgeDays: number = 7
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('ads_keyword_metrics')
      .select('fetched_at')
      .eq('query_id', queryId)
      .eq('geo', geo)
      .eq('language_code', languageCode)
      .eq('network', network)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.fetched_at) return false;

    const fetchedAt = new Date(data.fetched_at);
    const ageInDays = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageInDays < maxAgeDays;
  }

  // Check if opportunity scores exist and are recent (within maxAgeDays)
  async hasRecentOpportunityScores(
    queryIds: string[],
    geo: string = 'US',
    languageCode: string = 'en',
    network: OpportunityScore['network'] = 'GOOGLE_SEARCH',
    window: '90d' = '90d',
    maxAgeDays: number = 7
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    if (!queryIds || queryIds.length === 0) return result;

    const { data, error } = await this.supabase
      .from('opportunity_scores')
      .select('query_id, calculated_at')
      .in('query_id', queryIds)
      .eq('geo', geo)
      .eq('language_code', languageCode)
      .eq('network', network)
      .eq('window', window)
      .order('calculated_at', { ascending: false });

    if (error || !data) {
      queryIds.forEach(id => result.set(id, false));
      return result;
    }

    // Group by query_id and keep the newest
    const scoresByQuery = new Map<string, Date>();
    for (const row of data) {
      if (!row?.query_id || !row?.calculated_at) continue;
      if (!scoresByQuery.has(row.query_id)) {
        scoresByQuery.set(row.query_id, new Date(row.calculated_at));
      }
    }

    // Check if each query has recent scores
    const now = Date.now();
    queryIds.forEach(queryId => {
      const calculatedAt = scoresByQuery.get(queryId);
      if (!calculatedAt) {
        result.set(queryId, false);
      } else {
        const ageInDays = (now - calculatedAt.getTime()) / (1000 * 60 * 60 * 24);
        result.set(queryId, ageInDays < maxAgeDays);
      }
    });

    return result;
  }

  // Get monthly_searches data from cached ads_keyword_metrics (stored in raw field)
  async getCachedMonthlySearches(
    queryId: string,
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH'
  ): Promise<Array<{ month: string; search_volume: number }> | null> {
    const metrics = await this.getAdsKeywordMetrics(queryId, geo, languageCode, network);
    if (!metrics || !metrics.raw) return null;

    try {
      // Try to extract monthly_searches from raw data
      const raw = metrics.raw as any;
      if (raw.monthly_searches && Array.isArray(raw.monthly_searches)) {
        return raw.monthly_searches.map((m: any) => {
          // Ensure month is always a string in "YYYY-MM" format
          let monthStr: string;
          if (typeof m.month === 'string' && m.month.includes('-')) {
            // Already in "YYYY-MM" format
            monthStr = m.month;
          } else if (m.year && m.month) {
            // Construct from year and month (month might be number or string)
            const monthNum = typeof m.month === 'number' ? m.month : parseInt(String(m.month), 10);
            monthStr = `${m.year}-${String(monthNum).padStart(2, '0')}`;
          } else {
            // Fallback: try to use m.month as-is, but convert to string
            monthStr = String(m.month || '');
          }
          
          return {
            month: monthStr,
            search_volume: typeof m.search_volume === 'number' ? m.search_volume : Number(m.search_volume) || 0,
          };
        });
      }
    } catch (error) {
      console.warn('Error extracting monthly_searches from cached data:', error);
    }

    return null;
  }

  // Opportunity scores management
  async upsertOpportunityScore(score: Omit<OpportunityScore, 'id'>): Promise<void> {
    const { error } = await this.supabase
      .from('opportunity_scores')
      .upsert(
        {
          query_id: score.query_id,
          geo: score.geo,
          language_code: score.language_code,
          network: score.network,
          window: score.window,
          opportunity_score: score.opportunity_score,
          efficiency_score: score.efficiency_score,
          demand_score: score.demand_score,
          momentum_score: score.momentum_score,
          cpc_score: score.cpc_score,
          slope: score.slope,
          acceleration: score.acceleration,
          consistency: score.consistency,
          calculated_at: score.calculated_at.toISOString(),
        },
        { onConflict: 'query_id,geo,language_code,network,window' }
      );

    if (error) {
      console.error('Error upserting opportunity score:', error);
      throw new Error(`Failed to upsert opportunity score: ${error.message}`);
    }
  }

  async getTopOpportunityScores(
    limit: number = 50,
    window: '90d' = '90d',
    geo: string = 'US',
    languageCode: string = 'en',
    network: OpportunityScore['network'] = 'GOOGLE_SEARCH'
  ): Promise<OpportunityScore[]> {
    const userId = await this.getCurrentUserId();

    // First get all query IDs for this user
    const { data: userQueries, error: queryError } = await this.supabase
      .from('queries')
      .select('id')
      .eq('user_id', userId);

    if (queryError || !userQueries || userQueries.length === 0) {
      return [];
    }

    const queryIds = (userQueries || []).map((q: any) => q.id);

    const { data, error } = await this.supabase
      .from('opportunity_scores')
      .select('*')
      .in('query_id', queryIds)
      .eq('geo', geo)
      .eq('language_code', languageCode)
      .eq('network', network)
      .eq('window', window)
      .order('opportunity_score', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return (data || []).map(this.mapOpportunityScoreFromDb);
  }

  // Opportunity cluster management
  async addCluster(cluster: Omit<OpportunityCluster, 'id'>): Promise<OpportunityCluster> {
    const userId = await this.getCurrentUserId();
    
    const { data: clusterData, error: clusterError } = await this.supabase
      .from('opportunity_clusters')
      .insert({
        name: cluster.name,
        intent_type: cluster.intent_type,
        average_score: cluster.average_score,
        user_id: userId,
      })
      .select()
      .single();

    if (clusterError) {
      throw new Error(`Failed to add cluster: ${clusterError.message}`);
    }

    // Add cluster-query relationships
    // First verify all query IDs exist and belong to the user to avoid foreign key errors
    if (cluster.queries.length > 0) {
      const userId = await this.getCurrentUserId();
      
      // Verify all queries exist and belong to the user
      const { data: existingQueries, error: queryCheckError } = await this.supabase
        .from('queries')
        .select('id')
        .in('id', cluster.queries)
        .eq('user_id', userId);

      if (queryCheckError) {
        console.error('Error verifying queries for cluster:', queryCheckError);
        throw new Error(`Failed to verify queries: ${queryCheckError.message}`);
      }

      // Filter to only include queries that exist and belong to the user
      const validQueryIds = new Set((existingQueries || []).map((q: { id: string }) => q.id));
      const validQueries = cluster.queries.filter(id => validQueryIds.has(id));

      if (validQueries.length !== cluster.queries.length) {
        const missingQueries = cluster.queries.filter(id => !validQueryIds.has(id));
        console.warn(`Warning: ${missingQueries.length} query IDs do not exist or belong to another user:`, missingQueries);
      }

      if (validQueries.length > 0) {
        const { error: relationError } = await this.supabase
          .from('cluster_queries')
          .insert(
            validQueries.map(queryId => ({
              cluster_id: clusterData.id,
              query_id: queryId,
            }))
          );

        if (relationError) {
          console.error('Error adding cluster-query relations:', relationError);
          throw new Error(`Failed to add cluster-query relations: ${relationError.message}`);
        }
      }
    }

    return {
      id: clusterData.id,
      name: clusterData.name,
      intent_type: clusterData.intent_type,
      average_score: clusterData.average_score,
      queries: cluster.queries,
    };
  }

  async getCluster(id: string): Promise<OpportunityCluster | undefined> {
    const userId = await this.getCurrentUserId();
    
    // Explicitly filter by user_id for RLS consistency and security
    const { data: clusterData, error: clusterError } = await this.supabase
      .from('opportunity_clusters')
      .select()
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (clusterError) {
      console.error('Error fetching cluster:', clusterError);
      // Log the error details for debugging
      if (clusterError.code === 'PGRST116') {
        console.error(`Cluster with id "${id}" not found for user ${userId}`);
      }
      return undefined;
    }

    if (!clusterData) {
      console.error(`Cluster with id "${id}" not found in database`);
      return undefined;
    }

    const { data: queryData, error: queryError } = await this.supabase
      .from('cluster_queries')
      .select('query_id')
      .eq('cluster_id', id);

    if (queryError) {
      console.error('Error fetching cluster queries:', queryError);
    }

    // Parse JSONB fields if they exist
    let relatedTopics: RelatedTopic[] | undefined;
    if (clusterData.related_topics) {
      if (Array.isArray(clusterData.related_topics)) {
        relatedTopics = clusterData.related_topics.map((t: any) => ({
          id: t.id,
          query_id: t.query_id || '',
          topic: t.topic,
          value: typeof t.value === 'number' ? t.value : parseFloat(t.value) || 0,
          is_rising: t.is_rising || t.isRising || false,
          link: t.link,
          created_at: t.created_at ? new Date(t.created_at) : undefined,
        }));
      }
    }

    let paaQuestions: PeopleAlsoAsk[] | undefined;
    if (clusterData.paa_questions) {
      if (Array.isArray(clusterData.paa_questions)) {
        paaQuestions = clusterData.paa_questions.map((p: any) => ({
          id: p.id,
          query_id: p.query_id || '',
          question: p.question,
          answer: p.answer,
          snippet: p.snippet,
          title: p.title,
          link: p.link,
          created_at: p.created_at ? new Date(p.created_at) : undefined,
        }));
      }
    }

    return {
      id: clusterData.id,
      name: clusterData.name,
      intent_type: clusterData.intent_type,
      average_score: clusterData.average_score,
      queries: (queryData || []).map((q: any) => q.query_id),
      related_topics: relatedTopics,
      paa_questions: paaQuestions,
    };
  }

  /**
   * Check if a cluster with the same set of queries already exists
   * Returns the existing cluster ID if found, undefined otherwise
   */
  async findExistingClusterWithQueries(queryIds: string[]): Promise<string | undefined> {
    if (queryIds.length === 0) return undefined;
    
    const userId = await this.getCurrentUserId();
    
    // Get all clusters for this user
    const { data: clusters, error } = await this.supabase
      .from('opportunity_clusters')
      .select('id')
      .eq('user_id', userId);

    if (error || !clusters || clusters.length === 0) {
      return undefined;
    }

    const clusterIds = (clusters || []).map((c: any) => c.id);

    // Get all query relations for these clusters
    const { data: relations } = await this.supabase
      .from('cluster_queries')
      .select('cluster_id, query_id')
      .in('cluster_id', clusterIds);

    if (!relations) return undefined;

    // Group queries by cluster_id
    const clusterQueryMap = new Map<string, Set<string>>();
    relations.forEach((rel: any) => {
      if (!clusterQueryMap.has(rel.cluster_id)) {
        clusterQueryMap.set(rel.cluster_id, new Set());
      }
      clusterQueryMap.get(rel.cluster_id)!.add(rel.query_id);
    });

    // Check each cluster to see if it has the exact same query set
    const queryIdsSet = new Set(queryIds);
    for (const [clusterId, clusterQueryIds] of clusterQueryMap.entries()) {
      // Compare sets: same size and all elements match
      if (
        clusterQueryIds.size === queryIdsSet.size &&
        clusterQueryIds.size > 0 && // Ensure not empty
        [...clusterQueryIds].every(id => queryIdsSet.has(id)) &&
        [...queryIdsSet].every(id => clusterQueryIds.has(id)) // Bidirectional check for completeness
      ) {
        return clusterId;
      }
    }

    return undefined;
  }

  async getAllClusters(): Promise<OpportunityCluster[]> {
    const userId = await this.getCurrentUserId();
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:603',message:'getAllClusters entry',data:{userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    const { data: clusters, error } = await this.supabase
      .from('opportunity_clusters')
      .select('*')
      .eq('user_id', userId)
      .order('average_score', { ascending: false});

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:610',message:'getAllClusters DB result',data:{clusterCount:clusters?.length||0,error:error?.message,clusterIds:clusters?.map((c:any)=>c.id)||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error('Error fetching clusters:', error);
      return [];
    }

    if (!clusters || clusters.length === 0) return [];

    // Fetch query IDs for each cluster
    const clusterIds = (clusters || []).map((c: any) => c.id);
    const { data: relations } = await this.supabase
      .from('cluster_queries')
      .select('cluster_id, query_id')
      .in('cluster_id', clusterIds);

    const queryMap = new Map<string, string[]>();
    (relations || []).forEach((rel: any) => {
      if (!queryMap.has(rel.cluster_id)) {
        queryMap.set(rel.cluster_id, []);
      }
      queryMap.get(rel.cluster_id)!.push(rel.query_id);
    });

    const mappedClusters = (clusters || []).map((cluster: any) => {
      // Parse JSONB fields if they exist
      let relatedTopics: RelatedTopic[] | undefined;
      if (cluster.related_topics && Array.isArray(cluster.related_topics)) {
        relatedTopics = cluster.related_topics.map((t: any) => ({
          id: t.id,
          query_id: t.query_id || '',
          topic: t.topic,
          value: typeof t.value === 'number' ? t.value : parseFloat(t.value) || 0,
          is_rising: t.is_rising || t.isRising || false,
          link: t.link,
          created_at: t.created_at ? new Date(t.created_at) : undefined,
        }));
      }

      let paaQuestions: PeopleAlsoAsk[] | undefined;
      if (cluster.paa_questions && Array.isArray(cluster.paa_questions)) {
        paaQuestions = cluster.paa_questions.map((p: any) => ({
          id: p.id,
          query_id: p.query_id || '',
          question: p.question,
          answer: p.answer,
          snippet: p.snippet,
          title: p.title,
          link: p.link,
          created_at: p.created_at ? new Date(p.created_at) : undefined,
        }));
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:663',message:'Mapping cluster with intent data',data:{clusterId:cluster.id,hasRelatedTopics:!!relatedTopics,relatedTopicsCount:relatedTopics?.length||0,hasPaaQuestions:!!paaQuestions,paaQuestionsCount:paaQuestions?.length||0,rawRelatedTopics:typeof cluster.related_topics,rawPaaQuestions:typeof cluster.paa_questions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H7'})}).catch(()=>{});
      // #endregion

      return {
        id: cluster.id,
        name: cluster.name,
        intent_type: cluster.intent_type,
        average_score: cluster.average_score,
        queries: queryMap.get(cluster.id) || [],
        related_topics: relatedTopics,
        paa_questions: paaQuestions,
      };
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:673',message:'getAllClusters returning',data:{totalClusters:mappedClusters.length,clusterIds:mappedClusters.map((c:OpportunityCluster)=>c.id),duplicateIds:mappedClusters.map((c:OpportunityCluster)=>c.id).filter((id:string,i:number,arr:string[])=>arr.indexOf(id)!==i)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    return mappedClusters;
  }

  async updateCluster(id: string, updates: Partial<OpportunityCluster>): Promise<boolean> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.intent_type !== undefined) updateData.intent_type = updates.intent_type;
    if (updates.average_score !== undefined) updateData.average_score = updates.average_score;

    const { error: clusterError } = await this.supabase
      .from('opportunity_clusters')
      .update(updateData)
      .eq('id', id);

    if (clusterError) {
      console.error('Error updating cluster:', clusterError);
      return false;
    }

    // Update query relationships if provided
    if (updates.queries !== undefined) {
      // Delete existing relations
      await this.supabase
        .from('cluster_queries')
        .delete()
        .eq('cluster_id', id);

      // Insert new relations
      if (updates.queries.length > 0) {
        const { error: relationError } = await this.supabase
          .from('cluster_queries')
          .insert(
            updates.queries.map(queryId => ({
              cluster_id: id,
              query_id: queryId,
            }))
          );

        if (relationError) {
          console.error('Error updating cluster-query relations:', relationError);
        }
      }
    }

    return true;
  }

  async removeCluster(id: string): Promise<boolean> {
    // Cascade delete will handle cluster_queries
    const { error } = await this.supabase
      .from('opportunity_clusters')
      .delete()
      .eq('id', id);

    return !error;
  }

  // Intent classification management
  async setIntentClassification(classification: IntentClassification): Promise<void> {
    const { error } = await this.supabase
      .from('intent_classifications')
      .upsert({
        query_id: classification.query_id,
        intent_type: classification.intent_type,
        confidence: classification.confidence,
        subcategory: classification.subcategory || null,
      }, {
        onConflict: 'query_id',
      });

    if (error) {
      console.error('Error setting intent classification:', error);
      throw new Error(`Failed to set intent classification: ${error.message}`);
    }
  }

  async getIntentClassification(queryId: string): Promise<IntentClassification | undefined> {
    try {
      const { data, error } = await this.supabase
        .from('intent_classifications')
        .select()
        .eq('query_id', queryId)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 when no row exists

      if (error) {
        // Log the error but don't throw - return undefined for missing classifications
        if (error.code !== 'PGRST116') { // PGRST116 is "no rows returned", which is expected
          console.error('Error fetching intent classification:', error);
        }
        return undefined;
      }

      if (!data) return undefined;

      return {
        query_id: data.query_id,
        intent_type: data.intent_type,
        confidence: data.confidence,
        subcategory: data.subcategory || undefined,
      };
    } catch (error) {
      console.error('Unexpected error in getIntentClassification:', error);
      return undefined;
    }
  }

  async getAllIntentClassifications(): Promise<IntentClassification[]> {
    const { data, error } = await this.supabase
      .from('intent_classifications')
      .select();

    if (error) {
      console.error('Error fetching intent classifications:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      query_id: item.query_id,
      intent_type: item.intent_type,
      confidence: item.confidence,
      subcategory: item.subcategory || undefined,
    }));
  }

  // Entrepreneur profile management
  async getEntrepreneurProfile(): Promise<EntrepreneurProfile | null> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('entrepreneur_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found
        return null;
      }
      console.error('Error fetching entrepreneur profile:', error);
      return null;
    }

    return this.mapEntrepreneurProfileFromDb(data);
  }

  async saveEntrepreneurProfile(profile: Omit<EntrepreneurProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<EntrepreneurProfile> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('entrepreneur_profiles')
      .upsert({
        user_id: userId,
        demographic: profile.demographic || null,
        tech_savviness: profile.tech_savviness || null,
        business_stage: profile.business_stage || null,
        industry: profile.industry || null,
        geographic_region: profile.geographic_region || null,
        preferences: profile.preferences || null,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving entrepreneur profile:', error);
      throw new Error(`Failed to save profile: ${error.message}`);
    }

    return this.mapEntrepreneurProfileFromDb(data);
  }

  // Utility methods
  async getQueriesByIntent(intent: 'pain' | 'tool' | 'transition' | 'education'): Promise<Query[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('intent_classifications')
      .select('query_id, queries!inner(*)')
      .eq('intent_type', intent)
      .eq('queries.user_id', userId);

    if (error) {
      console.error('Error fetching queries by intent:', error);
      return [];
    }

    return (data || [])
      .map((item: any) => item.queries)
      .filter((q: any) => q !== null)
      .map(this.mapQueryFromDb);
  }

  // Helper methods to map database rows to application types
  private mapQueryFromDb(row: any): Query {
    return {
      id: row.id,
      text: row.text,
      template: row.template || undefined,
      stage: row.stage || undefined,
      function: row.function || undefined,
      pain: row.pain || undefined,
      asset: row.asset || undefined,
      created_at: new Date(row.created_at),
    };
  }

  private mapSnapshotFromDb(row: any): TrendSnapshot {
    return {
      query_id: row.query_id,
      date: new Date(row.date),
      interest_value: parseFloat(row.interest_value),
      region: row.region || undefined,
      window: row.window,
    };
  }

  private mapTrendScoreFromDb(row: any): TrendScore {
    return {
      query_id: row.query_id,
      score: parseFloat(row.score),
      slope: parseFloat(row.slope),
      acceleration: parseFloat(row.acceleration),
      consistency: parseFloat(row.consistency),
      breadth: parseFloat(row.breadth),
      calculated_at: new Date(row.calculated_at),
      window: row.window || '90d',
    };
  }

  private mapAdsKeywordMetricsFromDb(row: any): AdsKeywordMetrics {
    return {
      id: row.id,
      query_id: row.query_id,
      geo: row.geo,
      language_code: row.language_code,
      network: row.network,
      currency_code: row.currency_code,
      avg_monthly_searches:
        row.avg_monthly_searches !== null && row.avg_monthly_searches !== undefined
          ? Number(row.avg_monthly_searches)
          : undefined,
      competition: row.competition || undefined,
      competition_index:
        row.competition_index !== null && row.competition_index !== undefined
          ? Number(row.competition_index)
          : undefined,
      top_of_page_bid_low_micros:
        row.top_of_page_bid_low_micros !== null && row.top_of_page_bid_low_micros !== undefined
          ? Number(row.top_of_page_bid_low_micros)
          : undefined,
      top_of_page_bid_high_micros:
        row.top_of_page_bid_high_micros !== null && row.top_of_page_bid_high_micros !== undefined
          ? Number(row.top_of_page_bid_high_micros)
          : undefined,
      // Ad traffic metrics
      ad_impressions:
        row.ad_impressions !== null && row.ad_impressions !== undefined
          ? Number(row.ad_impressions)
          : undefined,
      clicks:
        row.clicks !== null && row.clicks !== undefined
          ? Number(row.clicks)
          : undefined,
      ctr:
        row.ctr !== null && row.ctr !== undefined
          ? Number(row.ctr)
          : undefined,
      avg_cpc_micros:
        row.avg_cpc_micros !== null && row.avg_cpc_micros !== undefined
          ? Number(row.avg_cpc_micros)
          : undefined,
      raw: row.raw || undefined,
      fetched_at: row.fetched_at ? new Date(row.fetched_at) : undefined,
    };
  }

  private mapOpportunityScoreFromDb(row: any): OpportunityScore {
    return {
      id: row.id,
      query_id: row.query_id,
      geo: row.geo,
      language_code: row.language_code,
      network: row.network,
      window: row.window || '90d',
      opportunity_score: parseFloat(row.opportunity_score),
      efficiency_score: parseFloat(row.efficiency_score),
      demand_score: parseFloat(row.demand_score),
      momentum_score: parseFloat(row.momentum_score),
      cpc_score: parseFloat(row.cpc_score),
      slope: parseFloat(row.slope),
      acceleration: parseFloat(row.acceleration),
      consistency: parseFloat(row.consistency),
      calculated_at: new Date(row.calculated_at),
    };
  }

  private mapEntrepreneurProfileFromDb(row: any): EntrepreneurProfile {
    return {
      id: row.id,
      user_id: row.user_id,
      demographic: row.demographic || undefined,
      tech_savviness: row.tech_savviness || undefined,
      business_stage: row.business_stage || undefined,
      industry: row.industry || undefined,
      geographic_region: row.geographic_region || undefined,
      preferences: row.preferences || undefined,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  // Related Topics management
  async saveRelatedTopics(queryId: string, topics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[]): Promise<void> {
    if (topics.length === 0) return;

    // Filter out invalid topics (must have a valid topic string)
    const validTopics = topics.filter(topic => {
      return topic && 
             typeof topic.topic === 'string' && 
             topic.topic.trim().length > 0;
    });

    if (validTopics.length === 0) {
      console.warn('No valid topics to save after filtering');
      return;
    }

    // Deduplicate topics by topic name (case-insensitive) - keep the one with highest value or is_rising=true
    const topicMap = new Map<string, Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>>();
    for (const topic of validTopics) {
      // Type assertion is safe here because we filtered above
      const topicStr = String(topic.topic).trim();
      if (!topicStr) continue; // Skip empty strings after trimming
      
      const key = topicStr.toLowerCase();
      const existing = topicMap.get(key);
      if (!existing) {
        topicMap.set(key, topic);
      } else {
        // Keep the one with higher value, or prefer rising topics
        if (topic.is_rising || (!existing.is_rising && topic.value > existing.value)) {
          topicMap.set(key, topic);
        }
      }
    }

    const uniqueTopics = Array.from(topicMap.values());

    const { error } = await this.supabase
      .from('related_topics')
      .upsert(
        uniqueTopics.map(topic => ({
          query_id: queryId,
          topic: String(topic.topic).trim(),
          value: typeof topic.value === 'number' ? topic.value : parseFloat(String(topic.value)) || 0,
          is_rising: topic.is_rising || false,
          link: topic.link || null,
        })),
        {
          onConflict: 'query_id,topic',
        }
      );

    if (error) {
      console.error('Error saving related topics:', error);
      throw new Error(`Failed to save related topics: ${error.message}`);
    }
  }

  async getRelatedTopics(queryId: string): Promise<RelatedTopic[]> {
    try {
      // Get current user ID for debugging
      const userId = await this.getCurrentUserId().catch(() => null);
      console.log(`[Storage] getRelatedTopics for query ${queryId}, user: ${userId}`);
      
      // First, verify we can see the query itself
      const { data: queryData, error: queryError } = await this.supabase
        .from('queries')
        .select('id, text, user_id')
        .eq('id', queryId)
        .single();
      
      console.log(`[Storage] Query check for ${queryId}:`, queryData ? `Found query "${queryData.text}" with user_id ${queryData.user_id}` : 'NOT FOUND', queryError ? `Error: ${queryError.message}` : '');
      
      // Query related_topics - RLS should filter based on the query's user_id
      // The RLS policy checks: EXISTS (SELECT 1 FROM queries WHERE queries.id = related_topics.query_id AND queries.user_id = auth.uid())
      const { data, error } = await this.supabase
        .from('related_topics')
        .select('*')
        .eq('query_id', queryId)
        .order('value', { ascending: false });

      if (error) {
        console.error(`[Storage] Error fetching related topics for ${queryId}:`, error);
        console.error(`[Storage] Error details:`, JSON.stringify(error, null, 2));
        return [];
      }

      console.log(`[Storage] getRelatedTopics returned ${data?.length || 0} topics for query ${queryId}`);
      
      // If Supabase client returned empty results but we have directConfig, try direct query
      if ((!data || data.length === 0) && this.directConfig) {
        console.log(`[Storage] Supabase client returned 0 topics, trying direct PostgREST query...`);
        const directData = await this.directPostgRESTQuery<any>('related_topics', {
          'query_id': `eq.${queryId}`,
          'order': 'value.desc',
          'select': '*',
        });
        
        if (directData && directData.length > 0) {
          console.log(`[Storage Direct] Success! Got ${directData.length} topics via direct query`);
          return directData.map((row: any) => ({
            id: row.id,
            query_id: row.query_id,
            topic: row.topic,
            value: parseFloat(row.value),
            is_rising: row.is_rising,
            link: row.link || undefined,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
          }));
        }
        
        console.log(`[Storage Direct] Direct query also returned 0 topics`);
      }
      
      if (data && data.length > 0) {
        console.log(`[Storage] Sample topic:`, { id: data[0].id, topic: data[0].topic, query_id: data[0].query_id });
      } else {
        // Log detailed info when no data is returned
        console.log(`[Storage] No topics returned - RLS may be blocking. Query user_id: ${queryData?.user_id}, Current user: ${userId}`);
      }
      
      return (data || []).map((row: any) => ({
        id: row.id,
        query_id: row.query_id,
        topic: row.topic,
        value: parseFloat(row.value),
        is_rising: row.is_rising,
        link: row.link || undefined,
        created_at: row.created_at ? new Date(row.created_at) : undefined,
      }));
    } catch (err) {
      console.error(`[Storage] Exception in getRelatedTopics for ${queryId}:`, err);
      return [];
    }
  }

  // Related Questions management (formerly People Also Ask)
  // Using DataForSEO SERP API for related questions
  async saveRelatedQuestions(queryId: string, questions: Omit<RelatedQuestion, 'id' | 'query_id' | 'created_at'>[]): Promise<void> {
    if (questions.length === 0) return;

    // Filter out invalid items (must have a valid question string)
    const validQuestions = questions.filter(item => {
      return item && 
             typeof item.question === 'string' && 
             item.question.trim().length > 0;
    });

    if (validQuestions.length === 0) {
      console.warn('No valid Related Questions to save after filtering');
      return;
    }

    // Deduplicate questions by question text (case-insensitive)
    const questionMap = new Map<string, Omit<RelatedQuestion, 'id' | 'query_id' | 'created_at'>>();
    for (const item of validQuestions) {
      const questionStr = String(item.question).trim();
      if (!questionStr) continue;
      
      const key = questionStr.toLowerCase();
      if (!questionMap.has(key)) {
        questionMap.set(key, item);
      }
    }

    const uniqueQuestions = Array.from(questionMap.values());

    const { error } = await this.supabase
      .from('related_questions')
      .upsert(
        uniqueQuestions.map(item => ({
          query_id: queryId,
          question: String(item.question).trim(),
          answer: item.answer || null,
          snippet: item.snippet || null,
          title: item.title || null,
          link: item.link || null,
          source_logo: item.source_logo || null,
        })),
        {
          onConflict: 'query_id,question',
        }
      );

    if (error) {
      console.error('Error saving Related Questions:', error);
      throw new Error(`Failed to save Related Questions: ${error.message}`);
    }
  }

  async getRelatedQuestions(queryId: string): Promise<RelatedQuestion[]> {
    try {
      // Get current user ID for debugging
      const userId = await this.getCurrentUserId().catch(() => null);
      console.log(`[Storage] getRelatedQuestions for query ${queryId}, user: ${userId}`);
      
      // First, verify we can see the query itself
      const { data: queryData, error: queryError } = await this.supabase
        .from('queries')
        .select('id, text, user_id')
        .eq('id', queryId)
        .single();
      
      console.log(`[Storage] Query check for ${queryId}:`, queryData ? `Found query "${queryData.text}" with user_id ${queryData.user_id}` : 'NOT FOUND', queryError ? `Error: ${queryError.message}` : '');
      
      // Query related_questions - RLS should filter based on the query's user_id
      // The RLS policy checks: EXISTS (SELECT 1 FROM queries WHERE queries.id = related_questions.query_id AND queries.user_id = auth.uid())
      const { data, error } = await this.supabase
        .from('related_questions')
        .select('*')
        .eq('query_id', queryId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`[Storage] Error fetching related questions for ${queryId}:`, error);
        console.error(`[Storage] Error details:`, JSON.stringify(error, null, 2));
        return [];
      }

      console.log(`[Storage] getRelatedQuestions returned ${data?.length || 0} questions for query ${queryId}`);
      
      // If Supabase client returned empty results but we have directConfig, try direct query
      if ((!data || data.length === 0) && this.directConfig) {
        console.log(`[Storage] Supabase client returned 0 questions, trying direct PostgREST query...`);
        const directData = await this.directPostgRESTQuery<any>('related_questions', {
          'query_id': `eq.${queryId}`,
          'order': 'created_at.desc',
          'select': '*',
        });
        
        if (directData && directData.length > 0) {
          console.log(`[Storage Direct] Success! Got ${directData.length} questions via direct query`);
          return directData.map((row: any) => ({
            id: row.id,
            query_id: row.query_id,
            question: row.question,
            answer: row.answer || undefined,
            snippet: row.snippet || undefined,
            title: row.title || undefined,
            link: row.link || undefined,
            source_logo: row.source_logo || undefined,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
          }));
        }
        
        console.log(`[Storage Direct] Direct query also returned 0 questions`);
      }
      
      if (data && data.length > 0) {
        console.log(`[Storage] Sample question:`, { id: data[0].id, question: data[0].question, query_id: data[0].query_id });
      } else {
        // Log detailed info when no data is returned
        console.log(`[Storage] No questions returned - RLS may be blocking. Query user_id: ${queryData?.user_id}, Current user: ${userId}`);
      }
      
      return (data || []).map((row: any) => ({
        id: row.id,
        query_id: row.query_id,
        question: row.question,
        answer: row.answer || undefined,
        snippet: row.snippet || undefined,
        title: row.title || undefined,
        link: row.link || undefined,
        source_logo: row.source_logo || undefined,
        created_at: row.created_at ? new Date(row.created_at) : undefined,
      }));
    } catch (err) {
      console.error(`[Storage] Exception in getRelatedQuestions for ${queryId}:`, err);
      return [];
    }
  }

  // Backward compatibility aliases (deprecated)
  async savePeopleAlsoAsk(queryId: string, paa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[]): Promise<void> {
    return this.saveRelatedQuestions(queryId, paa);
  }

  async getPeopleAlsoAsk(queryId: string): Promise<PeopleAlsoAsk[]> {
    return this.getRelatedQuestions(queryId);
  }

  // Update cluster with related topics and PAA questions
  async updateClusterIntentData(
    clusterId: string,
    relatedTopics?: RelatedTopic[],
    paaQuestions?: PeopleAlsoAsk[]
  ): Promise<void> {
    const updateData: any = {};
    
    if (relatedTopics) {
      updateData.related_topics = relatedTopics.map(t => ({
        topic: t.topic,
        value: t.value,
        is_rising: t.is_rising,
        link: t.link,
      }));
    }
    
    if (paaQuestions) {
      updateData.paa_questions = paaQuestions.map(p => ({
        question: p.question,
        answer: p.answer,
        snippet: p.snippet,
        title: p.title,
        link: p.link,
      }));
    }

    if (Object.keys(updateData).length === 0) return;

    const { error } = await this.supabase
      .from('opportunity_clusters')
      .update(updateData)
      .eq('id', clusterId);

    if (error) {
      console.error('Error updating cluster intent data:', error);
      throw new Error(`Failed to update cluster intent data: ${error.message}`);
    }
  }

  // Aggregate and update cluster intent data from all queries in the cluster
  async aggregateClusterIntentData(clusterId: string): Promise<void> {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:1117',message:'aggregateClusterIntentData entry',data:{clusterId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    
    try {
      // Get cluster to find its queries
      const cluster = await this.getCluster(clusterId);
      if (!cluster || cluster.queries.length === 0) {
        console.log(`[Aggregate Intent] Cluster ${clusterId} has no queries, skipping`);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:1122',message:'aggregateClusterIntentData skipped',data:{clusterId,reason:'no queries'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        return;
      }

      console.log(`[Aggregate Intent] Aggregating intent data for cluster ${clusterId} with ${cluster.queries.length} queries`);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:1126',message:'aggregateClusterIntentData processing',data:{clusterId,queryCount:cluster.queries.length,queryIds:cluster.queries},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion

      // Aggregate related topics from all queries in the cluster
      const allRelatedTopics = new Map<string, RelatedTopic>();
      for (const queryId of cluster.queries) {
        const topics = await this.getRelatedTopics(queryId);
        console.log(`[Aggregate Intent] Found ${topics.length} related topics for query ${queryId}`);
        for (const topic of topics) {
          // Ensure topic.topic is a valid string
          if (!topic || !topic.topic || typeof topic.topic !== 'string') continue;
          const key = topic.topic.toLowerCase();
          if (!allRelatedTopics.has(key) || topic.is_rising) {
            // Prefer rising topics, or keep the one with higher value
            const existing = allRelatedTopics.get(key);
            if (!existing || topic.value > existing.value || topic.is_rising) {
              allRelatedTopics.set(key, topic);
            }
          }
        }
      }

      // Aggregate PAA questions from all queries in the cluster
      const allPaaQuestions = new Map<string, PeopleAlsoAsk>();
      for (const queryId of cluster.queries) {
        const paa = await this.getPeopleAlsoAsk(queryId);
        console.log(`[Aggregate Intent] Found ${paa.length} PAA questions for query ${queryId}`);
        for (const question of paa) {
          // Ensure question.question is a valid string
          if (!question || !question.question || typeof question.question !== 'string') continue;
          const key = question.question.toLowerCase();
          if (!allPaaQuestions.has(key)) {
            allPaaQuestions.set(key, question);
          }
        }
      }

      // Update cluster with aggregated data
      const relatedTopicsArray = Array.from(allRelatedTopics.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 20); // Limit to top 20 topics
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8ce0da79-350c-434f-b6da-582df7cea48e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage-db.ts:1188',message:'aggregateClusterIntentData before update',data:{clusterId,relatedTopicsCount:relatedTopicsArray.length,paaQuestionsCount:Array.from(allPaaQuestions.values()).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion

      const paaQuestionsArray = Array.from(allPaaQuestions.values())
        .slice(0, 10); // Limit to top 10 questions

      console.log(`[Aggregate Intent] Updating cluster ${clusterId} with ${relatedTopicsArray.length} topics and ${paaQuestionsArray.length} PAA questions`);

      await this.updateClusterIntentData(clusterId, relatedTopicsArray, paaQuestionsArray);
      
      console.log(`[Aggregate Intent] Successfully updated cluster ${clusterId}`);
    } catch (error) {
      console.error(`[Aggregate Intent] Error aggregating cluster intent data for ${clusterId}:`, error);
      // Don't throw - this is a background operation
    }
  }
}

// Singleton instance
export const dbStorage = new DatabaseStorage();

// Export database storage as the default storage
// This replaces the in-memory storage with database-backed storage
export const storage = dbStorage;

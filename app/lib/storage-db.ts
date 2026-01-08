// Supabase-based data storage for the trends analyzer
// Supports both client-side and server-side usage
// TODO: Regenerate Database types from Supabase to fix TypeScript errors

import { supabase as clientSupabase } from './supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Query, TrendSnapshot, TrendScore, OpportunityCluster, IntentClassification, EntrepreneurProfile } from './storage';

// Type assertion helper to work around Database type issues until types are regenerated
const defaultTypedSupabase = clientSupabase as any;

export class DatabaseStorage {
  private supabase: any;

  constructor(supabaseClient?: SupabaseClient<any>) {
    // If a Supabase client is provided (for server-side), use it
    // Otherwise use the default client-side one
    this.supabase = supabaseClient ? (supabaseClient as any) : defaultTypedSupabase;
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
    // SerpAPI may return strings like "<1" which we need to handle
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
    const minExpectedPoints = 75; // 90d window - adjust based on SerpAPI granularity
    
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
    const minExpectedPoints = 75; // 90d window - adjust based on SerpAPI granularity
    
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

    return {
      id: clusterData.id,
      name: clusterData.name,
      intent_type: clusterData.intent_type,
      average_score: clusterData.average_score,
      queries: (queryData || []).map((q: any) => q.query_id),
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
    
    const { data: clusters, error } = await this.supabase
      .from('opportunity_clusters')
      .select('*')
      .eq('user_id', userId)
      .order('average_score', { ascending: false});

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

    return (clusters || []).map((cluster: any) => ({
      id: cluster.id,
      name: cluster.name,
      intent_type: cluster.intent_type,
      average_score: cluster.average_score,
      queries: queryMap.get(cluster.id) || [],
    }));
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
}

// Singleton instance
export const dbStorage = new DatabaseStorage();

// Export database storage as the default storage
// This replaces the in-memory storage with database-backed storage
export const storage = dbStorage;

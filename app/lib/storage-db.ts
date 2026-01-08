// Supabase-based data storage for the trends analyzer

import { supabase } from './supabase';
import type { Query, TrendSnapshot, TrendScore, OpportunityCluster, IntentClassification } from './storage';

class DatabaseStorage {
  // Get current user ID (must be called from authenticated context)
  private async getCurrentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User must be authenticated');
    }
    return user.id;
  }

  // Query management
  async addQuery(query: Omit<Query, 'id' | 'created_at'>): Promise<Query> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await supabase
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
      // If duplicate, try to get existing query
      if (error.code === '23505') { // Unique violation
        const { data: existing } = await supabase
          .from('queries')
          .select()
          .eq('text', query.text)
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
    const { data, error } = await supabase
      .from('queries')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) return undefined;
    return this.mapQueryFromDb(data);
  }

  async getAllQueries(): Promise<Query[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await supabase
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
    const { error } = await supabase
      .from('queries')
      .delete()
      .eq('id', id);

    return !error;
  }

  // Trend snapshot management
  async addTrendSnapshot(snapshot: TrendSnapshot): Promise<void> {
    const { error } = await supabase
      .from('trend_snapshots')
      .upsert({
        query_id: snapshot.query_id,
        date: snapshot.date.toISOString(),
        interest_value: snapshot.interest_value,
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

  async getTrendSnapshots(queryId: string, window?: '30d' | '90d' | '12m'): Promise<TrendSnapshot[]> {
    let query = supabase
      .from('trend_snapshots')
      .select()
      .eq('query_id', queryId);

    if (window) {
      query = query.eq('window', window);
    }

    const { data, error } = await query.order('date', { ascending: true });

    if (error) {
      console.error('Error fetching trend snapshots:', error);
      return [];
    }

    return (data || []).map(this.mapSnapshotFromDb);
  }

  async getLatestSnapshot(queryId: string, window: '30d' | '90d' | '12m'): Promise<TrendSnapshot | undefined> {
    const { data, error } = await supabase
      .from('trend_snapshots')
      .select()
      .eq('query_id', queryId)
      .eq('window', window)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return undefined;
    return this.mapSnapshotFromDb(data);
  }

  // Trend score management
  async setTrendScore(score: TrendScore): Promise<void> {
    const { error } = await supabase
      .from('trend_scores')
      .upsert({
        query_id: score.query_id,
        score: score.score,
        slope: score.slope,
        acceleration: score.acceleration,
        consistency: score.consistency,
        breadth: score.breadth,
        calculated_at: score.calculated_at.toISOString(),
      }, {
        onConflict: 'query_id',
      });

    if (error) {
      console.error('Error setting trend score:', error);
      throw new Error(`Failed to set trend score: ${error.message}`);
    }
  }

  async getTrendScore(queryId: string): Promise<TrendScore | undefined> {
    const { data, error } = await supabase
      .from('trend_scores')
      .select()
      .eq('query_id', queryId)
      .single();

    if (error || !data) return undefined;
    return this.mapTrendScoreFromDb(data);
  }

  async getAllTrendScores(): Promise<TrendScore[]> {
    const { data, error } = await supabase
      .from('trend_scores')
      .select()
      .order('score', { ascending: false });

    if (error) {
      console.error('Error fetching trend scores:', error);
      return [];
    }

    return (data || []).map(this.mapTrendScoreFromDb);
  }

  // Opportunity cluster management
  async addCluster(cluster: Omit<OpportunityCluster, 'id'>): Promise<OpportunityCluster> {
    const userId = await this.getCurrentUserId();
    
    const { data: clusterData, error: clusterError } = await supabase
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
    if (cluster.queries.length > 0) {
      const { error: relationError } = await supabase
        .from('cluster_queries')
        .insert(
          cluster.queries.map(queryId => ({
            cluster_id: clusterData.id,
            query_id: queryId,
          }))
        );

      if (relationError) {
        console.error('Error adding cluster-query relations:', relationError);
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
    const { data: clusterData, error: clusterError } = await supabase
      .from('opportunity_clusters')
      .select()
      .eq('id', id)
      .single();

    if (clusterError || !clusterData) return undefined;

    const { data: queryData } = await supabase
      .from('cluster_queries')
      .select('query_id')
      .eq('cluster_id', id);

    return {
      id: clusterData.id,
      name: clusterData.name,
      intent_type: clusterData.intent_type,
      average_score: clusterData.average_score,
      queries: (queryData || []).map(q => q.query_id),
    };
  }

  async getAllClusters(): Promise<OpportunityCluster[]> {
    const userId = await this.getCurrentUserId();
    
    const { data: clusters, error } = await supabase
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
    const clusterIds = clusters.map(c => c.id);
    const { data: relations } = await supabase
      .from('cluster_queries')
      .select('cluster_id, query_id')
      .in('cluster_id', clusterIds);

    const queryMap = new Map<string, string[]>();
    (relations || []).forEach(rel => {
      if (!queryMap.has(rel.cluster_id)) {
        queryMap.set(rel.cluster_id, []);
      }
      queryMap.get(rel.cluster_id)!.push(rel.query_id);
    });

    return clusters.map(cluster => ({
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

    const { error: clusterError } = await supabase
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
      await supabase
        .from('cluster_queries')
        .delete()
        .eq('cluster_id', id);

      // Insert new relations
      if (updates.queries.length > 0) {
        const { error: relationError } = await supabase
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
    const { error } = await supabase
      .from('opportunity_clusters')
      .delete()
      .eq('id', id);

    return !error;
  }

  // Intent classification management
  async setIntentClassification(classification: IntentClassification): Promise<void> {
    const { error } = await supabase
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
    const { data, error } = await supabase
      .from('intent_classifications')
      .select()
      .eq('query_id', queryId)
      .single();

    if (error || !data) return undefined;
    return {
      query_id: data.query_id,
      intent_type: data.intent_type,
      confidence: data.confidence,
    };
  }

  async getAllIntentClassifications(): Promise<IntentClassification[]> {
    const { data, error } = await supabase
      .from('intent_classifications')
      .select();

    if (error) {
      console.error('Error fetching intent classifications:', error);
      return [];
    }

    return (data || []).map(item => ({
      query_id: item.query_id,
      intent_type: item.intent_type,
      confidence: item.confidence,
    }));
  }

  // Utility methods
  async getQueriesByIntent(intent: 'pain' | 'tool' | 'transition' | 'education'): Promise<Query[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await supabase
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
    };
  }
}

// Singleton instance
export const dbStorage = new DatabaseStorage();

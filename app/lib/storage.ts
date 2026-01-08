// In-memory data storage for the trends analyzer
// For database-backed storage, see storage-db.ts and migration guide

export interface Query {
  id: string;
  text: string;
  template?: string;
  stage?: string;
  function?: string;
  pain?: string;
  asset?: string;
  created_at: Date;
}

export interface TrendSnapshot {
  query_id: string;
  date: Date;
  interest_value: number;
  region?: string;
  window: '90d';
}

export interface TrendScore {
  query_id: string;
  score: number; // TOS (0-100)
  slope: number;
  acceleration: number;
  consistency: number;
  breadth: number;
  calculated_at: Date;
  window?: '90d'; // Optional window for historical tracking
}

export interface OpportunityCluster {
  id: string;
  name: string;
  intent_type: 'pain' | 'tool' | 'transition' | 'education';
  average_score: number;
  queries: string[]; // Query IDs
}

export interface IntentClassification {
  query_id: string;
  intent_type: 'pain' | 'tool' | 'transition' | 'education';
  confidence: number;
}

export interface EntrepreneurProfile {
  id?: string;
  user_id?: string;
  demographic?: string;
  tech_savviness?: 'non-tech' | 'basic' | 'intermediate' | 'advanced';
  business_stage?: string;
  industry?: string;
  geographic_region?: string;
  preferences?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class Storage {
  private queries: Map<string, Query> = new Map();
  private trendSnapshots: TrendSnapshot[] = [];
  private trendScores: Map<string, TrendScore> = new Map();
  private opportunityClusters: Map<string, OpportunityCluster> = new Map();
  private intentClassifications: Map<string, IntentClassification> = new Map();

  // Query management
  addQuery(query: Omit<Query, 'id' | 'created_at'>): Query {
    const id = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newQuery: Query = {
      ...query,
      id,
      created_at: new Date(),
    };
    this.queries.set(id, newQuery);
    return newQuery;
  }

  getQuery(id: string): Query | undefined {
    return this.queries.get(id);
  }

  getAllQueries(): Query[] {
    return Array.from(this.queries.values());
  }

  removeQuery(id: string): boolean {
    // Remove query and all associated data
    const deleted = this.queries.delete(id);
    if (deleted) {
      this.trendSnapshots = this.trendSnapshots.filter(s => s.query_id !== id);
      this.trendScores.delete(id);
      this.intentClassifications.delete(id);
      // Remove from clusters
      this.opportunityClusters.forEach(cluster => {
        cluster.queries = cluster.queries.filter(qid => qid !== id);
      });
    }
    return deleted;
  }

  // Trend snapshot management
  addTrendSnapshot(snapshot: TrendSnapshot): void {
    this.trendSnapshots.push(snapshot);
  }

  getTrendSnapshots(queryId: string, window?: '90d'): TrendSnapshot[] {
    let snapshots = this.trendSnapshots.filter(s => s.query_id === queryId);
    if (window) {
      snapshots = snapshots.filter(s => s.window === window);
    }
    return snapshots.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  getLatestSnapshot(queryId: string, window: '90d'): TrendSnapshot | undefined {
    const snapshots = this.getTrendSnapshots(queryId, window);
    return snapshots[snapshots.length - 1];
  }

  // Trend score management
  setTrendScore(score: TrendScore): void {
    this.trendScores.set(score.query_id, score);
  }

  getTrendScore(queryId: string): TrendScore | undefined {
    return this.trendScores.get(queryId);
  }

  getAllTrendScores(): TrendScore[] {
    return Array.from(this.trendScores.values());
  }

  // Opportunity cluster management
  addCluster(cluster: Omit<OpportunityCluster, 'id'>): OpportunityCluster {
    const id = `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCluster: OpportunityCluster = {
      ...cluster,
      id,
    };
    this.opportunityClusters.set(id, newCluster);
    return newCluster;
  }

  getCluster(id: string): OpportunityCluster | undefined {
    return this.opportunityClusters.get(id);
  }

  getAllClusters(): OpportunityCluster[] {
    return Array.from(this.opportunityClusters.values());
  }

  updateCluster(id: string, updates: Partial<OpportunityCluster>): boolean {
    const cluster = this.opportunityClusters.get(id);
    if (!cluster) return false;
    this.opportunityClusters.set(id, { ...cluster, ...updates });
    return true;
  }

  removeCluster(id: string): boolean {
    return this.opportunityClusters.delete(id);
  }

  // Intent classification management
  setIntentClassification(classification: IntentClassification): void {
    this.intentClassifications.set(classification.query_id, classification);
  }

  getIntentClassification(queryId: string): IntentClassification | undefined {
    return this.intentClassifications.get(queryId);
  }

  getAllIntentClassifications(): IntentClassification[] {
    return Array.from(this.intentClassifications.values());
  }

  // Utility methods
  clearAll(): void {
    this.queries.clear();
    this.trendSnapshots = [];
    this.trendScores.clear();
    this.opportunityClusters.clear();
    this.intentClassifications.clear();
  }

  getQueriesByIntent(intent: 'pain' | 'tool' | 'transition' | 'education'): Query[] {
    const classifications = Array.from(this.intentClassifications.values())
      .filter(c => c.intent_type === intent)
      .map(c => c.query_id);
    return classifications
      .map(id => this.queries.get(id))
      .filter((q): q is Query => q !== undefined);
  }
}

// Import database-backed storage
// The in-memory Storage class above is kept for reference but we use database storage
import { storage as dbStorage } from './storage-db';

// Export database storage as the default storage
// This replaces the in-memory storage with database-backed storage
export const storage = dbStorage;


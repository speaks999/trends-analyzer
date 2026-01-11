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

export interface AdsKeywordMetrics {
  id?: string;
  query_id: string;
  geo: string; // e.g. 'US'
  language_code: string; // e.g. 'en'
  network: 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';
  currency_code: string; // e.g. 'USD'

  avg_monthly_searches?: number;
  competition?: 'LOW' | 'MEDIUM' | 'HIGH';
  competition_index?: number;
  top_of_page_bid_low_micros?: number;
  top_of_page_bid_high_micros?: number;

  raw?: any;
  fetched_at?: Date;
}

export interface OpportunityScore {
  id?: string;
  query_id: string;
  geo: string;
  language_code: string;
  network: 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';
  window: '90d';

  opportunity_score: number; // 0-100
  efficiency_score: number; // 0-100
  demand_score: number; // 0-100
  momentum_score: number; // 0-100
  cpc_score: number; // 0-100

  slope: number;
  acceleration: number;
  consistency: number;

  calculated_at: Date;
}

export interface OpportunityCluster {
  id: string;
  name: string;
  intent_type: 'pain' | 'tool' | 'transition' | 'education';
  average_score: number;
  queries: string[]; // Query IDs
  related_topics?: RelatedTopic[];
  paa_questions?: PeopleAlsoAsk[];
}

export interface IntentClassification {
  query_id: string;
  intent_type: 'pain' | 'tool' | 'transition' | 'education';
  confidence: number;
  subcategory?: string;
}

export interface RelatedTopic {
  id?: string;
  query_id: string;
  topic: string;
  value: number;
  is_rising: boolean;
  link?: string;
  created_at?: Date;
}

// Renamed from PeopleAlsoAsk to RelatedQuestion
// Now using Google Related Questions API: https://serpapi.com/google-related-questions-api
export interface RelatedQuestion {
  id?: string;
  query_id: string;
  question: string;
  answer?: string;
  snippet?: string;
  title?: string;
  link?: string;
  source_logo?: string;
  created_at?: Date;
}

// Backward compatibility alias (deprecated)
export type PeopleAlsoAsk = RelatedQuestion;


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

/**
 * In-memory storage adapter used for local development and E2E tests.
 *
 * This intentionally mirrors the async API of the database-backed storage, so
 * the UI and API routes can run without Supabase credentials.
 */
class MemoryStorage {
  private queries: Map<string, Query> = new Map();
  private trendSnapshotsByKey: Map<string, TrendSnapshot> = new Map();
  private trendScoresByKey: Map<string, TrendScore> = new Map();
  private adsMetricsByKey: Map<string, AdsKeywordMetrics> = new Map();
  private opportunityScoresByKey: Map<string, OpportunityScore> = new Map();
  private opportunityClusters: Map<string, OpportunityCluster> = new Map();
  private intentClassifications: Map<string, IntentClassification> = new Map();
  private relatedTopicsByQueryId: Map<string, RelatedTopic[]> = new Map();
  private relatedQuestionsByQueryId: Map<string, RelatedQuestion[]> = new Map();
  private entrepreneurProfile: EntrepreneurProfile | null = null;

  private makeTrendScoreKey(queryId: string, window: '90d'): string {
    return `${queryId}::${window}`;
  }

  private makeTrendSnapshotKey(snapshot: TrendSnapshot): string {
    const regionPart = snapshot.region ?? '';
    return `${snapshot.query_id}::${snapshot.window}::${regionPart}::${snapshot.date.toISOString()}`;
  }

  private makeAdsMetricsKey(
    queryId: string,
    geo: string,
    languageCode: string,
    network: AdsKeywordMetrics['network']
  ): string {
    return `${queryId}::${geo}::${languageCode}::${network}`;
  }

  private makeOpportunityScoreKey(
    queryId: string,
    geo: string,
    languageCode: string,
    network: OpportunityScore['network'],
    window: OpportunityScore['window']
  ): string {
    return `${queryId}::${geo}::${languageCode}::${network}::${window}`;
  }

  // Query management
  async addQuery(query: Omit<Query, 'id' | 'created_at'>): Promise<Query> {
    const id = `query_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newQuery: Query = {
      ...query,
      id,
      created_at: new Date(),
    };
    this.queries.set(id, newQuery);
    return newQuery;
  }

  async getQuery(id: string): Promise<Query | undefined> {
    return this.queries.get(id);
  }

  async getAllQueries(): Promise<Query[]> {
    return Array.from(this.queries.values()).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );
  }

  async removeQuery(id: string): Promise<boolean> {
    const deleted = this.queries.delete(id);
    if (!deleted) return false;

    // Cascade cleanup of associated data
    this.relatedTopicsByQueryId.delete(id);
    this.relatedQuestionsByQueryId.delete(id);
    this.intentClassifications.delete(id);

    // Trend data cleanup
    for (const key of this.trendSnapshotsByKey.keys()) {
      if (key.startsWith(`${id}::`)) this.trendSnapshotsByKey.delete(key);
    }
    for (const key of this.trendScoresByKey.keys()) {
      if (key.startsWith(`${id}::`)) this.trendScoresByKey.delete(key);
    }

    // Ads/opportunity cleanup
    for (const key of this.adsMetricsByKey.keys()) {
      if (key.startsWith(`${id}::`)) this.adsMetricsByKey.delete(key);
    }
    for (const key of this.opportunityScoresByKey.keys()) {
      if (key.startsWith(`${id}::`)) this.opportunityScoresByKey.delete(key);
    }

    // Remove from clusters
    for (const [clusterId, cluster] of this.opportunityClusters.entries()) {
      const nextQueries = cluster.queries.filter((qid) => qid !== id);
      if (nextQueries.length !== cluster.queries.length) {
        this.opportunityClusters.set(clusterId, { ...cluster, queries: nextQueries });
      }
    }

    return true;
  }

  // Trend snapshot management
  async addTrendSnapshot(snapshot: TrendSnapshot): Promise<void> {
    this.trendSnapshotsByKey.set(this.makeTrendSnapshotKey(snapshot), snapshot);
  }

  async getTrendSnapshots(queryId: string, window?: '90d', region?: string): Promise<TrendSnapshot[]> {
    const out: TrendSnapshot[] = [];
    for (const snap of this.trendSnapshotsByKey.values()) {
      if (snap.query_id !== queryId) continue;
      if (window && snap.window !== window) continue;
      if (region && (snap.region ?? null) !== region) continue;
      out.push(snap);
    }
    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }

  async getLatestSnapshot(queryId: string, window: '90d'): Promise<TrendSnapshot | undefined> {
    const snaps = await this.getTrendSnapshots(queryId, window);
    return snaps[snaps.length - 1];
  }

  async hasCachedTrendData(queryId: string, window: '90d', region: string): Promise<boolean> {
    const snaps = await this.getTrendSnapshots(queryId, window, region);
    return snaps.length >= 75;
  }

  async batchHasCachedTrendData(
    queryIdMap: Map<string, string>,
    window: '90d',
    region: string
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [queryText, queryId] of queryIdMap.entries()) {
      results.set(queryText, await this.hasCachedTrendData(queryId, window, region));
    }
    return results;
  }

  async getCachedTrendData(
    queryText: string,
    queryId: string,
    window: '90d',
    region: string
  ): Promise<{ query: string; data: Array<{ date: Date; value: number }>; window: '90d'; geo?: string } | null> {
    const snaps = await this.getTrendSnapshots(queryId, window, region);
    if (snaps.length === 0) return null;
    return {
      query: queryText,
      data: snaps.map((s) => ({ date: s.date, value: s.interest_value })),
      window,
      geo: region,
    };
  }

  // Trend score management
  async setTrendScore(score: TrendScore & { window?: '90d' }): Promise<void> {
    const window = score.window ?? '90d';
    this.trendScoresByKey.set(this.makeTrendScoreKey(score.query_id, window), { ...score, window });
  }

  async getTrendScore(queryId: string, window: '90d' = '90d'): Promise<TrendScore | undefined> {
    return this.trendScoresByKey.get(this.makeTrendScoreKey(queryId, window));
  }

  async getAllTrendScores(window: '90d' = '90d'): Promise<TrendScore[]> {
    const out: TrendScore[] = [];
    for (const score of this.trendScoresByKey.values()) {
      if ((score.window ?? '90d') === window) out.push(score);
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  async getTopRankedQueries(
    limit: number = 10,
    window: '90d' = '90d',
    minScore: number = 0
  ): Promise<TrendScore[]> {
    const all = await this.getAllTrendScores(window);
    return all.filter((s) => s.score >= minScore).slice(0, limit);
  }

  // Google Ads keyword metrics management
  async upsertAdsKeywordMetrics(metrics: Omit<AdsKeywordMetrics, 'id' | 'fetched_at'>): Promise<void> {
    const row: AdsKeywordMetrics = {
      ...metrics,
      fetched_at: new Date(),
    };
    this.adsMetricsByKey.set(
      this.makeAdsMetricsKey(metrics.query_id, metrics.geo, metrics.language_code, metrics.network),
      row
    );
  }

  async getAdsKeywordMetrics(
    queryId: string,
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH'
  ): Promise<AdsKeywordMetrics | undefined> {
    return this.adsMetricsByKey.get(this.makeAdsMetricsKey(queryId, geo, languageCode, network));
  }

  async getAdsKeywordMetricsForQueries(
    queryIds: string[],
    geo: string = 'US',
    languageCode: string = 'en',
    network: AdsKeywordMetrics['network'] = 'GOOGLE_SEARCH'
  ): Promise<Map<string, AdsKeywordMetrics>> {
    const result = new Map<string, AdsKeywordMetrics>();
    for (const queryId of queryIds) {
      const row = await this.getAdsKeywordMetrics(queryId, geo, languageCode, network);
      if (row) result.set(queryId, row);
    }
    return result;
  }

  // Opportunity scores management
  async upsertOpportunityScore(score: Omit<OpportunityScore, 'id'>): Promise<void> {
    const row: OpportunityScore = { ...score };
    this.opportunityScoresByKey.set(
      this.makeOpportunityScoreKey(score.query_id, score.geo, score.language_code, score.network, score.window),
      row
    );
  }

  async getTopOpportunityScores(
    limit: number = 50,
    window: '90d' = '90d',
    geo: string = 'US',
    languageCode: string = 'en',
    network: OpportunityScore['network'] = 'GOOGLE_SEARCH'
  ): Promise<OpportunityScore[]> {
    const out: OpportunityScore[] = [];
    for (const score of this.opportunityScoresByKey.values()) {
      if (score.window !== window) continue;
      if (score.geo !== geo) continue;
      if (score.language_code !== languageCode) continue;
      if (score.network !== network) continue;
      out.push(score);
    }
    out.sort((a, b) => b.opportunity_score - a.opportunity_score);
    return out.slice(0, limit);
  }

  // Opportunity cluster management
  async addCluster(cluster: Omit<OpportunityCluster, 'id'>): Promise<OpportunityCluster> {
    const id = `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newCluster: OpportunityCluster = { ...cluster, id };
    this.opportunityClusters.set(id, newCluster);
    return newCluster;
  }

  async getCluster(id: string): Promise<OpportunityCluster | undefined> {
    return this.opportunityClusters.get(id);
  }

  async findExistingClusterWithQueries(queryIds: string[]): Promise<string | undefined> {
    const wanted = new Set(queryIds);
    for (const [clusterId, cluster] of this.opportunityClusters.entries()) {
      const have = new Set(cluster.queries);
      if (have.size !== wanted.size) continue;
      let allMatch = true;
      for (const qid of wanted) {
        if (!have.has(qid)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return clusterId;
    }
    return undefined;
  }

  async getAllClusters(): Promise<OpportunityCluster[]> {
    return Array.from(this.opportunityClusters.values()).sort((a, b) => b.average_score - a.average_score);
  }

  async updateCluster(id: string, updates: Partial<OpportunityCluster>): Promise<boolean> {
    const existing = this.opportunityClusters.get(id);
    if (!existing) return false;
    this.opportunityClusters.set(id, { ...existing, ...updates });
    return true;
  }

  async removeCluster(id: string): Promise<boolean> {
    return this.opportunityClusters.delete(id);
  }

  // Intent classification management
  async setIntentClassification(classification: IntentClassification): Promise<void> {
    this.intentClassifications.set(classification.query_id, classification);
  }

  async getIntentClassification(queryId: string): Promise<IntentClassification | undefined> {
    return this.intentClassifications.get(queryId);
  }

  async getAllIntentClassifications(): Promise<IntentClassification[]> {
    return Array.from(this.intentClassifications.values());
  }

  async getQueriesByIntent(intent: IntentClassification['intent_type']): Promise<Query[]> {
    const ids = Array.from(this.intentClassifications.values())
      .filter((c) => c.intent_type === intent)
      .map((c) => c.query_id);
    const out: Query[] = [];
    for (const id of ids) {
      const q = this.queries.get(id);
      if (q) out.push(q);
    }
    return out;
  }

  // Related Topics management
  async saveRelatedTopics(
    queryId: string,
    topics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[]
  ): Promise<void> {
    const mapped: RelatedTopic[] = topics.map((t) => ({
      id: `topic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      query_id: queryId,
      topic: t.topic,
      value: t.value,
      is_rising: t.is_rising,
      link: t.link,
      created_at: new Date(),
    }));
    this.relatedTopicsByQueryId.set(queryId, mapped);
  }

  async getRelatedTopics(queryId: string): Promise<RelatedTopic[]> {
    return this.relatedTopicsByQueryId.get(queryId) ?? [];
  }

  // Related Questions management (formerly People Also Ask)
  async saveRelatedQuestions(
    queryId: string,
    questions: Omit<RelatedQuestion, 'id' | 'query_id' | 'created_at'>[]
  ): Promise<void> {
    const mapped: RelatedQuestion[] = questions.map((q) => ({
      id: `rq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      query_id: queryId,
      question: q.question,
      answer: q.answer,
      snippet: q.snippet,
      title: q.title,
      link: q.link,
      source_logo: q.source_logo,
      created_at: new Date(),
    }));
    this.relatedQuestionsByQueryId.set(queryId, mapped);
  }

  async getRelatedQuestions(queryId: string): Promise<RelatedQuestion[]> {
    return this.relatedQuestionsByQueryId.get(queryId) ?? [];
  }

  // Backward compatibility aliases (deprecated)
  async savePeopleAlsoAsk(
    queryId: string,
    paa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[]
  ): Promise<void> {
    return this.saveRelatedQuestions(queryId, paa);
  }

  async getPeopleAlsoAsk(queryId: string): Promise<PeopleAlsoAsk[]> {
    return this.getRelatedQuestions(queryId);
  }

  // Cluster intent aggregation (no-op in memory; kept for API compatibility)
  async updateClusterIntentData(
    clusterId: string,
    relatedTopics?: RelatedTopic[],
    paaQuestions?: PeopleAlsoAsk[]
  ): Promise<void> {
    const cluster = this.opportunityClusters.get(clusterId);
    if (!cluster) return;
    this.opportunityClusters.set(clusterId, {
      ...cluster,
      related_topics: relatedTopics,
      paa_questions: paaQuestions,
    });
  }

  async aggregateClusterIntentData(_clusterId: string): Promise<void> {
    // Intentionally no-op for E2E/local runs.
  }

  // Entrepreneur profile management (minimal)
  async getEntrepreneurProfile(): Promise<EntrepreneurProfile | null> {
    return this.entrepreneurProfile;
  }

  async saveEntrepreneurProfile(
    profile: Omit<EntrepreneurProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<EntrepreneurProfile> {
    const next: EntrepreneurProfile = {
      ...profile,
      id: this.entrepreneurProfile?.id ?? `profile_${Date.now()}`,
      created_at: this.entrepreneurProfile?.created_at ?? new Date(),
      updated_at: new Date(),
    };
    this.entrepreneurProfile = next;
    return next;
  }

  // Test helper
  async clearAll(): Promise<void> {
    this.queries.clear();
    this.trendSnapshotsByKey.clear();
    this.trendScoresByKey.clear();
    this.adsMetricsByKey.clear();
    this.opportunityScoresByKey.clear();
    this.opportunityClusters.clear();
    this.intentClassifications.clear();
    this.relatedTopicsByQueryId.clear();
    this.relatedQuestionsByQueryId.clear();
    this.entrepreneurProfile = null;
  }
}

// Import database-backed storage
// The in-memory Storage class above is kept for reference but we use database storage
import { storage as dbStorage } from './storage-db';

const isE2ETestMode =
  process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true' || process.env.E2E_TEST_MODE === 'true';

const hasSupabaseConfig =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  (typeof process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === 'string' ||
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string') &&
  ((process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || '')
    .length > 0;

export const memoryStorage = new MemoryStorage();

// Export storage adapter (DB by default; memory in E2E / missing Supabase config)
export const storage = isE2ETestMode || !hasSupabaseConfig ? memoryStorage : dbStorage;


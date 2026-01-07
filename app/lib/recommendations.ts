// Recommendation generation logic

import { storage, Query } from './storage';
import { TrendScoreResult, getTopQueriesByTOS } from './scoring';
import { OpportunityCluster } from './storage';

export interface TutorialRecommendation {
  title: string;
  description: string;
  query: string;
  score: number;
  evidence: string[];
}

export interface FeatureRecommendation {
  title: string;
  description: string;
  cluster: string;
  averageScore: number;
  queryCount: number;
  evidence: string[];
}

/**
 * Generate tutorial recommendations based on high-scoring queries
 */
export function generateTutorialRecommendations(
  limit: number = 10
): TutorialRecommendation[] {
  const topQueries = getTopQueriesByTOS(limit, '12m', 60);

  return topQueries.map(scoreResult => {
    const query = storage.getQuery(scoreResult.query_id);
    if (!query) return null;

    const classification = storage.getIntentClassification(scoreResult.query_id);
    const relatedQueries = storage.getTrendSnapshots(scoreResult.query_id)
      .filter(s => s.interest_value > 0)
      .length;

    const evidence: string[] = [
      `TOS Score: ${scoreResult.score} (${scoreResult.classification})`,
      `Intent: ${classification?.intent_type || 'unknown'}`,
      `Trend classification: ${scoreResult.classification}`,
    ];

    if (relatedQueries > 0) {
      evidence.push(`${relatedQueries} related queries found`);
    }

    return {
      title: `Tutorial: ${query.text}`,
      description: `Create a tutorial addressing "${query.text}" - high interest query with TOS of ${scoreResult.score}`,
      query: query.text,
      score: scoreResult.score,
      evidence,
    };
  }).filter((r): r is TutorialRecommendation => r !== null);
}

/**
 * Generate product feature recommendations based on clusters
 */
export function generateFeatureRecommendations(
  limit: number = 10
): FeatureRecommendation[] {
  const clusters = storage.getAllClusters()
    .filter(c => c.average_score >= 60 && c.queries.length >= 3)
    .sort((a, b) => b.average_score - a.average_score)
    .slice(0, limit);

  return clusters.map(cluster => {
    const queries = cluster.queries
      .map(id => storage.getQuery(id))
      .filter((q): q is Query => q !== undefined);

    const evidence: string[] = [
      `Average TOS: ${cluster.average_score}`,
      `${cluster.queries.length} validating queries`,
      `Intent type: ${cluster.intent_type}`,
    ];

    if (queries.length > 0) {
      evidence.push(`Sample queries: ${queries.slice(0, 3).map(q => q.text).join(', ')}`);
    }

    return {
      title: `Feature: ${cluster.name}`,
      description: `Consider building features addressing "${cluster.name}" - cluster of ${cluster.queries.length} related queries`,
      cluster: cluster.name,
      averageScore: cluster.average_score,
      queryCount: cluster.queries.length,
      evidence,
    };
  });
}

/**
 * Get all recommendations
 */
export function getAllRecommendations() {
  return {
    tutorials: generateTutorialRecommendations(),
    features: generateFeatureRecommendations(),
  };
}


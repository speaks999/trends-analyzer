// Recommendation generation logic

import { storage, Query } from './storage';
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
 * Calculate a simple interest score based on trend data
 */
function calculateInterestScore(queryId: string): number {
  const snapshots = storage.getTrendSnapshots(queryId, '12m');
  
  if (snapshots.length === 0) return 0;

  // Calculate average interest value
  const avgInterest = snapshots.reduce((sum, s) => sum + s.interest_value, 0) / snapshots.length;
  
  // Check for recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSnapshots = snapshots.filter(s => s.date >= thirtyDaysAgo);
  const recentActivity = recentSnapshots.length > 0 
    ? recentSnapshots.reduce((sum, s) => sum + s.interest_value, 0) / recentSnapshots.length
    : 0;

  // Check trend direction (comparing first half vs second half)
  const midPoint = Math.floor(snapshots.length / 2);
  const firstHalf = snapshots.slice(0, midPoint);
  const secondHalf = snapshots.slice(midPoint);
  const firstHalfAvg = firstHalf.length > 0 
    ? firstHalf.reduce((sum, s) => sum + s.interest_value, 0) / firstHalf.length 
    : 0;
  const secondHalfAvg = secondHalf.length > 0 
    ? secondHalf.reduce((sum, s) => sum + s.interest_value, 0) / secondHalf.length 
    : 0;
  const trendDirection = secondHalfAvg > firstHalfAvg ? 1.2 : 1.0; // Boost if trending up

  // Combine factors: base interest (60%), recent activity (30%), trend direction (10%)
  const score = Math.round(
    avgInterest * 0.6 + 
    recentActivity * 0.3 * trendDirection + 
    (snapshots.length > 10 ? 10 : snapshots.length) * 0.1 // Bonus for data volume
  );

  return Math.min(100, Math.max(0, score));
}

/**
 * Generate tutorial recommendations based on queries with trend data
 */
export function generateTutorialRecommendations(
  limit: number = 10
): TutorialRecommendation[] {
  const allQueries = storage.getAllQueries();
  
  // Score each query based on trend data
  const scoredQueries = allQueries
    .map(query => {
      const snapshots = storage.getTrendSnapshots(query.id, '12m');
      if (snapshots.length === 0) return null;

      const score = calculateInterestScore(query.id);
      const classification = storage.getIntentClassification(query.id);
      
      // Calculate recent trend
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentSnapshots = snapshots.filter(s => s.date >= thirtyDaysAgo);
      const avgInterest = snapshots.reduce((sum, s) => sum + s.interest_value, 0) / snapshots.length;
      const recentAvg = recentSnapshots.length > 0
        ? recentSnapshots.reduce((sum, s) => sum + s.interest_value, 0) / recentSnapshots.length
        : 0;

      return {
        query,
        score,
        snapshots: snapshots.length,
        avgInterest,
        recentAvg,
        classification,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter(item => item.score >= 30) // Only recommend queries with meaningful interest
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scoredQueries.map(item => {
    const { query, score, snapshots, avgInterest, recentAvg, classification } = item;
    
    const evidence: string[] = [
      `Interest Score: ${score}/100`,
      `Data points: ${snapshots} snapshots`,
      `Average interest: ${Math.round(avgInterest)}/100`,
      `Intent: ${classification?.intent_type || 'unknown'}`,
    ];

    if (recentAvg > avgInterest * 1.1) {
      evidence.push(`Trending up: Recent activity ${Math.round(recentAvg)} vs average ${Math.round(avgInterest)}`);
    }

    return {
      title: `Tutorial: ${query.text}`,
      description: `Create a tutorial addressing "${query.text}" - showing strong search interest (score: ${score})`,
      query: query.text,
      score,
      evidence,
    };
  });
}

/**
 * Generate product feature recommendations based on clusters
 */
export function generateFeatureRecommendations(
  limit: number = 10
): FeatureRecommendation[] {
  const clusters = storage.getAllClusters()
    .filter(c => c.queries.length >= 2) // At least 2 queries to form a cluster
    .map(cluster => {
      // Calculate average interest score for queries in cluster
      const queryScores = cluster.queries
        .map(queryId => {
          const snapshots = storage.getTrendSnapshots(queryId, '12m');
          return snapshots.length > 0 ? calculateInterestScore(queryId) : 0;
        })
        .filter(score => score > 0);

      const avgScore = queryScores.length > 0
        ? queryScores.reduce((sum, s) => sum + s, 0) / queryScores.length
        : 0;

      return {
        cluster,
        avgScore,
        queriesWithData: queryScores.length,
      };
    })
    .filter(item => item.avgScore >= 25 && item.queriesWithData >= 2) // Meaningful clusters
    .sort((a, b) => {
      // Sort by average score, then by cluster size
      if (Math.abs(a.avgScore - b.avgScore) > 5) {
        return b.avgScore - a.avgScore;
      }
      return b.cluster.queries.length - a.cluster.queries.length;
    })
    .slice(0, limit);

  return clusters.map(item => {
    const { cluster, avgScore } = item;
    const queries = cluster.queries
      .map(id => storage.getQuery(id))
      .filter((q): q is Query => q !== undefined);

    const evidence: string[] = [
      `Average Interest Score: ${Math.round(avgScore)}/100`,
      `${cluster.queries.length} related queries`,
      `${item.queriesWithData} queries with trend data`,
      `Intent type: ${cluster.intent_type}`,
    ];

    if (queries.length > 0) {
      evidence.push(`Sample queries: ${queries.slice(0, 3).map(q => q.text).join(', ')}`);
    }

    return {
      title: `Feature: ${cluster.name}`,
      description: `Consider building features addressing "${cluster.name}" - cluster of ${cluster.queries.length} related queries with average interest of ${Math.round(avgScore)}`,
      cluster: cluster.name,
      averageScore: Math.round(avgScore),
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


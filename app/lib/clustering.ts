// Opportunity aggregation/clustering

import { storage, OpportunityCluster, Query } from './storage';
import { calculateTOS } from './scoring';

// Re-export types for convenience
export type { OpportunityCluster } from './storage';

/**
 * Calculate similarity between two queries based on text and intent
 */
function calculateSimilarity(query1: Query, query2: Query, intent1: string, intent2: string): number {
  // Intent must match for clustering
  if (intent1 !== intent2) return 0;

  // Calculate text similarity (simple word overlap)
  const words1 = new Set(query1.text.toLowerCase().split(/\s+/));
  const words2 = new Set(query2.text.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  const jaccardSimilarity = intersection.size / union.size;

  // Boost similarity if they share dimensions
  let dimensionBonus = 0;
  if (query1.stage && query2.stage && query1.stage === query2.stage) dimensionBonus += 0.2;
  if (query1.function && query2.function && query1.function === query2.function) dimensionBonus += 0.2;
  if (query1.pain && query2.pain && query1.pain === query2.pain) dimensionBonus += 0.2;
  if (query1.asset && query2.asset && query1.asset === query2.asset) dimensionBonus += 0.2;

  return Math.min(1, jaccardSimilarity + dimensionBonus);
}

/**
 * Generate cluster name from queries
 */
function generateClusterName(queries: Query[], intent: string): string {
  // Find common words
  const allWords = queries.map(q => q.text.toLowerCase().split(/\s+/));
  const commonWords = allWords[0].filter(word =>
    allWords.every(words => words.includes(word))
  ).filter(word => word.length > 3); // Filter out short words

  if (commonWords.length > 0) {
    return commonWords[0].charAt(0).toUpperCase() + commonWords[0].slice(1) + ' ' + intent;
  }

  // Fallback to intent-based name
  const intentNames: Record<string, string> = {
    pain: 'Pain Points',
    tool: 'Tool Needs',
    transition: 'Business Transitions',
    education: 'Learning Topics',
  };

  return intentNames[intent] || 'Opportunity Cluster';
}

/**
 * Cluster queries into opportunity groups
 */
export function clusterQueries(
  similarityThreshold: number = 0.3
): OpportunityCluster[] {
  const queries = storage.getAllQueries();
  const clusters: OpportunityCluster[] = [];
  const assigned = new Set<string>();

  // Get intent for each query
  const queryIntents = new Map<string, string>();
  queries.forEach(query => {
    const classification = storage.getIntentClassification(query.id);
    queryIntents.set(query.id, classification?.intent_type || 'education');
  });

  // Group by intent first
  const queriesByIntent = new Map<string, Query[]>();
  queries.forEach(query => {
    const intent = queryIntents.get(query.id) || 'education';
    if (!queriesByIntent.has(intent)) {
      queriesByIntent.set(intent, []);
    }
    queriesByIntent.get(intent)!.push(query);
  });

  // Cluster within each intent group
  queriesByIntent.forEach((intentQueries, intent) => {
    const intentClusters: Query[][] = [];

    intentQueries.forEach(query => {
      if (assigned.has(query.id)) return;

      // Find existing cluster to join or create new one
      let addedToCluster = false;
      for (const cluster of intentClusters) {
        // Check similarity with cluster members
        const avgSimilarity = cluster.reduce((sum, clusterQuery) => {
          const clusterIntent = queryIntents.get(clusterQuery.id) || intent;
          return sum + calculateSimilarity(query, clusterQuery, intent, clusterIntent);
        }, 0) / cluster.length;

        if (avgSimilarity >= similarityThreshold) {
          cluster.push(query);
          assigned.add(query.id);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        // Create new cluster
        intentClusters.push([query]);
        assigned.add(query.id);
      }
    });

    // Create OpportunityCluster objects
    intentClusters.forEach(clusterQueries => {
      if (clusterQueries.length === 0) return;

      const queryIds = clusterQueries.map(q => q.id);
      const scores = queryIds.map(id => {
        const score = calculateTOS(id);
        return score.score;
      });
      const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      const cluster: OpportunityCluster = {
        id: `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: generateClusterName(clusterQueries, intent),
        intent_type: intent as 'pain' | 'tool' | 'transition' | 'education',
        average_score: Math.round(averageScore),
        queries: queryIds,
      };

      clusters.push(cluster);
      storage.addCluster(cluster);
    });
  });

  return clusters;
}

/**
 * Get clusters for queries
 */
export function getClusters(): OpportunityCluster[] {
  return storage.getAllClusters();
}

/**
 * Get cluster by ID
 */
export function getCluster(clusterId: string): OpportunityCluster | undefined {
  return storage.getCluster(clusterId);
}

/**
 * Re-cluster all queries (clears existing clusters first)
 */
export function reclusterQueries(similarityThreshold: number = 0.3): OpportunityCluster[] {
  // Clear existing clusters
  const existingClusters = storage.getAllClusters();
  existingClusters.forEach(cluster => storage.removeCluster(cluster.id));

  // Create new clusters
  return clusterQueries(similarityThreshold);
}

/**
 * Get top clusters by average score
 */
export function getTopClusters(limit: number = 10): OpportunityCluster[] {
  const clusters = storage.getAllClusters();
  return clusters
    .sort((a, b) => b.average_score - a.average_score)
    .slice(0, limit);
}


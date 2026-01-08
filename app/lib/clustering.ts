// Opportunity aggregation/clustering

import { storage as defaultStorage, OpportunityCluster, Query } from './storage';
import type { DatabaseStorage } from './storage-db';

// Storage interface for dependency injection
type StorageInstance = DatabaseStorage;

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
export async function clusterQueries(
  similarityThreshold: number = 0.3,
  storageInstance?: StorageInstance
): Promise<OpportunityCluster[]> {
  const storage = storageInstance || defaultStorage;
  const queries = await storage.getAllQueries();
  const clusters: OpportunityCluster[] = [];
  const assigned = new Set<string>();

  // Get intent for each query
  const queryIntents = new Map<string, string>();
  for (const query of queries) {
    const classification = await storage.getIntentClassification(query.id);
    queryIntents.set(query.id, classification?.intent_type || 'education');
  }

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
  for (const [intent, intentQueries] of queriesByIntent.entries()) {
    const intentClusters: Query[][] = [];

    for (const query of intentQueries) {
      if (assigned.has(query.id)) continue;

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
    }

    // Create OpportunityCluster objects
    for (const clusterQueries of intentClusters) {
      if (clusterQueries.length === 0) continue;

      const queryIds = clusterQueries.map(q => q.id).sort(); // Sort for consistent comparison
      
      // Check if a cluster with these exact queries already exists
      const existingClusterId = await storage.findExistingClusterWithQueries(queryIds);
      if (existingClusterId) {
        // Cluster already exists, fetch it and add to results
        const existingCluster = await storage.getCluster(existingClusterId);
        if (existingCluster) {
          clusters.push(existingCluster);
        }
        continue; // Skip creating a duplicate
      }

      const { calculateTOSForQueries } = await import('./scoring');
      const scoresResult = await calculateTOSForQueries(queryIds, '30d');
      const scores = scoresResult.map(s => s.score);
      const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      // Create cluster object without ID - let database generate UUID
      const clusterToAdd = {
        name: generateClusterName(clusterQueries, intent),
        intent_type: intent as 'pain' | 'tool' | 'transition' | 'education',
        average_score: Math.round(averageScore),
        queries: queryIds,
      };

      // Add to database and get back the cluster with the database-generated UUID
      const cluster = await storage.addCluster(clusterToAdd);
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * Get clusters for queries
 */
export async function getClusters(storageInstance?: StorageInstance): Promise<OpportunityCluster[]> {
  const storage = storageInstance || defaultStorage;
  return await storage.getAllClusters();
}

/**
 * Get cluster by ID
 */
export async function getCluster(clusterId: string, storageInstance?: StorageInstance): Promise<OpportunityCluster | undefined> {
  const storage = storageInstance || defaultStorage;
  return await storage.getCluster(clusterId);
}

/**
 * Re-cluster all queries (clears existing clusters first)
 */
export async function reclusterQueries(similarityThreshold: number = 0.3, storageInstance?: StorageInstance): Promise<OpportunityCluster[]> {
  const storage = storageInstance || defaultStorage;
  // Clear existing clusters
  const existingClusters = await storage.getAllClusters();
  for (const cluster of existingClusters) {
    await storage.removeCluster(cluster.id);
  }

  // Create new clusters
  return await clusterQueries(similarityThreshold, storageInstance);
}

/**
 * Get top clusters by average score
 */
export async function getTopClusters(limit: number = 10, storageInstance?: StorageInstance): Promise<OpportunityCluster[]> {
  const storage = storageInstance || defaultStorage;
  const clusters = await storage.getAllClusters();
  return clusters
    .sort((a, b) => b.average_score - a.average_score)
    .slice(0, limit);
}


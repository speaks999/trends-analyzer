// API route for generating tutorial or feature recommendations for a specific cluster

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { generateClusterTutorialRecommendationsAI, generateClusterFeatureRecommendationsAI, TutorialRecommendation, FeatureRecommendation } from '@/app/lib/recommendations-ai';
import { calculateTOSForQueries } from '@/app/lib/scoring';

export async function POST(request: NextRequest) {
  let type: 'tutorials' | 'features' = 'tutorials'; // Default to tutorials
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();
    type = body.type || 'tutorials'; // type can be 'tutorials' or 'features'
    const { clusterId, limit = 5 } = body;

    if (!clusterId || typeof clusterId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'clusterId is required' },
        { status: 400 }
      );
    }

    console.log(`[Cluster Recommendations] Looking for cluster with ID: ${clusterId}`);
    
    // First, let's verify what clusters exist
    const allClusters = await storage.getAllClusters();
    console.log(`[Cluster Recommendations] Total clusters available: ${allClusters.length}`);
    console.log(`[Cluster Recommendations] Available cluster IDs:`, allClusters.map(c => ({ id: c.id, name: c.name })));
    
    // Get the cluster
    const cluster = await storage.getCluster(clusterId);
    if (!cluster) {
      console.error(`[Cluster Recommendations] Cluster not found with ID: ${clusterId}`);
      // Check if cluster ID might be in wrong format (old string format)
      const isOldFormat = clusterId.startsWith('cluster_');
      if (isOldFormat) {
        console.error(`[Cluster Recommendations] Detected old cluster ID format. Clusters need to be regenerated.`);
      }
      return NextResponse.json(
        { 
          success: false, 
          error: `Cluster not found with ID: ${clusterId}. ${isOldFormat ? 'This appears to be an old cluster ID format. Please regenerate clusters.' : 'Please check the cluster ID.'}`,
          requestedId: clusterId,
          availableCount: allClusters.length,
        },
        { status: 404 }
      );
    }
    console.log(`[Cluster Recommendations] Found cluster: ${cluster.name} (${cluster.id}) with ${cluster.queries.length} queries`);

    // Get all queries with their text
    const allQueries = await storage.getAllQueries();
    const queryMap = new Map(allQueries.map(q => [q.id, q]));

    // Get query texts and calculate scores for queries in cluster
    const clusterQueries = cluster.queries
      .map(id => {
        const query = queryMap.get(id);
        return query ? { id, text: query.text } : null;
      })
      .filter((q): q is { id: string; text: string } => q !== null);

    if (clusterQueries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cluster has no valid queries' },
        { status: 400 }
      );
    }

    // Calculate TOS scores for cluster queries
    const queryIds = clusterQueries.map(q => q.id);
    const scores = await calculateTOSForQueries(queryIds, '90d', storage);
    const scoreMap = new Map(scores.map(s => [s.query_id, s]));

    // Format queries with scores for AI function
    const queriesWithScores = clusterQueries.map(q => {
      const score = scoreMap.get(q.id);
      return {
        query_id: q.id,
        query_text: q.text,
        score: score?.score || 0,
        classification: score?.classification || 'stable',
      };
    });

    // Get entrepreneur profile
    const profile = await storage.getEntrepreneurProfile();

    // Generate recommendations based on type
    if (type === 'features') {
      // Generate feature recommendations using AI
      const features = await generateClusterFeatureRecommendationsAI(
        {
          name: cluster.name,
          intent_type: cluster.intent_type,
          average_score: cluster.average_score,
          queries: queriesWithScores,
        },
        profile,
        limit
      );

      return NextResponse.json({
        success: true,
        clusterId,
        clusterName: cluster.name,
        features,
        count: features.length,
      });
    } else {
      // Generate tutorial recommendations using AI (default)
      const tutorials = await generateClusterTutorialRecommendationsAI(
        {
          name: cluster.name,
          intent_type: cluster.intent_type,
          average_score: cluster.average_score,
          queries: queriesWithScores,
        },
        profile,
        limit
      );

      return NextResponse.json({
        success: true,
        clusterId,
        clusterName: cluster.name,
        tutorials,
        count: tutorials.length,
      });
    }
  } catch (error) {
    console.error(`Error generating cluster ${type} recommendations:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : `Failed to generate cluster ${type} recommendations`,
        [type]: [],
      },
      { status: 500 }
    );
  }
}

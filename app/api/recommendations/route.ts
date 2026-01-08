// API route for generating AI-powered recommendations

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { getTopQueriesByTOS } from '@/app/lib/scoring';
import { 
  generateTutorialRecommendationsAI, 
  generateFeatureRecommendationsAI,
  TutorialRecommendation as AITutorialRecommendation,
  FeatureRecommendation as AIFeatureRecommendation
} from '@/app/lib/recommendations-ai';

export async function GET(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') || '30d') as '30d';
    const limit = parseInt(searchParams.get('limit') || '10');
    const useAI = searchParams.get('useAI') !== 'false'; // Default to true

    // Get user profile
    const profile = await storage.getEntrepreneurProfile();

    // Get top queries by TOS score (pass authenticated storage instance)
    const topQueries = await getTopQueriesByTOS(limit * 2, window, 40, storage); // Get more queries to choose from
    
    // Get all queries to map IDs to text
    const allQueries = await storage.getAllQueries();
    const queryMap = new Map(allQueries.map(q => [q.id, q.text]));

    // Format queries for AI
    const formattedQueries = topQueries
      .map(score => ({
        query_id: score.query_id,
        query_text: queryMap.get(score.query_id) || 'Unknown',
        score: score.score,
        breakdown: score.breakdown,
        classification: score.classification,
      }))
      .filter(q => q.query_text !== 'Unknown');

    // Get clusters for feature recommendations
    const allClusters = await storage.getAllClusters();
    const formattedClusters = allClusters
      .filter(c => c.queries.length >= 2)
      .map(cluster => ({
        name: cluster.name,
        intent_type: cluster.intent_type,
        average_score: cluster.average_score,
        query_count: cluster.queries.length,
        queries: cluster.queries.map(id => queryMap.get(id) || 'Unknown').filter(q => q !== 'Unknown'),
      }))
      .filter(c => c.queries.length > 0)
      .sort((a, b) => b.average_score - a.average_score)
      .slice(0, limit * 2);

    let tutorials: AITutorialRecommendation[] = [];
    let features: AIFeatureRecommendation[] = [];

    if (useAI && formattedQueries.length > 0) {
      try {
        // Generate AI-powered recommendations
        tutorials = await generateTutorialRecommendationsAI(
          formattedQueries,
          profile,
          limit
        );
      } catch (error) {
        console.error('Error generating AI tutorial recommendations:', error);
        // Fallback to empty if AI fails
      }
    }

    if (useAI && formattedClusters.length > 0) {
      try {
        // Generate AI-powered feature recommendations
        features = await generateFeatureRecommendationsAI(
          formattedClusters,
          profile,
          limit
        );
      } catch (error) {
        console.error('Error generating AI feature recommendations:', error);
        // Fallback to empty if AI fails
      }
    }

    return NextResponse.json({
      success: true,
      tutorials,
      features,
      profile_used: profile ? {
        demographic: profile.demographic,
        tech_savviness: profile.tech_savviness,
        business_stage: profile.business_stage,
        industry: profile.industry,
      } : null,
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate recommendations',
        tutorials: [],
        features: [],
      },
      { status: 500 }
    );
  }
}

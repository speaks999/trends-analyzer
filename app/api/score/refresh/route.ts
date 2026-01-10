// API route for refreshing/recalculating TOS scores for all queries
// This allows continuous ranking of search terms by popularity

import { NextRequest, NextResponse } from 'next/server';
import { calculateTOSForQueries, getTopQueriesByTOS } from '@/app/lib/scoring';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();
    const { window = '90d' as '90d', limit } = body;

    // Get all queries for the current user
    const allQueries = await storage.getAllQueries();
    
    if (allQueries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No queries found to calculate scores for',
        scores: [],
      });
    }

    const queryIds = allQueries.map(q => q.id);

    // Calculate TOS for all queries (90d window only)
    const scores = await calculateTOSForQueries(queryIds, '90d', storage);
    
    // Store all scores in database
    for (const score of scores) {
      await storage.setTrendScore({
        query_id: score.query_id,
        score: score.score,
        slope: score.breakdown.slope,
        acceleration: score.breakdown.acceleration,
        consistency: score.breakdown.consistency,
        breadth: 0,
        calculated_at: new Date(),
        window: '90d',
      });
    }

    // Get top ranked queries for the specified window
    // Pass authenticated storage instance to ensure user-specific data
    const topQueries = await getTopQueriesByTOS(
      limit || 50,
      window,
      0,
      storage
    );

    return NextResponse.json({
      success: true,
      message: `Recalculated scores for ${queryIds.length} queries (90d window)`,
      totalQueries: queryIds.length,
      topQueries: topQueries.map(s => ({
        query_id: s.query_id,
        score: s.score,
        classification: s.classification,
        breakdown: s.breakdown,
      })),
    });
  } catch (error) {
    console.error('Error refreshing scores:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh scores',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') || '90d') as '90d';
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get top ranked queries
    const topQueries = await getTopQueriesByTOS(limit, window, 0);

    // Also get query texts for display
    const allQueries = await storage.getAllQueries();
    const queryMap = new Map(allQueries.map(q => [q.id, q.text]));

    return NextResponse.json({
      success: true,
      rankings: topQueries.map((score, index) => ({
        rank: index + 1,
        query_id: score.query_id,
        query_text: queryMap.get(score.query_id) || 'Unknown',
        score: score.score,
        classification: score.classification,
        breakdown: score.breakdown,
      })),
    });
  } catch (error) {
    console.error('Error getting rankings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get rankings',
      },
      { status: 500 }
    );
  }
}

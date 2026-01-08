// API route for calculating trend scores

import { NextRequest, NextResponse } from 'next/server';
import { calculateTOS, calculateTOSForQueries } from '@/app/lib/scoring';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();
    const { queryIds, window = '90d' } = body;

    if (!queryIds || !Array.isArray(queryIds) || queryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'queryIds array is required' },
        { status: 400 }
      );
    }

    const scores = await calculateTOSForQueries(queryIds, window, storage);

    // Store scores in database with window tracking
    for (const score of scores) {
      await storage.setTrendScore({
        query_id: score.query_id,
        score: score.score,
        slope: score.breakdown.slope,
        acceleration: score.breakdown.acceleration,
        consistency: score.breakdown.consistency,
        breadth: score.breakdown.breadth,
        calculated_at: new Date(),
        window: window,
      });
    }

    return NextResponse.json({
      success: true,
      scores,
    });
  } catch (error) {
    console.error('Error calculating scores:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate scores',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get('queryId');
    const window = (searchParams.get('window') || '90d') as '90d';
    const refresh = searchParams.get('refresh') === 'true'; // Optional: recalculate scores

    if (queryId) {
      if (refresh) {
        // Recalculate and store the score
        const score = await calculateTOS(queryId, window);
        await storage.setTrendScore({
          query_id: score.query_id,
          score: score.score,
          slope: score.breakdown.slope,
          acceleration: score.breakdown.acceleration,
          consistency: score.breakdown.consistency,
          breadth: score.breakdown.breadth,
          calculated_at: new Date(),
          window: window,
        });
        return NextResponse.json({
          success: true,
          score,
        });
      } else {
        // Get stored score from database
        const storedScore = await storage.getTrendScore(queryId, window);
        if (storedScore) {
          return NextResponse.json({
            success: true,
            score: {
              query_id: storedScore.query_id,
              score: storedScore.score,
              classification: storedScore.score >= 80 ? 'breakout' 
                : storedScore.score >= 60 ? 'growing'
                : storedScore.score >= 40 ? 'stable'
                : 'declining',
              breakdown: {
                slope: storedScore.slope,
                acceleration: storedScore.acceleration,
                consistency: storedScore.consistency,
                breadth: storedScore.breadth,
              },
            },
          });
        }
        // If no stored score, calculate it
        const score = await calculateTOS(queryId, window);
        return NextResponse.json({
          success: true,
          score,
        });
      }
    }

    // Get all scores for the current user (ranked by score)
    const scores = await storage.getAllTrendScores(window);
    const scoreResults = scores.map(score => ({
      query_id: score.query_id,
      score: score.score,
      classification: score.score >= 80 ? 'breakout' 
        : score.score >= 60 ? 'growing'
        : score.score >= 40 ? 'stable'
        : 'declining',
      breakdown: {
        slope: score.slope,
        acceleration: score.acceleration,
        consistency: score.consistency,
        breadth: score.breadth,
      },
    }));

    return NextResponse.json({
      success: true,
      scores: scoreResults,
    });
  } catch (error) {
    console.error('Error getting scores:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get scores',
      },
      { status: 500 }
    );
  }
}


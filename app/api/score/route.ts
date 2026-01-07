// API route for calculating trend scores

import { NextRequest, NextResponse } from 'next/server';
import { calculateTOS, calculateTOSForQueries } from '@/app/lib/scoring';
import { storage } from '@/app/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queryIds, window = '12m' } = body;

    if (!queryIds || !Array.isArray(queryIds) || queryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'queryIds array is required' },
        { status: 400 }
      );
    }

    const scores = calculateTOSForQueries(queryIds, window);

    // Store scores
    for (const score of scores) {
      storage.setTrendScore({
        query_id: score.query_id,
        score: score.score,
        slope: score.breakdown.slope,
        acceleration: score.breakdown.acceleration,
        consistency: score.breakdown.consistency,
        breadth: score.breakdown.breadth,
        calculated_at: new Date(),
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
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get('queryId');
    const window = (searchParams.get('window') || '12m') as '30d' | '90d' | '12m';

    if (queryId) {
      const score = calculateTOS(queryId, window);
      return NextResponse.json({
        success: true,
        score,
      });
    }

    // Get all scores
    const allQueries = storage.getAllQueries();
    const scores = calculateTOSForQueries(
      allQueries.map(q => q.id),
      window
    );

    return NextResponse.json({
      success: true,
      scores,
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


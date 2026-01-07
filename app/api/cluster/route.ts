// API route for opportunity clustering

import { NextRequest, NextResponse } from 'next/server';
import { clusterQueries, reclusterQueries, getClusters, getTopClusters } from '@/app/lib/clustering';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recluster = false, similarityThreshold = 0.3, top = null } = body;

    let clusters;
    if (recluster) {
      clusters = reclusterQueries(similarityThreshold);
    } else {
      clusters = clusterQueries(similarityThreshold);
    }

    // Return top clusters if requested
    if (top && typeof top === 'number') {
      clusters = clusters
        .sort((a, b) => b.average_score - a.average_score)
        .slice(0, top);
    }

    return NextResponse.json({
      success: true,
      clusters,
      count: clusters.length,
    });
  } catch (error) {
    console.error('Error clustering queries:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cluster queries',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const top = searchParams.get('top');

    let clusters;
    if (top && !isNaN(Number(top))) {
      clusters = getTopClusters(Number(top));
    } else {
      clusters = getClusters();
    }

    return NextResponse.json({
      success: true,
      clusters,
      count: clusters.length,
    });
  } catch (error) {
    console.error('Error getting clusters:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get clusters',
      },
      { status: 500 }
    );
  }
}


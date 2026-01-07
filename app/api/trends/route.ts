// API route for fetching trends for multiple time windows and storing snapshots

import { NextRequest, NextResponse } from 'next/server';
import { getTrendData, TimeWindow, simplifyTrendsKeyword } from '@/app/lib/trends';
import { storage } from '@/app/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queries, windows = ['30d', '90d', '12m'], includeRegional = true, includeRelated = true } = body;

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Queries array is required' },
        { status: 400 }
      );
    }

    // Map query texts to query IDs
    const allQueries = storage.getAllQueries();
    const queryMap = new Map<string, string>(); // text -> id
    allQueries.forEach(q => {
      queryMap.set(q.text, q.id);
    });

    // Resolve each natural-language query into a Trends-friendly keyword
    const resolved = queries.map((q: string) => ({
      originalQuery: q,
      keywordUsed: simplifyTrendsKeyword(q),
      queryId: queryMap.get(q), // Find the query ID
    }));
    const keywords = resolved.map(r => r.keywordUsed);

    // Fetch trend data
    let trendData;
    try {
      trendData = await getTrendData(
        keywords,
        windows as TimeWindow[],
        includeRegional,
        includeRelated
      );
    } catch (error) {
      console.error('Error in getTrendData:', error);
      throw error;
    }

    // Store trend snapshots for scoring
    // Create a map from keyword to query ID
    const keywordToQueryId = new Map<string, string>();
    resolved.forEach(r => {
      if (r.queryId) {
        keywordToQueryId.set(r.keywordUsed, r.queryId);
      }
    });

    trendData.interestOverTime.forEach(series => {
      const keyword = series.query; // This is the simplified keyword
      const queryId = keywordToQueryId.get(keyword);
      
      if (!queryId) {
        console.warn(`No query ID found for keyword: ${keyword}`);
        return;
      }

      // Store each data point as a TrendSnapshot
      series.data.forEach(point => {
        storage.addTrendSnapshot({
          query_id: queryId,
          date: point.date instanceof Date ? point.date : new Date(point.date),
          interest_value: point.value,
          window: series.window as '30d' | '90d' | '12m',
        });
      });
    });

    // Return chart-ready data to the client (client should NOT read server memory directly)
    const interestOverTime = trendData.interestOverTime.map(r => ({
      query: r.query,
      window: r.window,
      data: r.data.map(p => ({
        date: p.date instanceof Date ? p.date.toISOString() : new Date(p.date).toISOString(),
        value: p.value,
      })),
    }));

    return NextResponse.json({
      success: true,
      resolved,
      data: {
        ...trendData,
        interestOverTime,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch trends',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { success: false, error: 'Use POST /api/trends with { queries: [...] }' },
    { status: 405 }
  );
}


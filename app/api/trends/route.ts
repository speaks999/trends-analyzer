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

    // Create a map from keyword to list of original queries (since multiple queries can map to same keyword)
    const keywordToResolved = new Map<string, typeof resolved>();
    resolved.forEach(r => {
      if (!keywordToResolved.has(r.keywordUsed)) {
        keywordToResolved.set(r.keywordUsed, []);
      }
      keywordToResolved.get(r.keywordUsed)!.push(r);
    });

    // Deduplicate keywords for fetching (we'll map results back to all original queries)
    const uniqueKeywords = Array.from(keywordToResolved.keys());

    // Fetch trend data (only for unique keywords to avoid duplicate API calls)
    let trendData;
    try {
      trendData = await getTrendData(
        uniqueKeywords,
        windows as TimeWindow[],
        includeRegional,
        includeRelated
      );
    } catch (error) {
      console.error('Error in getTrendData:', error);
      throw error;
    }

    // Store trend snapshots for scoring and map results back to original queries
    const interestOverTime: Array<{
      query: string; // Original query text
      window: '30d' | '90d' | '12m';
      data: Array<{ date: string; value: number }>;
    }> = [];

    trendData.interestOverTime.forEach(series => {
      const keyword = series.query; // This is the simplified keyword
      const matchingResolved = keywordToResolved.get(keyword) || [];
      
      if (matchingResolved.length === 0) {
        console.warn(`No original queries found for keyword: ${keyword}`);
        return;
      }

      console.log(`Mapping keyword "${keyword}" to ${matchingResolved.length} original query(ies)`);

      // For each original query that maps to this keyword, create a separate series
      matchingResolved.forEach(res => {
        if (!res.queryId) {
          console.warn(`No query ID for original query: ${res.originalQuery}`);
          return;
        }

        // Store each data point as a TrendSnapshot
        series.data.forEach(point => {
          storage.addTrendSnapshot({
            query_id: res.queryId!,
            date: point.date instanceof Date ? point.date : new Date(point.date),
            interest_value: point.value,
            window: series.window as '30d' | '90d' | '12m',
          });
        });

        // Create a series entry with the original query text
        interestOverTime.push({
          query: res.originalQuery, // Use original query text, not keyword
          window: series.window as '30d' | '90d' | '12m',
          data: series.data.map(p => ({
            date: p.date instanceof Date ? p.date.toISOString() : new Date(p.date).toISOString(),
            value: p.value,
          })),
        });
      });
    });

    console.log(`Returning ${interestOverTime.length} series for chart`);

    return NextResponse.json({
      success: true,
      resolved,
      data: {
        ...trendData,
        interestOverTime, // Now uses original query texts
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


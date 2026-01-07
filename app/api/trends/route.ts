// API route for fetching trends for multiple time windows and storing snapshots

import { NextRequest, NextResponse } from 'next/server';
import { getTrendData, TimeWindow } from '@/app/lib/trends';
import { storage } from '@/app/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queries, windows = ['30d', '90d', '12m'], includeRegional = true, includeRelated = true } = body;

    console.log('=== TRENDS API REQUEST ===');
    console.log('Received queries:', JSON.stringify(queries, null, 2));
    console.log('Number of queries:', queries?.length);

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

    // Use original queries directly (no simplification)
    const resolved = queries.map((q: string) => ({
      originalQuery: q,
      queryId: queryMap.get(q), // Find the query ID
    }));

    console.log('Resolved queries with IDs:', JSON.stringify(resolved, null, 2));
    console.log('Sending to getTrendData:', JSON.stringify(queries, null, 2));

    // Fetch trend data using original queries directly
    let trendData;
    try {
      trendData = await getTrendData(
        queries, // Use original queries directly
        windows as TimeWindow[],
        includeRegional,
        includeRelated
      );
      
      console.log('=== TRENDS DATA RETURNED ===');
      console.log('Number of series returned:', trendData.interestOverTime.length);
      console.log('Series queries:', trendData.interestOverTime.map(s => ({
        query: s.query,
        window: s.window,
        dataPoints: s.data.length
      })));
    } catch (error) {
      console.error('Error in getTrendData:', error);
      throw error;
    }

    // Map results back to original queries and store snapshots
    const interestOverTime: Array<{
      query: string; // Original query text
      window: '30d' | '90d' | '12m';
      data: Array<{ date: string; value: number }>;
    }> = [];

    // Create a map from query text to resolved entry
    const queryToResolved = new Map<string, typeof resolved[0]>();
    resolved.forEach(r => {
      queryToResolved.set(r.originalQuery, r);
    });

    console.log('=== MAPPING RESULTS ===');
    console.log('Query to resolved map:', Array.from(queryToResolved.entries()).map(([q, r]) => ({
      query: q,
      queryId: r.queryId
    })));

    trendData.interestOverTime.forEach((series, index) => {
      const queryText = series.query; // This is the original query text
      const resolvedEntry = queryToResolved.get(queryText);
      
      console.log(`Processing series ${index + 1}: "${queryText}"`);
      console.log(`  - Found in resolved map: ${!!resolvedEntry}`);
      console.log(`  - Query ID: ${resolvedEntry?.queryId || 'NOT FOUND'}`);
      console.log(`  - Data points: ${series.data.length}`);
      
      if (!resolvedEntry || !resolvedEntry.queryId) {
        console.warn(`  ⚠️ No query ID found for query: ${queryText}`);
        return;
      }

      // Store each data point as a TrendSnapshot
      series.data.forEach(point => {
        storage.addTrendSnapshot({
          query_id: resolvedEntry.queryId!,
          date: point.date instanceof Date ? point.date : new Date(point.date),
          interest_value: point.value,
          window: series.window as '30d' | '90d' | '12m',
        });
      });

      // Create a series entry with the original query text
      interestOverTime.push({
        query: queryText,
        window: series.window as '30d' | '90d' | '12m',
        data: series.data.map(p => ({
          date: p.date instanceof Date ? p.date.toISOString() : new Date(p.date).toISOString(),
          value: p.value,
        })),
      });
      
      console.log(`  ✓ Added to interestOverTime`);
    });

    console.log('=== FINAL RESULT ===');
    console.log(`Total series in interestOverTime: ${interestOverTime.length}`);
    console.log('Series details:', interestOverTime.map(s => ({
      query: s.query,
      window: s.window,
      dataPoints: s.data.length
    })));

    return NextResponse.json({
      success: true,
      resolved: resolved.map(r => ({ originalQuery: r.originalQuery, keywordUsed: r.originalQuery })),
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


// API route for fetching trends for multiple time windows and storing snapshots

import { NextRequest, NextResponse } from 'next/server';
import { getTrendData, TimeWindow, GeoRegion } from '@/app/lib/trends';
import { storage } from '@/app/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queries, windows = ['30d', '90d', '12m'], includeRegional = true, includeRelated = true, regions = ['US', 'CA'] } = body;

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
    console.log('=== STORAGE STATE ===');
    console.log('Total queries in storage:', allQueries.length);
    console.log('Queries in storage:', allQueries.map(q => ({ id: q.id, text: q.text })));
    
    const queryMap = new Map<string, string>(); // text -> id
    allQueries.forEach(q => {
      queryMap.set(q.text, q.id);
    });

    // Use original queries directly (no simplification)
    const resolved = queries.map((q: string) => ({
      originalQuery: q,
      queryId: queryMap.get(q), // Find the query ID
    }));

    console.log('=== QUERY RESOLUTION ===');
    console.log('Resolved queries with IDs:', JSON.stringify(resolved, null, 2));
    console.log('Query lookup results:', queries.map(q => ({
      query: q,
      found: queryMap.has(q),
      queryId: queryMap.get(q)
    })));
    console.log('Sending to getTrendData:', JSON.stringify(queries, null, 2));

    // Fetch trend data using original queries directly
    let trendData;
    try {
      trendData = await getTrendData(
        queries, // Use original queries directly
        windows as TimeWindow[],
        includeRegional,
        includeRelated,
        regions as GeoRegion[] // Pass regions to getTrendData
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

    // Create a map from query text (with region suffix) to resolved entry
    // For each original query, we expect two series from getTrendData (US and CA)
    const fullQueryTextToResolved = new Map<string, typeof resolved[0]>();
    resolved.forEach(r => {
      regions.forEach((region: GeoRegion) => {
        fullQueryTextToResolved.set(`${r.originalQuery} (${region})`, r);
      });
    });

    console.log('=== MAPPING RESULTS ===');
    console.log('Query to resolved map:', Array.from(fullQueryTextToResolved.entries()).map(([key, value]) => ({
      query: key,
      originalQuery: value.originalQuery,
      queryId: value.queryId
    })));

    trendData.interestOverTime.forEach((series, index) => {
      const queryTextWithRegion = series.query; // e.g., "cash flow issues (US)"
      const resolvedEntry = fullQueryTextToResolved.get(queryTextWithRegion);
      
      console.log(`Processing series ${index + 1}: "${queryTextWithRegion}"`);
      console.log(`  - Found in resolved map: ${!!resolvedEntry}`);
      console.log(`  - Query ID: ${resolvedEntry?.queryId ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`  - Data points: ${series.data.length}`);

      if (resolvedEntry && resolvedEntry.queryId) {
        // Store each data point as a TrendSnapshot
        series.data.forEach(point => {
          storage.addTrendSnapshot({
            query_id: resolvedEntry.queryId!,
            date: point.date instanceof Date ? point.date : new Date(point.date),
            interest_value: point.value,
            window: series.window as '30d' | '90d' | '12m',
            region: queryTextWithRegion.match(/\((US|CA)\)$/)?.[1] as GeoRegion, // Extract region from name
          });
        });
        console.log('  ✓ Snapshots stored');
      } else {
        console.warn(`  ⚠️ No query ID found - skipping snapshot storage but still returning chart data`);
      }

      // Always add to interestOverTime for chart display
      interestOverTime.push({
        query: queryTextWithRegion, // Use the name with region suffix for chart legend
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


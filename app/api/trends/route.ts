// API route for fetching trends for multiple time windows and storing snapshots

import { NextRequest, NextResponse } from 'next/server';
import { getTrendData, TimeWindow, GeoRegion } from '@/app/lib/trends';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { calculateTOSForQueries } from '@/app/lib/scoring';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated storage instance for this user
    const storage = await getAuthenticatedStorage(request);

    const body = await request.json();
    const { 
      queries, 
      windows = ['30d'], 
      includeRegional = true, 
      includeRelated = true, 
      regions = ['US'],
      forceRefresh = false // Allow forcing refresh from SerpAPI
    } = body;

    console.log('=== TRENDS API REQUEST ===');
    console.log('Received queries:', JSON.stringify(queries, null, 2));
    console.log('Number of queries:', queries?.length);
    console.log('Force refresh:', forceRefresh);

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Queries array is required' },
        { status: 400 }
      );
    }

    // Map query texts to query IDs
    const allQueries = await storage.getAllQueries();
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

    // Fetch trend data - will check cache first unless forceRefresh is true
    let trendData;
    try {
      trendData = await getTrendData(
        queries, // Use original queries directly
        windows as TimeWindow[],
        includeRegional,
        includeRelated,
        regions as GeoRegion[], // Pass regions to getTrendData
        queryMap, // Pass query map for cache lookup
        forceRefresh // Pass force refresh flag
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
      window: '30d';
      data: Array<{ date: string; value: number }>;
    }> = [];

    // Create a map from query text to resolved entry
    // Since we only search US now, query names don't include region suffix
    const fullQueryTextToResolved = new Map<string, typeof resolved[0]>();
    resolved.forEach(r => {
      // Map query text to resolved entry (no region suffix needed)
      fullQueryTextToResolved.set(r.originalQuery, r);
    });

    console.log('=== MAPPING RESULTS ===');
    console.log('Query to resolved map:', Array.from(fullQueryTextToResolved.entries()).map(([key, value]) => ({
      query: key,
      originalQuery: value.originalQuery,
      queryId: value.queryId
    })));

    // Process series and store snapshots
    for (const [index, series] of trendData.interestOverTime.entries()) {
      // Query names no longer include region suffix (since we only search US)
      // Remove any (US) suffix that might exist in old cached data
      const queryText = series.query.replace(/\s*\(US\)\s*$/, '').trim();
      const resolvedEntry = fullQueryTextToResolved.get(queryText);
      
      console.log(`Processing series ${index + 1}: "${queryText}"`);
      console.log(`  - Found in resolved map: ${!!resolvedEntry}`);
      console.log(`  - Query ID: ${resolvedEntry?.queryId ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`  - Data points: ${series.data.length}`);

      if (resolvedEntry && resolvedEntry.queryId) {
        // Store each data point as a TrendSnapshot
        for (const point of series.data) {
          await storage.addTrendSnapshot({
            query_id: resolvedEntry.queryId!,
            date: point.date instanceof Date ? point.date : new Date(point.date),
            interest_value: point.value,
            window: '30d' as const,
            region: 'US', // Always US since we only search US now
          });
        }
        console.log('  ✓ Snapshots stored');
      } else {
        console.warn(`  ⚠️ No query ID found - skipping snapshot storage but still returning chart data`);
      }

      // Always add to interestOverTime for chart display (without region suffix)
      interestOverTime.push({
        query: queryText, // Use query name without region suffix
        window: '30d' as const,
        data: series.data.map(p => ({
          date: p.date instanceof Date ? p.date.toISOString() : new Date(p.date).toISOString(),
          value: p.value,
        })),
      });
      
      console.log(`  ✓ Added to interestOverTime`);
    }

    console.log('=== FINAL RESULT ===');
    console.log(`Total series in interestOverTime: ${interestOverTime.length}`);
    console.log('Series details:', interestOverTime.map(s => ({
      query: s.query,
      window: s.window,
      dataPoints: s.data.length
    })));

    // Calculate TOS scores for all queries that have data
    const queryIdsWithData = resolved
      .filter(r => r.queryId)
      .map(r => r.queryId!);
    
    let tosScores: Array<{ query_id: string; score: number; classification: string }> = [];
    if (queryIdsWithData.length > 0) {
      try {
        // Calculate TOS for 30d window and store in database
        const scores = await calculateTOSForQueries(queryIdsWithData, '30d');
        
        // Store scores in database
        for (const score of scores) {
          await storage.setTrendScore({
            query_id: score.query_id,
            score: score.score,
            slope: score.breakdown.slope,
            acceleration: score.breakdown.acceleration,
            consistency: score.breakdown.consistency,
            breadth: score.breakdown.breadth,
            calculated_at: new Date(),
            window: '30d',
          });
        }

        // Get the latest scores (using 30d window)
        const latestScores = scores;
        tosScores = latestScores.map(s => ({
          query_id: s.query_id,
          score: s.score,
          classification: s.classification,
        }));
      } catch (error) {
        console.error('Error calculating TOS scores:', error);
      }
    }

    return NextResponse.json({
      success: true,
      resolved: resolved.map(r => ({ originalQuery: r.originalQuery, keywordUsed: r.originalQuery })),
      data: {
        ...trendData,
        interestOverTime,
      },
      tosScores, // Include TOS scores in response
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


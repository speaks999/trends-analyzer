// API route for fetching trends for multiple time windows and storing snapshots

import { NextRequest, NextResponse } from 'next/server';
import { getTrendData, TimeWindow, GeoRegion } from '@/app/lib/trends';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { calculateTOSForQueries } from '@/app/lib/scoring';
import { fetchHistoricalKeywordData, isDataForSEOConfigured } from '@/app/lib/dataforseo-ads';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated storage instance for this user
    const storage = await getAuthenticatedStorage(request);

    const body = await request.json();
    const { 
      queries, 
      windows = ['90d'], 
      includeRegional = true, 
      includeRelated = true, 
      regions = ['US'],
      forceRefresh = false // Allow forcing refresh (currently only affects cache)
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

    // Try to get historical search volume data from database cache first, then DataForSEO
    // This provides actual search volumes (not normalized)
    let dataForSEOHistorical: Array<{ text: string; monthly_searches?: Array<{ month: string; search_volume: number }> }> = [];
    let useDataForSEO = false;
    
    // First, check database cache for monthly_searches data
    const cachedDataMap = new Map<string, Array<{ month: string; search_volume: number }>>();
    for (const resolvedItem of resolved) {
      if (!resolvedItem.queryId) continue;
      const cached = await storage.getCachedMonthlySearches(
        resolvedItem.queryId,
        regions[0] || 'US',
        'en',
        'GOOGLE_SEARCH'
      );
      if (cached && cached.length > 0) {
        cachedDataMap.set(resolvedItem.originalQuery, cached);
        console.log(`[Trends API] Found cached monthly_searches for "${resolvedItem.originalQuery}" (${cached.length} months)`);
      }
    }

    // Use cached data if we have it for all queries
    if (cachedDataMap.size === resolved.length && !forceRefresh) {
      console.log(`[Trends API] Using cached monthly_searches data from database (${cachedDataMap.size} queries)`);
      dataForSEOHistorical = Array.from(cachedDataMap.entries()).map(([text, monthly_searches]) => ({
        text,
        monthly_searches,
      }));
      useDataForSEO = true;
    } else if (isDataForSEOConfigured() && windows.includes('90d')) {
      // Fetch from DataForSEO if not all cached or force refresh
      const queriesToFetch = forceRefresh 
        ? queries 
        : queries.filter(q => !cachedDataMap.has(q));
      
      if (queriesToFetch.length > 0) {
        try {
          console.log(`[Trends API] Fetching historical search volume from DataForSEO for ${queriesToFetch.length} queries...`);
          const { fetchKeywordHistoricalMetrics } = await import('@/app/lib/dataforseo-ads');
          const searchVolumeData = await fetchKeywordHistoricalMetrics({
            keywords: queriesToFetch,
            geo: regions[0] || 'US',
            languageCode: 'en',
          });
          console.log(`[Trends API] DataForSEO search volume API returned ${searchVolumeData.length} results`);
          
          // Convert to the format we need and store in database
          for (const item of searchVolumeData) {
            const resolvedItem = resolved.find(r => r.originalQuery === item.text);
            if (resolvedItem?.queryId) {
              // Store all metrics including monthly_searches in the database
              // We'll update the existing metrics or create new ones
              const existingMetrics = await storage.getAdsKeywordMetrics(
                resolvedItem.queryId,
                regions[0] || 'US',
                'en',
                'GOOGLE_SEARCH'
              );
              
              // Prepare raw data with monthly_searches
              const existingRaw = existingMetrics?.raw as any || {};
              const newRaw = item.raw as any || {};
              
              await storage.upsertAdsKeywordMetrics({
                query_id: resolvedItem.queryId,
                geo: regions[0] || 'US',
                language_code: 'en',
                network: 'GOOGLE_SEARCH',
                currency_code: 'USD',
                // Use new metrics from search volume API, fallback to existing
                avg_monthly_searches: item.avg_monthly_searches ?? existingMetrics?.avg_monthly_searches,
                competition: item.competition ?? existingMetrics?.competition,
                competition_index: item.competition_index ?? existingMetrics?.competition_index,
                top_of_page_bid_low_micros: item.low_top_of_page_bid_micros ?? existingMetrics?.top_of_page_bid_low_micros,
                top_of_page_bid_high_micros: item.high_top_of_page_bid_micros ?? existingMetrics?.top_of_page_bid_high_micros,
                avg_cpc_micros: item.avg_cpc_micros ?? existingMetrics?.avg_cpc_micros,
                // Preserve ad traffic metrics if they exist
                ad_impressions: existingMetrics?.ad_impressions,
                clicks: existingMetrics?.clicks,
                ctr: existingMetrics?.ctr,
                // Store monthly_searches in raw field (merge with existing raw data)
                raw: {
                  ...existingRaw,
                  ...newRaw,
                  // Store monthly_searches in the format we need
                  monthly_searches: item.monthly_searches && item.monthly_searches.length > 0
                    ? item.monthly_searches.map(m => ({
                        month: m.month,
                        search_volume: m.search_volume,
                      }))
                    : existingRaw?.monthly_searches, // Preserve existing if new data doesn't have it
                },
              });
              if (item.monthly_searches && item.monthly_searches.length > 0) {
                console.log(`[Trends API] Stored monthly_searches (${item.monthly_searches.length} months) and metrics for "${item.text}" in database`);
              } else {
                console.log(`[Trends API] Stored metrics for "${item.text}" in database (no monthly_searches data)`);
              }
            }
            
            dataForSEOHistorical.push({
              text: item.text,
              monthly_searches: item.monthly_searches?.map(m => ({
                month: m.month,
                search_volume: m.search_volume,
              })),
            });
          }
          
          // Merge cached data with newly fetched data
          for (const [text, monthly_searches] of cachedDataMap.entries()) {
            if (!dataForSEOHistorical.find(d => d.text === text)) {
              dataForSEOHistorical.push({ text, monthly_searches });
            }
          }
          
          console.log(`[Trends API] DataForSEO returned ${dataForSEOHistorical.length} results with monthly data`);
          
          // Use DataForSEO if we got data for at least some queries
          if (dataForSEOHistorical.length > 0 && dataForSEOHistorical.some(item => item.monthly_searches && item.monthly_searches.length > 0)) {
            useDataForSEO = true;
            console.log('[Trends API] Using DataForSEO historical data for chart');
          } else {
            console.warn('[Trends API] DataForSEO returned results but no monthly_searches data available');
          }
        } catch (error) {
          console.error('[Trends API] DataForSEO historical data fetch failed:', error instanceof Error ? error.message : String(error));
          if (error instanceof Error) {
            console.error('[Trends API] Error stack:', error.stack);
          }
          
          // Fall back to cached data if API fails
          if (cachedDataMap.size > 0) {
            console.log('[Trends API] Falling back to cached data after API failure');
            dataForSEOHistorical = Array.from(cachedDataMap.entries()).map(([text, monthly_searches]) => ({
              text,
              monthly_searches,
            }));
            useDataForSEO = true;
          }
        }
      } else {
        // All queries have cached data
        dataForSEOHistorical = Array.from(cachedDataMap.entries()).map(([text, monthly_searches]) => ({
          text,
          monthly_searches,
        }));
        useDataForSEO = true;
      }
    }

    // Fetch trend data - will check cache first unless forceRefresh is true
    // Cached data is used for trend direction/momentum calculation (TOS scores)
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
      window: '90d';
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

    // Helper function to convert monthly search volume data to daily data points
    // Uses all available historical months (typically 13 months from August 2021 to today)
    function monthlyToDailyData(
      monthlyData: Array<{ month: string; search_volume: number }>
    ): Array<{ date: Date; value: number }> {
      if (!monthlyData || monthlyData.length === 0) return [];
      
      // Ensure all months are strings in "YYYY-MM" format, and sort by month (oldest first)
      const normalizedMonthly = monthlyData.map(m => ({
        month: typeof m.month === 'string' ? m.month : String(m.month),
        search_volume: m.search_volume,
      }));
      
      const sortedMonthly = [...normalizedMonthly].sort((a, b) => {
        // Ensure both are strings before comparing
        const monthA = typeof a.month === 'string' ? a.month : String(a.month);
        const monthB = typeof b.month === 'string' ? b.month : String(b.month);
        return monthA.localeCompare(monthB);
      });
      
      if (sortedMonthly.length === 0) return [];
      
      // Parse the earliest and latest months
      const earliestMonth = sortedMonthly[0].month; // Format: "YYYY-MM"
      const latestMonth = sortedMonthly[sortedMonthly.length - 1].month;
      
      // Parse dates: start from the first day of the earliest month, end at today
      const [earliestYear, earliestMonthNum] = earliestMonth.split('-').map(Number);
      const startDate = new Date(earliestYear, earliestMonthNum - 1, 1); // First day of earliest month
      const endDate = new Date(); // Today
      
      // Create a map of month -> search volume
      const monthToVolume = new Map<string, number>();
      sortedMonthly.forEach(m => {
        monthToVolume.set(m.month, m.search_volume);
      });
      
      const dailyPoints: Array<{ date: Date; value: number }> = [];
      
      // Generate daily points for the entire range
      // Use each month's search volume for all days in that month
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const volume = monthToVolume.get(monthKey);
        
        if (volume !== undefined) {
          dailyPoints.push({
            date: new Date(d),
            value: volume,
          });
        }
      }
      
      // Fill any gaps in the data with the previous month's value
      // This ensures we have continuous data points
      if (dailyPoints.length > 0) {
        const filledPoints: Array<{ date: Date; value: number }> = [];
        let lastKnownValue: number | undefined = undefined;
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const existingPoint = dailyPoints.find(p => 
            p.date.getFullYear() === d.getFullYear() &&
            p.date.getMonth() === d.getMonth() &&
            p.date.getDate() === d.getDate()
          );
          
          if (existingPoint) {
            filledPoints.push(existingPoint);
            lastKnownValue = existingPoint.value;
          } else if (lastKnownValue !== undefined) {
            // Fill gap with last known value
            filledPoints.push({
              date: new Date(d),
              value: lastKnownValue,
            });
          }
        }
        
        return filledPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
      
      return dailyPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    // Create a map of DataForSEO historical data by keyword
    const dataForSEOByKeyword = new Map<string, typeof dataForSEOHistorical[number]>();
    dataForSEOHistorical.forEach(item => {
      dataForSEOByKeyword.set(item.text.toLowerCase(), item);
    });
    console.log(`[Trends API] DataForSEO data map: ${dataForSEOByKeyword.size} keywords mapped`);

    // Process series and store snapshots
    for (const [index, series] of trendData.interestOverTime.entries()) {
      // Query names no longer include region suffix (since we only search US)
      // Remove any (US) suffix that might exist in old cached data
      const queryText = series.query.replace(/\s*\(US\)\s*$/, '').trim();
      const resolvedEntry = fullQueryTextToResolved.get(queryText);
      const dataForSEOData = dataForSEOByKeyword.get(queryText.toLowerCase());
      
      console.log(`Processing series ${index + 1}: "${queryText}"`);
      console.log(`  - Found in resolved map: ${!!resolvedEntry}`);
      console.log(`  - Query ID: ${resolvedEntry?.queryId ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`  - Data points: ${series.data.length}`);
      console.log(`  - DataForSEO data available: ${!!dataForSEOData}`);

      // Determine which data to use for the chart
      let chartData: Array<{ date: string; value: number }>;
      
      if (useDataForSEO && dataForSEOData?.monthly_searches && dataForSEOData.monthly_searches.length > 0) {
        // Use DataForSEO historical monthly data, converted to daily points
        // This will use all available months (typically 13 months from August 2021 to today)
        const dailyData = monthlyToDailyData(dataForSEOData.monthly_searches);
        chartData = dailyData.map(p => ({
          date: p.date.toISOString(),
          value: p.value, // Actual search volume, not normalized
        }));
        
        const earliestMonth = dataForSEOData.monthly_searches.sort((a, b) => {
          const monthA = typeof a.month === 'string' ? a.month : String(a.month);
          const monthB = typeof b.month === 'string' ? b.month : String(b.month);
          return monthA.localeCompare(monthB);
        })[0]?.month;
        const latestMonth = dataForSEOData.monthly_searches.sort((a, b) => {
          const monthA = typeof a.month === 'string' ? a.month : String(a.month);
          const monthB = typeof b.month === 'string' ? b.month : String(b.month);
          return monthB.localeCompare(monthA);
        })[0]?.month;
        console.log(`  ✓ Using DataForSEO search volumes (${chartData.length} data points from ${dataForSEOData.monthly_searches.length} months: ${earliestMonth} to ${latestMonth})`);
      } else {
        // Fall back to cached trend data (if available)
        chartData = series.data.map(p => ({
          date: p.date instanceof Date ? p.date.toISOString() : new Date(p.date).toISOString(),
          value: p.value, // Normalized 0-100 from cached trend data
        }));
        console.log(`  ✓ Using cached trend data (${chartData.length} data points)`);
      }

      if (resolvedEntry && resolvedEntry.queryId) {
        // Store trend snapshots for TOS calculation
        // We need normalized values (0-100) for TOS, so normalize the data before storing
        if (series.data.length > 0) {
          // Use cached trend data (already normalized) - batch insert
          const snapshots = series.data.map(point => ({
            query_id: resolvedEntry.queryId!,
            date: point.date instanceof Date ? point.date : new Date(point.date),
            interest_value: point.value, // Normalized value for TOS calculation
            window: '90d' as const,
            region: 'US' as const, // Always US since we only search US now
          }));
          await storage.addTrendSnapshotsBatch(snapshots);
          console.log(`  ✓ Snapshots stored for TOS calculation (${snapshots.length} points from cached trend data)`);
        } else if (useDataForSEO && dataForSEOData?.monthly_searches && dataForSEOData.monthly_searches.length > 0) {
          // Normalize DataForSEO search volumes to 0-100 scale for TOS calculation
          const searchVolumes = dataForSEOData.monthly_searches.map(m => m.search_volume);
          const maxVolume = Math.max(...searchVolumes);
          const minVolume = Math.min(...searchVolumes);
          const range = maxVolume - minVolume;
          
          // Convert monthly data to daily snapshots (same as chart data)
          const dailyData = monthlyToDailyData(dataForSEOData.monthly_searches);
          
          // Batch insert all snapshots at once
          const snapshots = dailyData.map(point => {
            // Normalize to 0-100 scale
            const normalizedValue = range > 0 
              ? ((point.value - minVolume) / range) * 100 
              : 50; // Default to 50 if all values are the same
            
            return {
              query_id: resolvedEntry.queryId!,
              date: point.date,
              interest_value: normalizedValue, // Normalized value for TOS calculation
              window: '90d' as const,
              region: 'US' as const, // Always US since we only search US now
            };
          });
          await storage.addTrendSnapshotsBatch(snapshots);
          console.log(`  ✓ Snapshots stored for TOS calculation (${snapshots.length} points from DataForSEO data, normalized)`);
        } else {
          console.warn('  ⚠️ No trend snapshots to store (no data available)');
        }
      } else {
        console.warn(`  ⚠️ No query ID found - skipping snapshot storage but still returning chart data`);
      }

      // Add to interestOverTime for chart display (using DataForSEO if available, otherwise cached data)
      interestOverTime.push({
        query: queryText, // Use query name without region suffix
        window: '90d' as const,
        data: chartData,
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

    // Calculate TOS scores for all queries that have data (for Opportunity v2 momentum calculation)
    // Note: We still calculate TOS but don't return it in the response - it's only used internally for Opportunity scores
    const queryIdsWithData = resolved
      .filter(r => r.queryId)
      .map(r => r.queryId!);
    
    if (queryIdsWithData.length > 0) {
      try {
        // Calculate TOS for 90d window and store in database (used by Opportunity v2)
        const scores = await calculateTOSForQueries(queryIdsWithData, '90d', storage);
        
        // Store scores in database (for Opportunity v2 momentum calculation)
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
      } catch (error) {
        console.error('Error calculating TOS scores (for Opportunity v2):', error);
      }
    }

    // Fetch and store related topics and PAA data for EACH query individually
    // This ensures each query gets its own specific related topics and PAA questions
    // BUT only if they don't already exist in the database
    const storagePromises: Promise<void>[] = [];
    
    // Import functions for fetching intent data
    const { getRelatedTopics } = await import('@/app/lib/trends');
    const { getPeopleAlsoAsk } = await import('@/app/lib/search-intent');
    
    // Process each resolved query individually
    for (const resolvedItem of resolved) {
      if (!resolvedItem.queryId || !resolvedItem.originalQuery) continue;
      
      // Check if related topics already exist in database
      const existingTopics = await storage.getRelatedTopics(resolvedItem.queryId);
      if (existingTopics.length === 0) {
        // Only fetch if we don't have cached data
        try {
          const queryRelatedTopics = await getRelatedTopics(resolvedItem.originalQuery);
          if (queryRelatedTopics.length > 0) {
            console.log(`[Trends API] Storing ${queryRelatedTopics.length} related topics for query ${resolvedItem.queryId} (${resolvedItem.originalQuery})`);
            storagePromises.push(
              storage.saveRelatedTopics(resolvedItem.queryId, queryRelatedTopics.map(t => {
                // Ensure value is a number - handle "Breakout" and other string values
                let numericValue: number = typeof t.value === 'number' ? t.value : 0;
                const valueStr = String(t.value || '');
                if (valueStr.toLowerCase() === 'breakout' || valueStr.includes('%')) {
                  numericValue = 100; // High value for breakout topics
                } else if (typeof t.value === 'string') {
                  const parsed = parseFloat(t.value);
                  numericValue = isNaN(parsed) ? 0 : parsed;
                }
                return {
                  topic: t.topic,
                  value: numericValue,
                  is_rising: t.isRising,
                  link: t.link,
                };
              })).catch(err => {
                console.warn(`Error storing related topics for query ${resolvedItem.queryId}:`, err);
              })
            );
          }
        } catch (error) {
          console.warn(`Error fetching related topics for query ${resolvedItem.originalQuery}:`, error);
        }
      } else {
        console.log(`[Trends API] Using cached ${existingTopics.length} related topics for query ${resolvedItem.queryId} (${resolvedItem.originalQuery})`);
      }
      
      // Check if PAA questions already exist in database
      const existingQuestions = await storage.getRelatedQuestions(resolvedItem.queryId);
      if (existingQuestions.length === 0) {
        // Only fetch if we don't have cached data
        try {
          const queryPaa = await getPeopleAlsoAsk(resolvedItem.originalQuery);
          if (queryPaa.length > 0) {
            console.log(`[Trends API] Storing ${queryPaa.length} PAA questions for query ${resolvedItem.queryId} (${resolvedItem.originalQuery})`);
            storagePromises.push(
              storage.savePeopleAlsoAsk(resolvedItem.queryId, queryPaa.map(p => ({
                question: p.question,
                answer: p.answer,
                snippet: p.snippet,
                title: p.title,
                link: p.link,
              }))).catch(err => {
                console.warn(`Error storing PAA data for query ${resolvedItem.queryId}:`, err);
              })
            );
          }
        } catch (error) {
          console.warn(`Error fetching PAA for query ${resolvedItem.originalQuery}:`, error);
        }
      } else {
        console.log(`[Trends API] Using cached ${existingQuestions.length} PAA questions for query ${resolvedItem.queryId} (${resolvedItem.originalQuery})`);
      }
    }

    // Wait for storage to complete before aggregating clusters
    if (storagePromises.length > 0) {
      await Promise.all(storagePromises);
      console.log('[Trends API] Related topics and PAA data stored successfully');
    }

    // Update clusters with aggregated intent data (async, don't wait)
    // Find all clusters that contain the queries we just updated
    if (resolved.length > 0) {
      const queryIds = resolved.filter(r => r.queryId).map(r => r.queryId!);
      if (queryIds.length > 0) {
        // Get all clusters and update those that contain these queries
        storage.getAllClusters().then(clusters => {
          for (const cluster of clusters) {
            const hasMatchingQuery = cluster.queries.some(qId => queryIds.includes(qId));
            if (hasMatchingQuery) {
              // Aggregate and update cluster intent data
              storage.aggregateClusterIntentData(cluster.id).catch(err => 
                console.warn(`Error updating cluster ${cluster.id} intent data:`, err)
              );
            }
          }
        }).catch(err => console.warn('Error updating clusters with intent data:', err));
      }
    }

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


// Trend data management using DataForSEO and cached data

export type TimeWindow = '90d';
export type GeoRegion = 'US';

export interface TrendsKeywordResolution {
  originalQuery: string;
  keywordUsed: string;
}

export interface TrendDataPoint {
  date: Date;
  value: number; // 0-100
}

export interface InterestOverTimeResult {
  query: string;
  data: TrendDataPoint[];
  window: TimeWindow;
  geo?: string; // Region code (e.g., 'US')
}

// Deprecated: Regional interest data is no longer available (was from SerpAPI)
export interface RegionalInterest {
  region: string;
  value: number;
}

// Deprecated: Related queries from Google Trends are no longer available (was from SerpAPI)
// Use RelatedTopic from DataForSEO SERP instead
export interface RelatedQuery {
  query: string;
  value: number;
  isRising: boolean;
}

// RelatedTopic interface is defined in storage.ts - import it when needed
export type RelatedTopic = {
  topic: string;
  value: number;
  isRising: boolean;
  link?: string;
};

export interface TrendResult {
  interestOverTime: InterestOverTimeResult[];
  regionalInterest?: RegionalInterest[]; // Deprecated: Always undefined (was from SerpAPI)
  relatedQueries?: RelatedQuery[]; // Deprecated: Always undefined (was from SerpAPI)
  relatedTopics?: RelatedTopic[]; // From DataForSEO SERP
  peopleAlsoAsk?: import('./search-intent').PeopleAlsoAskResponse[]; // From DataForSEO SERP
}

// Note: getInterestOverTime() was removed - it's no longer needed.
// Trend data now comes from DataForSEO via the trends API route.

/**
 * Fetch related searches using DataForSEO SERP API
 * DataForSEO provides both "Related Searches" and "People Also Search For" sections
 */
export async function getRelatedTopics(
  keyword: string
): Promise<RelatedTopic[]> {
  try {
    const { getRelatedTopicsFromSerp, isDataForSEOConfigured } = await import('./dataforseo-serp');
    if (isDataForSEOConfigured()) {
      const dataForSEOTopics = await getRelatedTopicsFromSerp(keyword, 'US');
      if (dataForSEOTopics.length > 0) {
        console.log(`[Related Topics] Using DataForSEO SERP: ${dataForSEOTopics.length} topics for "${keyword}"`);
        return dataForSEOTopics;
      }
    } else {
      console.warn('DataForSEO is not configured. Related topics will not be available.');
    }
  } catch (error) {
    console.warn(`[Related Topics] DataForSEO SERP failed for "${keyword}":`, error instanceof Error ? error.message : String(error));
  }
  return [];
}

/**
 * Fetch comprehensive trend data for a query with caching support
 * 
 * CACHING: This function checks the database first for cached trend data.
 * If cached data exists for all queries in a window/region combination, it uses that data.
 * 
 * NOTE: New trend data should be fetched via DataForSEO historical keyword data
 * through the trends API route. This function only returns cached data.
 */
export async function getTrendData(
  keyword: string | string[],
  windows: TimeWindow[] = ['90d'],
  includeRegional: boolean = true,
  includeRelated: boolean = true,
  regions: GeoRegion[] = ['US'],
  queryIdMap?: Map<string, string>, // Optional map of query text -> query ID for cache lookup
  forceRefresh: boolean = false // Set to true to force refresh (currently only uses cache)
): Promise<TrendResult> {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  
  console.log('=== getTrendData called ===');
  console.log('Keywords received:', JSON.stringify(keywords, null, 2));
  console.log('Number of keywords:', keywords.length);
  console.log('Windows:', windows);
  console.log('Regions:', regions);
  console.log('Force refresh:', forceRefresh);
  console.log('NOTE: Checking cache first. New data should come from DataForSEO via trends API route.');
  
  const interestOverTime: InterestOverTimeResult[] = [];

  // Import storage here to avoid circular dependencies
  const { storage } = await import('./storage');

  // Process all window/region combinations in parallel for better performance
  const windowRegionTasks = regions.flatMap(region => 
    windows.map(window => ({ region, window }))
  );

  // Process all windows in parallel
  const windowResults = await Promise.all(
    windowRegionTasks.map(async ({ region, window }) => {
      try {
        // Batch check cache for all queries at once
        let useCache = !forceRefresh && queryIdMap !== undefined && queryIdMap.size > 0;
        let missingQueries: string[] = [];
        let cachedData: InterestOverTimeResult[] = [];

        if (useCache && queryIdMap) {
          // Use batch cache check for better performance
          const dbStorage = storage as any;
          if (typeof dbStorage.batchHasCachedTrendData === 'function') {
            const cacheResults = await dbStorage.batchHasCachedTrendData(queryIdMap, window, region);
            
            // Check which queries have cache and which don't
            for (const queryText of keywords) {
              const hasCache = cacheResults.get(queryText);
              if (hasCache) {
                const queryId = queryIdMap.get(queryText);
                if (queryId) {
                  const cached = await dbStorage.getCachedTrendData(queryText, queryId, window, region);
                  if (cached && cached.data.length > 0) {
                    cachedData.push(cached);
                    console.log(`✓ Using cached data for "${queryText}" (${window}, ${region}): ${cached.data.length} points`);
                  } else {
                    missingQueries.push(queryText);
                  }
                } else {
                  missingQueries.push(queryText);
                }
              } else {
                missingQueries.push(queryText);
              }
            }
          } else {
            // Fallback to individual checks if batch method doesn't exist
            for (const queryText of keywords) {
              const queryId = queryIdMap.get(queryText);
              if (queryId && typeof dbStorage.hasCachedTrendData === 'function') {
                const hasCache = await dbStorage.hasCachedTrendData(queryId, window, region);
                if (hasCache) {
                  const cached = await dbStorage.getCachedTrendData(queryText, queryId, window, region);
                  if (cached && cached.data.length > 0) {
                    cachedData.push(cached);
                  } else {
                    missingQueries.push(queryText);
                  }
                } else {
                  missingQueries.push(queryText);
                }
              } else {
                missingQueries.push(queryText);
              }
            }
          }

          // If we have cached data for all queries, use it
          if (cachedData.length === keywords.length && missingQueries.length === 0) {
            console.log(`✓ Using cached trend snapshot data for all ${keywords.length} queries (${window}, ${region})`);
            return cachedData; // Return cached data
          } else if (missingQueries.length > 0) {
            console.log(`⚠️ Missing cached trend snapshot data for ${missingQueries.length} queries:`, missingQueries);
            console.log(`  Note: This is expected if monthly_searches data exists. The trends API route will use cached monthly_searches instead.`);
          }
        }

        // If cache is disabled or incomplete, return empty data
        // New data should be fetched via DataForSEO through the trends API route
        // NOTE: This is normal - the trends API route will use cached monthly_searches from ads_keyword_metrics
        if (!useCache || missingQueries.length > 0 || forceRefresh) {
          console.log(`[getTrendData] No cached trend snapshot data available (this is OK - trends API route will use cached monthly_searches if available)`);
          // Return empty results for missing queries
          return keywords.map(k => ({
            query: k,
            data: [],
            window,
            geo: region,
          }));
        }

        return [];
      } catch (error) {
        console.error(`Error fetching ${window} data for region ${region}:`, error);
        return [];
      }
    })
  );

  // Flatten results from all parallel tasks
  windowResults.forEach(result => {
    interestOverTime.push(...result);
  });
  
  console.log(`Total interestOverTime series: ${interestOverTime.length}`);

  // Regional interest is no longer available (deprecated with SerpAPI removal)
  const regionalInterest: RegionalInterest[] | undefined = undefined;

  // Related queries are no longer available (deprecated with SerpAPI removal)
  // Use getRelatedTopics() for related search topics from DataForSEO SERP instead
  const relatedQueries: RelatedQuery[] | undefined = undefined;

  // NOTE: Related topics and PAA questions are now handled by the trends API route
  // which checks the database cache first before fetching from DataForSEO.
  // We don't fetch them here to avoid redundant API calls.
  // The trends API route will fetch and store them if needed.
  const relatedTopics: RelatedTopic[] | undefined = undefined;
  const peopleAlsoAsk: import('./search-intent').PeopleAlsoAskResponse[] | undefined = undefined;

  return {
    interestOverTime,
    regionalInterest,
    relatedQueries,
    relatedTopics,
    peopleAlsoAsk,
  };
}

/**
 * Normalize trend data to 0-100 scale
 * 
 * Note: DataForSEO provides actual search volumes (not normalized).
 * This function can normalize search volumes to 0-100 scale if needed.
 */
export function normalizeTrendData(data: TrendDataPoint[]): TrendDataPoint[] {
  if (data.length === 0) return data;

  const maxValue = Math.max(...data.map(d => d.value));
  if (maxValue === 0) return data;

  // If values are already in 0-100 range, assume they're already normalized
  if (maxValue <= 100) return data;

  // Normalize larger values (e.g., search volumes) to 0-100 scale
  return data.map(point => ({
    ...point,
    value: (point.value / maxValue) * 100,
  }));
}

/**
 * Normalize multiple trend series relative to each other for proper comparison
 * This ensures that when comparing terms from different data sources, they are normalized
 * relative to the highest value across all series in the same time window and region.
 */
export function normalizeSeriesRelative(
  series: InterestOverTimeResult[],
  window: TimeWindow,
  geo?: string
): InterestOverTimeResult[] {
  // Only normalize series that match the same window and region
  const filteredSeries = series.filter(s => 
    s.window === window && (geo ? s.geo === geo : true)
  );

  if (filteredSeries.length <= 1) {
    // No need to normalize if there's only one or no series
    return series;
  }

  // Find the maximum value across all data points in these series
  let globalMax = 0;
  filteredSeries.forEach(s => {
    s.data.forEach(point => {
      if (point.value > globalMax) {
        globalMax = point.value;
      }
    });
  });

  if (globalMax === 0) return series;

  // Normalize all series relative to the global max
  // This ensures proper comparison when terms were queried separately
  return series.map(s => {
    if (s.window === window && (geo ? s.geo === geo : true)) {
      return {
        ...s,
        data: s.data.map(point => ({
          ...point,
          value: (point.value / globalMax) * 100,
        })),
      };
    }
    return s;
  });
}

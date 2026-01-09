// Google Trends API wrapper using SerpApi

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

export interface RegionalInterest {
  region: string;
  value: number;
}

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
  regionalInterest?: RegionalInterest[];
  relatedQueries?: RelatedQuery[];
  relatedTopics?: RelatedTopic[];
  peopleAlsoAsk?: import('./search-intent').PeopleAlsoAskResponse[];
}

/**
 * Convert time window to SerpApi date format
 */
function getSerpApiDate(window: TimeWindow): string {
  // Only 90d window supported
  return 'today 3-m'; // 3 months = ~90 days
}

/**
 * Fetch interest over time for a query using SerpApi
 * 
 * IMPORTANT: When multiple keywords are provided, they are queried together in a single API call.
 * Google Trends normalizes the results relative to each other - the term with the highest 
 * average interest gets a score of 100, and other terms are scaled relative to it.
 * 
 * This means:
 * - Scores are relative within the comparison set, not absolute search volumes
 * - A term with score 50 means it has half the average interest of the highest-scoring term
 * - To compare terms properly, always query them together in the same call
 * 
 * @param keyword - Single keyword or array of keywords to compare
 * @param window - Time window for the data
 * @param geo - Geographic region
 * @returns Array of InterestOverTimeResult, one per keyword
 */
export async function getInterestOverTime(
  keyword: string | string[],
  window: TimeWindow = '90d',
  geo: GeoRegion = 'US'
): Promise<InterestOverTimeResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured');
  }

  try {
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    const date = getSerpApiDate(window);

    console.log(`Fetching interest over time for: ${keywords.join(', ')} (${window}, geo: ${geo})`);

    // SerpApi supports multiple keywords in a single query (comma-separated)
    const queryString = keywords.join(', ');

    const params = new URLSearchParams({
      engine: 'google_trends',
      q: queryString,
      api_key: apiKey,
      date: date,
      geo: geo,
      data_type: 'TIMESERIES',
      // Enable Ludicrous Speed mode for faster responses
      ludicrous: '1',
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    console.log(`SerpApi URL: ${url.replace(apiKey, '***')}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SerpApi request failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Check for errors in response
    if (data.error) {
      throw new Error(`SerpApi error: ${data.error}`);
    }

    console.log('SerpApi response received:', {
      hasInterestOverTime: !!data.interest_over_time,
      timelineDataLength: data.interest_over_time?.timeline_data?.length || 0,
    });

    const timelineData = data.interest_over_time?.timeline_data || [];

    if (timelineData.length === 0) {
      console.warn(`No timeline data returned for ${keywords.join(', ')} (geo: ${geo})`);
      return keywords.map((kw) => ({
        query: kw, // Remove region suffix since we only search US
        data: [],
        window,
        geo,
      }));
    }

    // Process timeline data
    // SerpApi returns data in format: { date, timestamp, values: [{ query, value, extracted_value }] }
    return keywords.map((kw, index) => {
      const data: TrendDataPoint[] = timelineData.map((point: any) => {
        // Find the value for this keyword in the values array
        let value = 0;
        if (point.values && Array.isArray(point.values)) {
          // If multiple keywords, find the one matching this keyword
          const keywordValue = point.values.find((v: any) => 
            v.query?.toLowerCase() === kw.toLowerCase()
          );
          const rawValue = keywordValue?.extracted_value || keywordValue?.value || 0;
          
          // If not found by query name, use index
          const rawValueByIndex = point.values[index]?.extracted_value || point.values[index]?.value || 0;
          const finalRawValue = rawValue || rawValueByIndex;
          
          // Parse value - SerpAPI may return strings like "<1" for very low values
          if (typeof finalRawValue === 'string') {
            // Handle "<1" format - parse as 0.5 or 1
            if (finalRawValue.startsWith('<')) {
              value = 0.5; // Use 0.5 for "<1" values
            } else {
              value = parseFloat(finalRawValue) || 0;
            }
          } else {
            value = Number(finalRawValue) || 0;
          }
        }

        // Parse timestamp (can be string or number)
        const timestamp = typeof point.timestamp === 'string' 
          ? parseInt(point.timestamp, 10) 
          : point.timestamp;
        
        return {
          date: new Date(timestamp * 1000),
          value: value,
        };
      });

      console.log(`Processed ${data.length} data points for ${kw} (geo: ${geo})`);

      // Only include region suffix if there are multiple regions
      // Since we only search US now, use query name without region suffix
      return {
        query: kw, // Remove region suffix since we only search US
        data,
        window,
        geo,
      };
    });
  } catch (error) {
    console.error(`Error fetching interest over time for ${keyword} (geo: ${geo}):`, error);
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    return keywords.map((kw) => ({
      query: kw, // Remove region suffix since we only search US
      data: [],
      window,
      geo,
    }));
  }
}

/**
 * Fetch interest by region using SerpApi
 * Returns empty array on error (graceful degradation)
 */
export async function getInterestByRegion(
  keyword: string,
  geo: GeoRegion = 'US'
): Promise<RegionalInterest[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn('SERPAPI_API_KEY is not configured, skipping regional interest');
    return [];
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_trends',
      q: keyword,
      api_key: apiKey,
      date: 'today 12-m',
      geo: geo,
      data_type: 'GEO_MAP',
      // Enable Ludicrous Speed mode for faster responses
      ludicrous: '1',
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      // Return empty array instead of throwing - regional data is optional
      console.warn(`SerpApi request failed for regional interest: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.error) {
      // Return empty array instead of throwing - regional data is optional
      console.warn(`SerpApi error for regional interest: ${data.error}`);
      return [];
    }

    // SerpApi returns compared_breakdown_by_region or interest_by_region
    const regionData = data.compared_breakdown_by_region || data.interest_by_region || [];

    return regionData.map((item: any) => {
      const rawValue = item.values?.[0]?.extracted_value || item.values?.[0]?.value || 0;
      let value: number;
      
      // Parse value - SerpAPI may return strings like "<1"
      if (typeof rawValue === 'string') {
        if (rawValue.startsWith('<')) {
          value = 0.5; // Use 0.5 for "<1" values
        } else {
          value = parseFloat(rawValue) || 0;
        }
      } else {
        value = Number(rawValue) || 0;
      }
      
      return {
        region: item.location || item.geo || item.region || 'Unknown',
        value,
      };
    });
  } catch (error) {
    // Return empty array instead of throwing - regional data is optional
    console.warn(`Error fetching interest by region for ${keyword}:`, error);
    return [];
  }
}

/**
 * Fetch related topics using SerpApi
 */
export async function getRelatedTopics(
  keyword: string
): Promise<RelatedTopic[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured');
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_trends',
      q: keyword,
      api_key: apiKey,
      date: 'today 12-m',
      data_type: 'RELATED_TOPICS',
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpApi request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`SerpApi error: ${data.error}`);
    }

    // SerpApi returns related_topics with rising and top arrays
    const risingTopics = data.related_topics?.rising || [];
    const topTopics = data.related_topics?.top || [];

    // Helper to parse value - SERPAPI may return "Breakout" or other strings
    const parseTopicValue = (rawValue: any): number => {
      if (typeof rawValue === 'number') {
        return rawValue;
      }
      if (typeof rawValue === 'string') {
        // Handle "Breakout" or other special strings
        if (rawValue.toLowerCase() === 'breakout' || rawValue.toLowerCase() === '+5000%') {
          return 100; // High value for breakout topics
        }
        // Try to parse as number
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
      // Try extracted_value as fallback
      return 0;
    };

    // Helper to extract topic title - SERPAPI returns nested objects
    const extractTopicTitle = (item: any): string => {
      // Check for nested topic.title (most common SERPAPI format)
      if (item.topic && typeof item.topic === 'object' && item.topic.title) {
        return item.topic.title;
      }
      // Check for direct topic string
      if (item.topic && typeof item.topic === 'string') {
        return item.topic;
      }
      // Fallback to title
      if (item.title && typeof item.title === 'string') {
        return item.title;
      }
      // Fallback to query
      if (item.query && typeof item.query === 'string') {
        return item.query;
      }
      return '';
    };

    const related: RelatedTopic[] = [
      ...risingTopics.map((item: any) => ({
        topic: extractTopicTitle(item),
        value: parseTopicValue(item.value || item.extracted_value),
        isRising: true,
        link: item.link || (item.topic && item.topic.serpapi_link) || undefined,
      })),
      ...topTopics.map((item: any) => ({
        topic: extractTopicTitle(item),
        value: parseTopicValue(item.value || item.extracted_value),
        isRising: false,
        link: item.link || (item.topic && item.topic.serpapi_link) || undefined,
      })),
    ];

    // Filter out empty topics
    return related.filter(t => t.topic);
  } catch (error) {
    console.error(`Error fetching related topics for ${keyword}:`, error);
    return [];
  }
}

/**
 * Fetch related queries using SerpApi
 */
export async function getRelatedQueries(
  keyword: string
): Promise<RelatedQuery[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured');
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_trends',
      q: keyword,
      api_key: apiKey,
      date: 'today 12-m',
      data_type: 'RELATED_QUERIES',
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpApi request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`SerpApi error: ${data.error}`);
    }

    // SerpApi returns related_queries with rising and top arrays
    const risingQueries = data.related_queries?.rising || [];
    const topQueries = data.related_queries?.top || [];

    const related: RelatedQuery[] = [
      ...risingQueries.map((item: any) => ({
        query: item.query || item.term || '',
        value: item.value || item.extracted_value || 0,
        isRising: true,
      })),
      ...topQueries.map((item: any) => ({
        query: item.query || item.term || '',
        value: item.value || item.extracted_value || 0,
        isRising: false,
      })),
    ];

    return related.filter(q => q.query); // Filter out empty queries
  } catch (error) {
    console.error(`Error fetching related queries for ${keyword}:`, error);
    return [];
  }
}

/**
 * Fetch comprehensive trend data for a query with caching support
 * 
 * CRITICAL: When multiple keywords are provided, they are ALL queried together in each API call.
 * This ensures Google Trends normalizes them relative to each other, enabling proper comparison.
 * 
 * For each time window and region combination:
 * - All keywords are sent in a single API call
 * - Google Trends returns normalized scores where the highest-scoring term gets 100
 * - Other terms are scaled relative to that peak
 * 
 * This means scores are comparable WITHIN each window/region combination, but may vary
 * across different time windows or regions (as search patterns change).
 * 
 * CACHING: This function now checks the database first. If cached data exists for all queries
 * in a window/region combination, it uses that data instead of calling SerpAPI.
 * Only missing or incomplete data is fetched from SerpAPI.
 */
export async function getTrendData(
  keyword: string | string[],
  windows: TimeWindow[] = ['90d'],
  includeRegional: boolean = true,
  includeRelated: boolean = true,
  regions: GeoRegion[] = ['US'],
  queryIdMap?: Map<string, string>, // Optional map of query text -> query ID for cache lookup
  forceRefresh: boolean = false // Set to true to force refresh from SerpAPI
): Promise<TrendResult> {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  
  console.log('=== getTrendData called ===');
  console.log('Keywords received:', JSON.stringify(keywords, null, 2));
  console.log('Number of keywords:', keywords.length);
  console.log('Windows:', windows);
  console.log('Regions:', regions);
  console.log('Force refresh:', forceRefresh);
  console.log('NOTE: Checking cache first, then fetching missing data from SerpAPI if needed');
  
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
            console.log(`✓ Using cached data for all ${keywords.length} queries (${window}, ${region})`);
            return cachedData; // Return cached data, skip SerpAPI call
          } else if (missingQueries.length > 0) {
            console.log(`⚠️ Missing cached data for ${missingQueries.length} queries:`, missingQueries);
            console.log(`  Will fetch all ${keywords.length} queries together from SerpAPI for proper normalization`);
          }
        }

        // Fetch from SerpAPI (either because cache is disabled, incomplete, or force refresh)
        if (!useCache || missingQueries.length > 0 || forceRefresh) {
          console.log(`Fetching ${window} data for keywords:`, keywords, `(region: ${region})`);
          // All keywords queried together = normalized relative to each other
          const windowData = await getInterestOverTime(keywords, window, region);
          console.log(`${window} (${region}) returned ${windowData.length} series:`, windowData.map(s => ({
            query: s.query,
            dataPoints: s.data.length
          })));
          return windowData;
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

  // Fetch regional interest (only for first keyword if multiple, and for US by default)
  // getInterestByRegion now handles errors gracefully and returns empty array
  let regionalInterest: RegionalInterest[] | undefined;
  if (includeRegional && keywords.length > 0) {
    regionalInterest = await getInterestByRegion(keywords[0], 'US');
    if (regionalInterest.length === 0) {
      regionalInterest = undefined; // Don't include empty array in response
    }
  }

  // Fetch related queries for ALL keywords (not just first)
  let relatedQueries: RelatedQuery[] | undefined;
  if (includeRelated && keywords.length > 0) {
    try {
      // Fetch for all keywords and combine
      const allRelatedQueries = await Promise.all(
        keywords.map(keyword => getRelatedQueries(keyword).catch(() => []))
      );
      // Combine and deduplicate by query text
      const queryMap = new Map<string, RelatedQuery>();
      allRelatedQueries.flat().forEach(q => {
        const key = q.query.toLowerCase();
        if (!queryMap.has(key) || q.isRising) {
          queryMap.set(key, q);
        }
      });
      relatedQueries = Array.from(queryMap.values());
      if (relatedQueries.length === 0) {
        relatedQueries = undefined;
      }
    } catch (error) {
      console.error('Error fetching related queries:', error);
    }
  }

  // Fetch related topics for ALL keywords (not just first)
  let relatedTopics: RelatedTopic[] | undefined;
  if (includeRelated && keywords.length > 0) {
    try {
      // Fetch for all keywords and combine
      const allRelatedTopics = await Promise.all(
        keywords.map(keyword => getRelatedTopics(keyword).catch(() => []))
      );
      // Combine and deduplicate by topic text, prefer rising topics
      const topicMap = new Map<string, RelatedTopic>();
      allRelatedTopics.flat().forEach(t => {
        // Ensure t.topic is a valid string
        if (!t || !t.topic || typeof t.topic !== 'string') return;
        const key = t.topic.toLowerCase();
        const existing = topicMap.get(key);
        if (!existing || t.isRising || t.value > existing.value) {
          topicMap.set(key, t);
        }
      });
      relatedTopics = Array.from(topicMap.values());
      if (relatedTopics.length === 0) {
        relatedTopics = undefined; // Don't include empty array in response
      }
    } catch (error) {
      console.error('Error fetching related topics:', error);
    }
  }

  // Fetch People Also Ask questions for ALL keywords (not just first)
  let peopleAlsoAsk: import('./search-intent').PeopleAlsoAskResponse[] | undefined;
  if (includeRelated && keywords.length > 0) {
    try {
      const { getPeopleAlsoAsk } = await import('./search-intent');
      // Fetch for all keywords and combine
      const allPaaData = await Promise.all(
        keywords.map(keyword => getPeopleAlsoAsk(keyword).catch(() => []))
      );
      // Combine and deduplicate by question text
      const questionMap = new Map<string, import('./search-intent').PeopleAlsoAskResponse>();
      allPaaData.flat().forEach(p => {
        // Ensure p.question is a valid string
        if (!p || !p.question || typeof p.question !== 'string') return;
        const key = p.question.toLowerCase();
        if (!questionMap.has(key)) {
          questionMap.set(key, p);
        }
      });
      const combinedPaa = Array.from(questionMap.values());
      if (combinedPaa.length > 0) {
        peopleAlsoAsk = combinedPaa;
      }
    } catch (error) {
      console.error('Error fetching People Also Ask:', error);
    }
  }

  return {
    interestOverTime,
    regionalInterest,
    relatedQueries,
    relatedTopics,
    peopleAlsoAsk,
  };
}

/**
 * Normalize trend data to 0-100 scale (already normalized by Google Trends, but ensure consistency)
 * 
 * IMPORTANT: Google Trends data is already normalized:
 * - When multiple terms are queried together, they are normalized relative to each other
 * - The term with highest average interest gets 100, others are scaled relative to it
 * - This allows for proper comparison between terms in the same query
 * - Do NOT re-normalize data that comes from a multi-term query, as it breaks the relative comparison
 */
export function normalizeTrendData(data: TrendDataPoint[]): TrendDataPoint[] {
  if (data.length === 0) return data;

  const maxValue = Math.max(...data.map(d => d.value));
  if (maxValue === 0) return data;

  // Google Trends already normalizes to 0-100 when terms are queried together
  // Only normalize if values are clearly outside this range (likely an error or different source)
  if (maxValue <= 100) return data;

  // Otherwise normalize (shouldn't happen with proper Google Trends data)
  return data.map(point => ({
    ...point,
    value: (point.value / maxValue) * 100,
  }));
}

/**
 * Normalize multiple trend series relative to each other for proper comparison
 * This ensures that when comparing terms from different API calls, they are normalized
 * relative to the highest value across all series in the same time window and region.
 * 
 * CRITICAL: This should only be used when terms were NOT queried together in the same API call.
 * When terms are queried together, Google Trends already normalizes them correctly.
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

// Google Trends API wrapper using SerpApi

export type TimeWindow = '30d' | '90d' | '12m';
export type GeoRegion = 'US' | 'CA';

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
  geo?: string; // Region code (e.g., 'US', 'CA')
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

export interface TrendResult {
  interestOverTime: InterestOverTimeResult[];
  regionalInterest?: RegionalInterest[];
  relatedQueries?: RelatedQuery[];
}

/**
 * Convert time window to SerpApi date format
 */
function getSerpApiDate(window: TimeWindow): string {
  switch (window) {
    case '30d':
      return 'now 30-d';
    case '90d':
      return 'now 90-d';
    case '12m':
      return 'today 12-m';
    default:
      return 'today 12-m';
  }
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
  window: TimeWindow = '12m',
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
        query: `${kw} (${geo})`,
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
          value = keywordValue?.extracted_value || keywordValue?.value || 0;
          
          // If not found by query name, use index
          if (value === 0 && point.values[index]) {
            value = point.values[index].extracted_value || point.values[index].value || 0;
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

      return {
        query: `${kw} (${geo})`,
        data,
        window,
        geo,
      };
    });
  } catch (error) {
    console.error(`Error fetching interest over time for ${keyword} (geo: ${geo}):`, error);
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    return keywords.map((kw) => ({
      query: `${kw} (${geo})`,
      data: [],
      window,
      geo,
    }));
  }
}

/**
 * Fetch interest by region using SerpApi
 */
export async function getInterestByRegion(
  keyword: string,
  geo: GeoRegion = 'US'
): Promise<RegionalInterest[]> {
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
      geo: geo,
      data_type: 'GEO_MAP',
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

    // SerpApi returns compared_breakdown_by_region or interest_by_region
    const regionData = data.compared_breakdown_by_region || data.interest_by_region || [];

    return regionData.map((item: any) => ({
      region: item.location || item.geo || item.region || 'Unknown',
      value: item.values?.[0]?.extracted_value || item.values?.[0]?.value || 0,
    }));
  } catch (error) {
    console.error(`Error fetching interest by region for ${keyword}:`, error);
    throw error;
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
 * Fetch comprehensive trend data for a query
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
 */
export async function getTrendData(
  keyword: string | string[],
  windows: TimeWindow[] = ['30d', '90d', '12m'],
  includeRegional: boolean = true,
  includeRelated: boolean = true,
  regions: GeoRegion[] = ['US', 'CA']
): Promise<TrendResult> {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  
  console.log('=== getTrendData called ===');
  console.log('Keywords received:', JSON.stringify(keywords, null, 2));
  console.log('Number of keywords:', keywords.length);
  console.log('Windows:', windows);
  console.log('Regions:', regions);
  console.log('NOTE: All keywords will be queried together for proper comparison within each window/region');
  
  const interestOverTime: InterestOverTimeResult[] = [];

  // Fetch interest over time for each window and region
  // IMPORTANT: All keywords are passed together in each call to ensure proper normalization
  for (const region of regions) {
    for (const window of windows) {
      try {
        console.log(`Fetching ${window} data for keywords:`, keywords, `(region: ${region})`);
        // All keywords queried together = normalized relative to each other
        const windowData = await getInterestOverTime(keywords, window, region);
        console.log(`${window} (${region}) returned ${windowData.length} series:`, windowData.map(s => ({
          query: s.query,
          dataPoints: s.data.length
        })));
        interestOverTime.push(...windowData);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error fetching ${window} data for region ${region}:`, error);
      }
    }
  }
  
  console.log(`Total interestOverTime series: ${interestOverTime.length}`);

  // Fetch regional interest (only for first keyword if multiple, and for US by default)
  let regionalInterest: RegionalInterest[] | undefined;
  if (includeRegional && keywords.length > 0) {
    try {
      regionalInterest = await getInterestByRegion(keywords[0], 'US');
    } catch (error) {
      console.error('Error fetching regional interest:', error);
    }
  }

  // Fetch related queries (only for first keyword if multiple)
  let relatedQueries: RelatedQuery[] | undefined;
  if (includeRelated && keywords.length > 0) {
    try {
      relatedQueries = await getRelatedQueries(keywords[0]);
    } catch (error) {
      console.error('Error fetching related queries:', error);
    }
  }

  return {
    interestOverTime,
    regionalInterest,
    relatedQueries,
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

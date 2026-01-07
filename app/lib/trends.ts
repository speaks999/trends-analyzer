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
  
  const interestOverTime: InterestOverTimeResult[] = [];

  // Fetch interest over time for each window and region
  for (const region of regions) {
    for (const window of windows) {
      try {
        console.log(`Fetching ${window} data for keywords:`, keywords, `(region: ${region})`);
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
 */
export function normalizeTrendData(data: TrendDataPoint[]): TrendDataPoint[] {
  if (data.length === 0) return data;

  const maxValue = Math.max(...data.map(d => d.value));
  if (maxValue === 0) return data;

  // If already normalized (max is 100), return as is
  if (maxValue <= 100) return data;

  // Otherwise normalize
  return data.map(point => ({
    ...point,
    value: (point.value / maxValue) * 100,
  }));
}

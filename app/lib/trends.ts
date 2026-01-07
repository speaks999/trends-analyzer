// Google Trends API wrapper

import googleTrends from 'google-trends-api';

export type TimeWindow = '30d' | '90d' | '12m';

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

const STOPWORDS = new Set([
  'how', 'to', 'fix', 'get', 'best', 'way', 'manage', 'why', 'is', 'low',
  'in', 'my', 'your', 'our', 'for', 'of', 'a', 'an', 'the', 'as', 'and', 'or',
  'during', 'with', 'without', 'on', 'at', 'from', 'into', 'this', 'that',
  'startup', 'business', 'company', 'founder', 'early', 'stage', 'early-stage',
]);

/**
 * Simplify a natural-language query into a keyword phrase more likely to have Trends data.
 * Example: "how to fix cash flow issues in my early-stage startup" -> "cash flow issues"
 */
export function simplifyTrendsKeyword(original: string): string {
  const cleaned = original
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common leading patterns
  const stripped = cleaned
    .replace(/^(how to|best way to|best practices for|why is|software for)\s+/i, '')
    .trim();

  const tokens = stripped
    .split(/\s+/)
    .filter(t => t.length > 1)
    .filter(t => !STOPWORDS.has(t));

  // Prefer known high-signal phrases if present
  const joined = tokens.join(' ');
  const prefer = [
    'cash flow',
    'customer acquisition',
    'sales follow up',
    'follow up',
    'churn',
    'pricing',
    'retention',
    'crm',
  ];
  for (const p of prefer) {
    if (joined.includes(p)) return p;
  }

  // Default: keep first 2-5 tokens
  const limited = tokens.slice(0, Math.min(5, Math.max(2, tokens.length))).join(' ');
  return limited || cleaned.slice(0, 50);
}

/**
 * Convert time window to start date
 */
function getStartDate(window: TimeWindow): Date {
  const now = new Date();
  switch (window) {
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '12m':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Fetch interest over time for a query
 */
export async function getInterestOverTime(
  keyword: string | string[],
  window: TimeWindow = '12m'
): Promise<InterestOverTimeResult[]> {
  try {
    const startTime = getStartDate(window);
    const keywords = Array.isArray(keyword) ? keyword : [keyword];

    console.log(`Fetching interest over time for: ${keywords.join(', ')} (${window})`);

    const results = await googleTrends.interestOverTime({
      keyword: keywords,
      startTime,
    });

    const parsed = JSON.parse(results);
    console.log('Parsed Google Trends response:', {
      hasDefault: !!parsed.default,
      hasTimelineData: !!parsed.default?.timelineData,
      timelineDataLength: parsed.default?.timelineData?.length || 0,
    });

    const timelineData = parsed.default?.timelineData || [];

    if (timelineData.length === 0) {
      console.warn(`No timeline data returned for ${keywords.join(', ')}`);
      // Return empty data instead of throwing
      return keywords.map((kw) => ({
        query: kw,
        data: [],
        window,
      }));
    }

    return keywords.map((kw, index) => {
      const data: TrendDataPoint[] = timelineData.map((point: any) => {
        // Handle both array and single value formats
        const value = Array.isArray(point.value) 
          ? (point.value[index] || point.value[0] || 0)
          : (point.value || 0);
        
        return {
          date: new Date(parseInt(point.time) * 1000),
          value: value,
        };
      });

      console.log(`Processed ${data.length} data points for ${kw}`);

      return {
        query: kw,
        data,
        window,
      };
    });
  } catch (error) {
    console.error(`Error fetching interest over time for ${keyword}:`, error);
    // Return empty data instead of throwing to prevent complete failure
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    return keywords.map((kw) => ({
      query: kw,
      data: [],
      window,
    }));
  }
}

/**
 * Fetch interest by region
 */
export async function getInterestByRegion(
  keyword: string,
  geo: string = 'US'
): Promise<RegionalInterest[]> {
  try {
    const results = await googleTrends.interestByRegion({
      keyword,
      geo,
    });

    const parsed = JSON.parse(results);
    const geoMapData = parsed.default?.geoMapData || [];

    return geoMapData.map((item: any) => ({
      region: item.geoName,
      value: item.value[0] || 0,
    }));
  } catch (error) {
    console.error(`Error fetching interest by region for ${keyword}:`, error);
    throw error;
  }
}

/**
 * Fetch related queries (rising only)
 */
export async function getRelatedQueries(
  keyword: string
): Promise<RelatedQuery[]> {
  try {
    const results = await googleTrends.relatedQueries({
      keyword,
    });

    const parsed = JSON.parse(results);
    const risingQueries = parsed.default?.rising || [];

    return risingQueries.map((item: any) => ({
      query: item.query,
      value: item.value || 0,
      isRising: true,
    }));
  } catch (error) {
    console.error(`Error fetching related queries for ${keyword}:`, error);
    // Return empty array on error rather than throwing
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
  includeRelated: boolean = true
): Promise<TrendResult> {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  const interestOverTime: InterestOverTimeResult[] = [];

  // Fetch interest over time for each window
  for (const window of windows) {
    try {
      const windowData = await getInterestOverTime(keywords, window);
      interestOverTime.push(...windowData);
    } catch (error) {
      console.error(`Error fetching ${window} data:`, error);
    }
  }

  // Fetch regional interest (only for first keyword if multiple)
  let regionalInterest: RegionalInterest[] | undefined;
  if (includeRegional && keywords.length > 0) {
    try {
      regionalInterest = await getInterestByRegion(keywords[0]);
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


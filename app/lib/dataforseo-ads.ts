// DataForSEO Keyword Data API client (server-side only).
// Provides keyword metrics including search volume, CPC, competition, and ad traffic data.
// Easier to get access - just sign up and get API credentials.
//
// Required env vars:
// - DATAFORSEO_LOGIN (your DataForSEO login/email)
// - DATAFORSEO_PASSWORD (your DataForSEO API password)
//
// Optional:
// - DATAFORSEO_API_VERSION (default: v3)
//
// Sign up at: https://dataforseo.com/
// API docs: https://docs.dataforseo.com/v3/keywords_data-google_ads-overview/

export type KeywordPlanNetwork = 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';

export type KeywordHistoricalMetrics = {
  text: string;
  avg_monthly_searches?: number;
  competition?: 'LOW' | 'MEDIUM' | 'HIGH';
  competition_index?: number;
  low_top_of_page_bid_micros?: number;
  high_top_of_page_bid_micros?: number;
  avg_cpc_micros?: number; // Average CPC from search volume endpoint
  monthly_searches?: HistoricalSearchVolumePoint[]; // Monthly search volume breakdown
  raw?: unknown;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function geoToLocationCode(geo: string): number {
  const trimmed = geo.trim().toUpperCase();
  // Common location codes (ISO 3166-1 alpha-2 to DataForSEO location_code)
  const locationMap: Record<string, number> = {
    US: 2840, // United States
    GB: 2826, // United Kingdom
    CA: 2124, // Canada
    AU: 2036, // Australia
    DE: 2276, // Germany
    FR: 250,  // France
    ES: 724,  // Spain
    IT: 380,  // Italy
    BR: 76,   // Brazil
    MX: 484,  // Mexico
    IN: 356,  // India
    JP: 392,  // Japan
    CN: 156,  // China
  };
  
  if (locationMap[trimmed]) {
    return locationMap[trimmed];
  }
  
  // Default to US if unknown
  console.warn(`Unknown geo code "${geo}", defaulting to US (2840)`);
  return 2840;
}

function languageToLanguageCode(languageCode: string): number {
  const trimmed = languageCode.trim().toLowerCase();
  // Common language codes (ISO 639-1 to DataForSEO language_code)
  const languageMap: Record<string, number> = {
    en: 1000, // English
    es: 1001, // Spanish
    fr: 1002, // French
    de: 1003, // German
    it: 1004, // Italian
    pt: 1005, // Portuguese
    ru: 1006, // Russian
    ja: 1007, // Japanese
    zh: 1008, // Chinese
    ko: 1009, // Korean
  };
  
  if (languageMap[trimmed]) {
    return languageMap[trimmed];
  }
  
  // Default to English if unknown
  console.warn(`Unknown language code "${languageCode}", defaulting to English (1000)`);
  return 1000;
}

function competitionToLevel(competitionIndex?: number): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
  if (competitionIndex === null || competitionIndex === undefined) return undefined;
  if (competitionIndex < 0.33) return 'LOW';
  if (competitionIndex < 0.66) return 'MEDIUM';
  return 'HIGH';
}

export function isDataForSEOConfigured(): boolean {
  return Boolean(
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
  );
}

export async function fetchKeywordHistoricalMetrics(params: {
  keywords: string[];
  geo?: string; // "US" or country code
  languageCode?: string; // "en" or language code
  network?: KeywordPlanNetwork;
}): Promise<KeywordHistoricalMetrics[]> {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  const apiVersion = (process.env.DATAFORSEO_API_VERSION || 'v3').trim();

  const keywords = (params.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return [];

  const locationCode = geoToLocationCode(params.geo || 'US');
  // DataForSEO recommends NOT using language_code as it can result in null values
  // We'll omit it unless explicitly needed
  // DataForSEO doesn't distinguish between GOOGLE_SEARCH and GOOGLE_SEARCH_AND_PARTNERS
  // They provide Google Search data by default

  // DataForSEO API endpoint
  const url = `https://api.dataforseo.com/${apiVersion}/keywords_data/google_ads/search_volume/live`;
  
  // DataForSEO expects an array with a single object containing keywords array
  // Format: [{ location_code: X, keywords: [...], date_from: "YYYY-MM-DD", search_partners: true/false }]
  // Note: Omitting language_code as recommended by DataForSEO to avoid null values
  // date_from: Start date for historical data (August 2021 is earliest available)
  // search_partners: Include search partner data (optional, defaults to false)
  const postData: any[] = [{
    location_code: locationCode,
    keywords: keywords,
    date_from: '2021-08-01', // Start from August 2021 (earliest available historical data)
    search_partners: false, // Only Google Search, not search partners
  }];

  // Basic auth for DataForSEO
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  console.log(`[DataForSEO] Requesting search volume for ${keywords.length} keywords:`, keywords);
  console.log(`[DataForSEO] Request payload:`, JSON.stringify(postData, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();
  
  console.log(`[DataForSEO] Response status: ${response.status}`);
  console.log(`[DataForSEO] Response structure:`, {
    hasTasks: Array.isArray(data.tasks),
    tasksLength: Array.isArray(data.tasks) ? data.tasks.length : 0,
    statusCode: data.status_code,
    statusMessage: data.status_message,
    resultCount: data.result_count,
  });
  
  if (!response.ok) {
    const errorDetails = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    console.error(`[DataForSEO] API error ${response.status}:`, errorDetails);
    throw new Error(`DataForSEO API error: ${response.status} ${errorDetails}`);
  }

  // Log response structure for debugging
  if (!Array.isArray(data.tasks)) {
    console.warn('[DataForSEO] Unexpected response structure:', {
      hasTasks: Array.isArray(data.tasks),
      keys: Object.keys(data),
      statusCode: data.status_code,
      statusMessage: data.status_message,
    });
  }

  // DataForSEO returns results in tasks array
  const results: KeywordHistoricalMetrics[] = [];
  
  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (task.result && Array.isArray(task.result)) {
        console.log(`[DataForSEO] Processing ${task.result.length} results from task`);
        for (const item of task.result) {
          const keyword = item.keyword || '';
          if (!keyword) continue;
          
          console.log(`[DataForSEO] Processing keyword: "${keyword}"`, {
            hasSearchVolume: item.search_volume !== undefined,
            searchVolume: item.search_volume,
            hasMonthlySearches: !!item.monthly_searches,
            monthlySearchesType: typeof item.monthly_searches,
            monthlySearchesIsArray: Array.isArray(item.monthly_searches),
            monthlySearchesLength: Array.isArray(item.monthly_searches) ? item.monthly_searches.length : 0,
          });

          // Extract metrics
          const searchVolume = item.search_volume;
          const competitionIndex = item.competition_index;
          // Use competition from API if available, otherwise derive from competition_index
          const competition = (item.competition && ['LOW', 'MEDIUM', 'HIGH'].includes(item.competition))
            ? item.competition as 'LOW' | 'MEDIUM' | 'HIGH'
            : competitionToLevel(competitionIndex);
          
          // CPC data: DataForSEO returns CPC in USD, convert to micros (1 USD = 1,000,000 micros)
          // Field names: low_top_of_page_bid, high_top_of_page_bid (not min_cpc/max_cpc)
          const cpcMin = item.low_top_of_page_bid !== null && item.low_top_of_page_bid !== undefined 
            ? Math.round(item.low_top_of_page_bid * 1_000_000) 
            : undefined;
          const cpcMax = item.high_top_of_page_bid !== null && item.high_top_of_page_bid !== undefined 
            ? Math.round(item.high_top_of_page_bid * 1_000_000) 
            : undefined;
          
          // Average CPC: DataForSEO returns in USD, convert to micros
          const avgCpc = item.cpc !== null && item.cpc !== undefined 
            ? Math.round(Number(item.cpc) * 1_000_000) 
            : undefined;
          
          // Extract monthly searches array (format: { year: 2025, month: 11, search_volume: 22200 })
          const monthlySearches: HistoricalSearchVolumePoint[] = [];
          if (item.monthly_searches && Array.isArray(item.monthly_searches)) {
            console.log(`[DataForSEO] Found ${item.monthly_searches.length} monthly data points for "${keyword}"`);
            for (const monthData of item.monthly_searches) {
              if (monthData.year && monthData.month && typeof monthData.search_volume === 'number') {
                // Format as "YYYY-MM" (e.g., "2025-11")
                const monthStr = String(monthData.month).padStart(2, '0');
                monthlySearches.push({
                  month: `${monthData.year}-${monthStr}`,
                  search_volume: Number(monthData.search_volume),
                });
              }
            }
          } else {
            console.warn(`[DataForSEO] No monthly_searches data for "${keyword}"`, {
              hasMonthlySearches: !!item.monthly_searches,
              isArray: Array.isArray(item.monthly_searches),
              itemKeys: Object.keys(item),
            });
          }

          results.push({
            text: keyword,
            avg_monthly_searches: searchVolume,
            competition,
            competition_index: competitionIndex,
            low_top_of_page_bid_micros: cpcMin,
            high_top_of_page_bid_micros: cpcMax,
            avg_cpc_micros: avgCpc,
            monthly_searches: monthlySearches.length > 0 ? monthlySearches : undefined,
            raw: item,
          });
        }
      }
    }
  }

  console.log(`[DataForSEO] Returning ${results.length} keyword metrics results`);
  return results;
}

export type AdTrafficMetrics = {
  text: string;
  ad_impressions?: number;
  clicks?: number;
  ctr?: number; // Click-through rate (0-1, e.g., 0.0234 = 2.34%)
  avg_cpc_micros?: number; // Average cost per click in micros
  raw?: unknown;
};

/**
 * Fetch ad traffic metrics by keywords using DataForSEO's Ad Traffic by Keywords endpoint.
 * This provides more accurate commercial intent data than search volume alone:
 * - Ad impressions (more accurate than search volume)
 * - Actual historical CPC (instead of bid estimates)
 * - Clicks (estimated clicks from targeting)
 * - CTR (click-through rate)
 * 
 * @param params - Parameters for the API request
 * @returns Array of ad traffic metrics per keyword
 */
export async function fetchAdTrafficByKeywords(params: {
  keywords: string[];
  geo?: string; // "US" or country code
  languageCode?: string; // "en" or language code
  network?: KeywordPlanNetwork;
}): Promise<AdTrafficMetrics[]> {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  const apiVersion = (process.env.DATAFORSEO_API_VERSION || 'v3').trim();

  const keywords = (params.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return [];

  const locationCode = geoToLocationCode(params.geo || 'US');
  // DataForSEO recommends NOT using language_code as it can result in null values

  // DataForSEO Ad Traffic by Keywords endpoint
  const url = `https://api.dataforseo.com/${apiVersion}/keywords_data/google_ads/ad_traffic_by_keywords/live`;
  
  // DataForSEO expects an array with a single object containing keywords array
  // Note: Omitting language_code as recommended by DataForSEO
  const postData: any[] = [{
    location_code: locationCode,
    keywords: keywords,
  }];

  // Basic auth for DataForSEO
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    const errorDetails = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`DataForSEO Ad Traffic API error: ${response.status} ${errorDetails}`);
  }

  // DataForSEO returns results in tasks array
  const results: AdTrafficMetrics[] = [];
  
  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (task.result && Array.isArray(task.result)) {
        for (const item of task.result) {
          const keyword = item.keyword || '';
          if (!keyword) continue;

          // Extract ad traffic metrics
          const adImpressions = item.impressions !== null && item.impressions !== undefined 
            ? Number(item.impressions) 
            : undefined;
          const clicks = item.clicks !== null && item.clicks !== undefined 
            ? Number(item.clicks) 
            : undefined;
          const ctr = item.ctr !== null && item.ctr !== undefined 
            ? Number(item.ctr) 
            : undefined;
          
          // Average CPC: DataForSEO returns in USD, convert to micros
          const avgCpc = item.cpc !== null && item.cpc !== undefined 
            ? Math.round(Number(item.cpc) * 1_000_000) 
            : undefined;

          results.push({
            text: keyword,
            ad_impressions: adImpressions,
            clicks,
            ctr,
            avg_cpc_micros: avgCpc,
            raw: item,
          });
        }
      }
    }
  }

  return results;
}

export type HistoricalSearchVolumePoint = {
  month: string; // YYYY-MM format
  search_volume: number;
};

export type HistoricalKeywordData = {
  text: string;
  current_search_volume?: number;
  historical_monthly_searches?: HistoricalSearchVolumePoint[];
  raw?: unknown;
};

/**
 * Fetch historical monthly search volume data using DataForSEO's Historical Keyword Data endpoint.
 * This provides actual search volumes (not normalized) going back to August 2021.
 * 
 * @param params - Parameters for the API request
 * @returns Array of historical keyword data per keyword
 */
export async function fetchHistoricalKeywordData(params: {
  keywords: string[];
  geo?: string; // "US" or country code
  languageCode?: string; // "en" or language code
}): Promise<HistoricalKeywordData[]> {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  const apiVersion = (process.env.DATAFORSEO_API_VERSION || 'v3').trim();

  const keywords = (params.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return [];

  const locationCode = geoToLocationCode(params.geo || 'US');
  // DataForSEO recommends NOT using language_code as it can result in null values

  // DataForSEO Historical Keyword Data endpoint (Labs API)
  const url = `https://api.dataforseo.com/${apiVersion}/dataforseo_labs/google/historical_keyword_data/live`;
  
  // DataForSEO expects an array with a single object containing keywords array
  // Note: Omitting language_code as recommended by DataForSEO
  const postData: any[] = [{
    location_code: locationCode,
    keywords: keywords,
  }];

  // Basic auth for DataForSEO
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    const errorDetails = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`DataForSEO Historical Keyword Data API error: ${response.status} ${errorDetails}`);
  }

  // DataForSEO returns results in tasks array
  const results: HistoricalKeywordData[] = [];
  
  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (task.result && Array.isArray(task.result)) {
        for (const item of task.result) {
          const keyword = item.keyword || '';
          if (!keyword) continue;

          // Extract current search volume
          const currentSearchVolume = item.search_volume !== null && item.search_volume !== undefined
            ? Number(item.search_volume)
            : undefined;

          // Extract historical monthly searches
          const historicalMonthly: HistoricalSearchVolumePoint[] = [];
          if (item.monthly_searches && Array.isArray(item.monthly_searches)) {
            for (const monthData of item.monthly_searches) {
              if (monthData.month && typeof monthData.search_volume === 'number') {
                historicalMonthly.push({
                  month: monthData.month, // Format: "YYYY-MM"
                  search_volume: Number(monthData.search_volume),
                });
              }
            }
          }

          results.push({
            text: keyword,
            current_search_volume: currentSearchVolume,
            historical_monthly_searches: historicalMonthly.length > 0 ? historicalMonthly : undefined,
            raw: item,
          });
        }
      }
    }
  }

  return results;
}

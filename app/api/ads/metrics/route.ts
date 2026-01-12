import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { 
  fetchKeywordHistoricalMetrics, 
  fetchAdTrafficByKeywords,
  isDataForSEOConfigured 
} from '@/app/lib/dataforseo-ads';

export const dynamic = 'force-dynamic';

function badRequest(message: string, details?: any) {
  return NextResponse.json({ success: false, error: message, details }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);

    const body = await request.json();
    const queryIds: string[] = body.queryIds || body.query_id || [];
    const geo: string = body.geo || 'US';
    const languageCode: string = body.languageCode || body.language_code || 'en';
    const network = (body.network || 'GOOGLE_SEARCH') as 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';
    const currencyCode: string = body.currencyCode || body.currency_code || 'USD';

    if (!Array.isArray(queryIds) || queryIds.length === 0) {
      return badRequest('queryIds array is required');
    }

    const allQueries = await storage.getAllQueries();
    const queries = allQueries.filter((q) => queryIds.includes(q.id));
    if (queries.length === 0) {
      return NextResponse.json({ success: true, updatedCount: 0, missingCount: queryIds.length });
    }

    // Check database cache first (within last 7 days)
    const cachedMetrics = await storage.getAdsKeywordMetricsForQueries(queryIds, geo, languageCode, network);
    const queriesNeedingFetch: typeof queries = [];
    const forceRefresh = body.forceRefresh === true;

    for (const q of queries) {
      const isRecent = await storage.hasRecentAdsKeywordMetrics(q.id, geo, languageCode, network, 7);
      if (!isRecent || forceRefresh) {
        queriesNeedingFetch.push(q);
      } else {
        console.log(`[Ads Metrics] Using cached data for "${q.text}" (fetched within last 7 days)`);
      }
    }

    // Fetch from DataForSEO only for queries that need updating
    let searchVolumeMetrics: Awaited<ReturnType<typeof fetchKeywordHistoricalMetrics>> = [];
    let adTrafficMetrics: Awaited<ReturnType<typeof fetchAdTrafficByKeywords>> = [];
    
    if (queriesNeedingFetch.length > 0) {
      // Check if DataForSEO is configured
      if (!isDataForSEOConfigured()) {
        // If we have some cached data, return that instead of error
        if (cachedMetrics.size > 0) {
          console.log(`[Ads Metrics] DataForSEO not configured, but returning ${cachedMetrics.size} cached metrics`);
        } else {
          return badRequest(
            'DataForSEO API is not configured.',
            {
              requiredEnv: [
                'DATAFORSEO_LOGIN',
                'DATAFORSEO_PASSWORD',
              ],
              hint: 'Sign up at https://dataforseo.com/ and add your credentials to .env.local',
            }
          );
        }
      } else {
        const keywordTexts = queriesNeedingFetch.map((q) => q.text);
        
        try {
          console.log(`[Ads Metrics] Fetching search volume from DataForSEO API for ${keywordTexts.length} keywords...`);
          searchVolumeMetrics = await fetchKeywordHistoricalMetrics({
            keywords: keywordTexts,
            geo,
            languageCode,
            network,
          });
          console.log(`[Ads Metrics] Search volume API returned ${searchVolumeMetrics.length} results`);
        } catch (error) {
          console.warn('[Ads Metrics] Search volume API failed (non-fatal):', error instanceof Error ? error.message : String(error));
        }

        try {
          console.log(`[Ads Metrics] Fetching ad traffic from DataForSEO API for ${keywordTexts.length} keywords...`);
          adTrafficMetrics = await fetchAdTrafficByKeywords({
            keywords: keywordTexts,
            geo,
            languageCode,
            network,
          });
          console.log(`[Ads Metrics] Ad traffic API returned ${adTrafficMetrics.length} results`);
        } catch (error) {
          console.warn('[Ads Metrics] Ad traffic API failed (non-fatal):', error instanceof Error ? error.message : String(error));
        }

        // If both APIs failed and we have no cached data, return error
        if (searchVolumeMetrics.length === 0 && adTrafficMetrics.length === 0 && cachedMetrics.size === 0) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Both search volume and ad traffic APIs failed',
              details: 'Check your DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD credentials',
            },
            { status: 500 }
          );
        }
      }
    } else {
      console.log(`[Ads Metrics] All ${queries.length} queries have recent cached data, skipping API calls`);
    }

    // Merge search volume and ad traffic data by keyword text
    const searchVolumeByText = new Map<string, typeof searchVolumeMetrics[number]>();
    for (const m of searchVolumeMetrics) {
      searchVolumeByText.set(m.text.toLowerCase(), m);
    }

    const adTrafficByText = new Map<string, typeof adTrafficMetrics[number]>();
    for (const m of adTrafficMetrics) {
      adTrafficByText.set(m.text.toLowerCase(), m);
    }

    let updatedCount = 0;
    let missingCount = 0;
    let cachedCount = 0;

    for (const q of queries) {
      // Check if we have cached data that's recent
      const cached = cachedMetrics.get(q.id);
      const isRecent = cached && cached.fetched_at 
        ? (Date.now() - cached.fetched_at.getTime()) / (1000 * 60 * 60 * 24) < 7
        : false;

      // If we have recent cached data and not forcing refresh, use it
      if (isRecent && !forceRefresh && queriesNeedingFetch.findIndex(nq => nq.id === q.id) === -1) {
        cachedCount += 1;
        continue; // Already in database, skip updating
      }

      const searchVolume = searchVolumeByText.get(q.text.toLowerCase());
      const adTraffic = adTrafficByText.get(q.text.toLowerCase());

      // If we have neither search volume nor ad traffic, and no cached data, skip
      if (!searchVolume && !adTraffic && !cached) {
        missingCount += 1;
        continue;
      }

      // Merge the data - prefer ad traffic metrics when available (more accurate)
      // Use search volume's avg_cpc_micros as fallback if ad traffic doesn't have it
      // Preserve existing cached data (like monthly_searches) if present
      const existingRaw = cached?.raw as any || {};
      const newRaw = adTraffic?.raw || searchVolume?.raw || {};
      
      await storage.upsertAdsKeywordMetrics({
        query_id: q.id,
        geo,
        language_code: languageCode,
        network,
        currency_code: currencyCode,
        // Search volume metrics (prefer new, fallback to cached)
        avg_monthly_searches: searchVolume?.avg_monthly_searches ?? cached?.avg_monthly_searches,
        competition: searchVolume?.competition ?? cached?.competition,
        competition_index: searchVolume?.competition_index ?? cached?.competition_index,
        top_of_page_bid_low_micros: searchVolume?.low_top_of_page_bid_micros ?? cached?.top_of_page_bid_low_micros,
        top_of_page_bid_high_micros: searchVolume?.high_top_of_page_bid_micros ?? cached?.top_of_page_bid_high_micros,
        // Ad traffic metrics (more accurate for commercial intent) - prefer new, fallback to cached
        ad_impressions: adTraffic?.ad_impressions ?? cached?.ad_impressions,
        clicks: adTraffic?.clicks ?? cached?.clicks,
        ctr: adTraffic?.ctr ?? cached?.ctr,
        // Prefer ad traffic CPC, fallback to search volume CPC, then cached
        avg_cpc_micros: adTraffic?.avg_cpc_micros || searchVolume?.avg_cpc_micros || cached?.avg_cpc_micros,
        // Store raw data - merge to preserve monthly_searches from cache if new data doesn't have it
        raw: {
          ...existingRaw,
          ...newRaw,
          // Preserve monthly_searches if it exists in cache and not in new data
          monthly_searches: (newRaw as any)?.monthly_searches || existingRaw?.monthly_searches,
        },
      });
      updatedCount += 1;
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      cachedCount,
      missingCount,
      geo,
      languageCode,
      network,
    });
  } catch (error) {
    console.error('Error fetching/storing keyword metrics:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch keyword metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);

    const queryId = searchParams.get('queryId');
    const geo = searchParams.get('geo') || 'US';
    const languageCode = searchParams.get('languageCode') || 'en';
    const network = (searchParams.get('network') || 'GOOGLE_SEARCH') as 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';

    if (!queryId) return badRequest('queryId is required');

    const metrics = await storage.getAdsKeywordMetrics(queryId, geo, languageCode, network);
    return NextResponse.json({ success: true, metrics: metrics || null });
  } catch (error) {
    console.error('Error loading keyword metrics:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load keyword metrics' },
      { status: 500 }
    );
  }
}


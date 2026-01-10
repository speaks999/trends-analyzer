import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { fetchKeywordHistoricalMetrics, isGoogleAdsConfigured } from '@/app/lib/google-ads';

export const dynamic = 'force-dynamic';

function badRequest(message: string, details?: any) {
  return NextResponse.json({ success: false, error: message, details }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);

    if (!isGoogleAdsConfigured()) {
      return badRequest(
        'Google Ads API is not configured.',
        {
          requiredEnv: [
            'GOOGLE_ADS_DEVELOPER_TOKEN',
            'GOOGLE_ADS_CUSTOMER_ID',
            'GOOGLE_ADS_CLIENT_ID',
            'GOOGLE_ADS_CLIENT_SECRET',
            'GOOGLE_ADS_REFRESH_TOKEN',
          ],
          optionalEnv: ['GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'GOOGLE_ADS_API_VERSION'],
        }
      );
    }

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

    const metrics = await fetchKeywordHistoricalMetrics({
      keywords: queries.map((q) => q.text),
      geo,
      languageCode,
      network,
    });

    const byText = new Map<string, (typeof metrics)[number]>();
    for (const m of metrics) byText.set(m.text.toLowerCase(), m);

    let updatedCount = 0;
    let missingCount = 0;

    for (const q of queries) {
      const m = byText.get(q.text.toLowerCase());
      if (!m) {
        missingCount += 1;
        continue;
      }

      await storage.upsertAdsKeywordMetrics({
        query_id: q.id,
        geo,
        language_code: languageCode,
        network,
        currency_code: currencyCode,
        avg_monthly_searches: m.avg_monthly_searches,
        competition: m.competition,
        competition_index: m.competition_index,
        top_of_page_bid_low_micros: m.low_top_of_page_bid_micros,
        top_of_page_bid_high_micros: m.high_top_of_page_bid_micros,
        raw: m.raw,
      });
      updatedCount += 1;
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      missingCount,
      geo,
      languageCode,
      network,
    });
  } catch (error) {
    console.error('Error fetching/storing Google Ads metrics:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch Google Ads metrics' },
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
    console.error('Error loading Google Ads metrics:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load Google Ads metrics' },
      { status: 500 }
    );
  }
}


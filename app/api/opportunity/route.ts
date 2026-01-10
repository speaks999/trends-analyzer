import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const { searchParams } = new URL(request.url);

    const window = (searchParams.get('window') || '90d') as '90d';
    const geo = searchParams.get('geo') || 'US';
    const languageCode = searchParams.get('languageCode') || 'en';
    const network = (searchParams.get('network') || 'GOOGLE_SEARCH') as 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const [top, queries] = await Promise.all([
      storage.getTopOpportunityScores(limit, window, geo, languageCode, network),
      storage.getAllQueries(),
    ]);

    const queryText = new Map(queries.map((q) => [q.id, q.text]));
    const adsById = await storage.getAdsKeywordMetricsForQueries(
      top.map((s) => s.query_id),
      geo,
      languageCode,
      network
    );

    return NextResponse.json({
      success: true,
      targeting: { geo, languageCode, network, window },
      top: top.map((s) => ({
        ...s,
        query_text: queryText.get(s.query_id) || 'Unknown',
        ads: adsById.get(s.query_id) || null,
      })),
    });
  } catch (error) {
    console.error('Error getting opportunity scores:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get opportunity scores',
      },
      { status: 500 }
    );
  }
}


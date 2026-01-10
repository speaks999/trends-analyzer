import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { calculateTOSForQueries } from '@/app/lib/scoring';
import type { AdsKeywordMetrics, OpportunityScore } from '@/app/lib/storage';

export const dynamic = 'force-dynamic';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function clamp100(x: number) {
  return Math.max(0, Math.min(100, x));
}

function logScaledScore(value: number, min: number, max: number): number {
  if (!isFinite(value) || value <= 0) return 0;
  const a = Math.log1p(Math.max(0, min));
  const b = Math.log1p(Math.max(0, max));
  if (b <= a) return 100;
  const v = Math.log1p(value);
  return Math.round(clamp01((v - a) / (b - a)) * 100);
}

function microsToCurrency(micros?: number): number | undefined {
  if (micros === null || micros === undefined) return undefined;
  const n = Number(micros);
  if (!isFinite(n)) return undefined;
  return n / 1_000_000;
}

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();

    const window = (body.window || '90d') as '90d';
    const geo: string = body.geo || 'US';
    const languageCode: string = body.languageCode || 'en';
    const network = (body.network || 'GOOGLE_SEARCH') as 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';
    const limit: number = typeof body.limit === 'number' ? body.limit : 50;

    const queries = await storage.getAllQueries();
    if (queries.length === 0) {
      return NextResponse.json({ success: true, message: 'No queries found', updated: 0, top: [] });
    }

    const queryIds = queries.map((q) => q.id);

    // Momentum score (TOS) is computed from trend_snapshots.
    const tos = await calculateTOSForQueries(queryIds, window, storage);
    const tosById = new Map(tos.map((s) => [s.query_id, s]));

    // Ads metrics (absolute demand + CPC proxy)
    const adsById = await storage.getAdsKeywordMetricsForQueries(queryIds, geo, languageCode, network);

    const volumes = Array.from(adsById.values())
      .map((m) => m.avg_monthly_searches)
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);
    const cpcs = Array.from(adsById.values())
      .map((m) => microsToCurrency(m.top_of_page_bid_high_micros))
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);

    const vMin = volumes.length ? Math.min(...volumes) : 0;
    const vMax = volumes.length ? Math.max(...volumes) : 0;
    const cMin = cpcs.length ? Math.min(...cpcs) : 0;
    const cMax = cpcs.length ? Math.max(...cpcs) : 0;

    let updated = 0;

    for (const q of queries) {
      const momentum = tosById.get(q.id);
      const ads = adsById.get(q.id);

      const demandScore = ads?.avg_monthly_searches ? logScaledScore(ads.avg_monthly_searches, vMin, vMax) : 0;
      const cpc = microsToCurrency(ads?.top_of_page_bid_high_micros);
      const cpcScore = cpc ? logScaledScore(cpc, cMin, cMax) : 0;

      const momentumScore = momentum?.score ?? 0;

      const opportunityScore = clamp100(
        0.45 * demandScore + 0.35 * momentumScore + 0.2 * cpcScore
      );
      const efficiencyScore = clamp100(
        0.55 * demandScore + 0.45 * momentumScore - 0.2 * cpcScore
      );

      const scoreRow: OpportunityScore = {
        query_id: q.id,
        geo,
        language_code: languageCode,
        network,
        window,
        opportunity_score: Math.round(opportunityScore),
        efficiency_score: Math.round(efficiencyScore),
        demand_score: demandScore,
        momentum_score: momentumScore,
        cpc_score: cpcScore,
        slope: momentum?.breakdown.slope ?? 0,
        acceleration: momentum?.breakdown.acceleration ?? 0,
        consistency: momentum?.breakdown.consistency ?? 0,
        calculated_at: new Date(),
      };

      await storage.upsertOpportunityScore(scoreRow);
      updated += 1;
    }

    const top = await storage.getTopOpportunityScores(limit, window, geo, languageCode, network);
    const queryText = new Map(queries.map((q) => [q.id, q.text]));

    const responseTop = top.map((s) => {
      const ads = adsById.get(s.query_id);
      return {
        ...s,
        query_text: queryText.get(s.query_id) || 'Unknown',
        ads: ads
          ? {
              avg_monthly_searches: ads.avg_monthly_searches ?? null,
              competition: ads.competition ?? null,
              competition_index: ads.competition_index ?? null,
              top_of_page_bid_low_micros: ads.top_of_page_bid_low_micros ?? null,
              top_of_page_bid_high_micros: ads.top_of_page_bid_high_micros ?? null,
              currency_code: ads.currency_code ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Updated opportunity scores for ${updated} queries`,
      updated,
      top: responseTop,
      targeting: { geo, languageCode, network, window },
    });
  } catch (error) {
    console.error('Error refreshing opportunity scores:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh opportunity scores',
      },
      { status: 500 }
    );
  }
}


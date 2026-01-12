'use client';

type Network = 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';

type OpportunityRow = {
  query_id: string;
  query_text: string;
  opportunity_score: number;
  efficiency_score: number;
  demand_score: number;
  momentum_score: number;
  cpc_score: number;
  calculated_at?: string | Date;
  ads?: {
    avg_monthly_searches?: number | null;
    competition?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    competition_index?: number | null;
    top_of_page_bid_low_micros?: number | null;
    top_of_page_bid_high_micros?: number | null;
    currency_code?: string | null;
    geo?: string;
    language_code?: string;
    network?: Network;
  } | null;
};

function microsToCurrency(micros?: number | null): number | null {
  if (micros === null || micros === undefined) return null;
  const n = Number(micros);
  if (!isFinite(n)) return null;
  return n / 1_000_000;
}

function fmtCurrency(value: number | null, currency: string | null | undefined) {
  if (value === null) return '—';
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${c}`;
  }
}

function fmtInt(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat().format(value);
}

export default function OpportunityTable(props: { rows: OpportunityRow[] }) {
  const rows = props.rows || [];

  if (rows.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Opportunity</h3>
        <p className="text-sm text-gray-600">No opportunity scores yet. Fetch Ads metrics and compute scores.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Opportunity (v2)</h3>
          <p className="text-sm text-gray-600">
            Combines <span className="font-medium">Demand</span> (monthly searches), <span className="font-medium">Momentum</span> (trend growth),
            and <span className="font-medium">CPC</span> (top-of-page bids).
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 pr-3">Keyword</th>
              <th className="py-2 pr-3">Opportunity</th>
              <th className="py-2 pr-3">Demand</th>
              <th className="py-2 pr-3">CPC (high)</th>
              <th className="py-2 pr-3">Competition</th>
              <th className="py-2 pr-3">Momentum</th>
              <th className="py-2 pr-3">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cpcHigh = microsToCurrency(r.ads?.top_of_page_bid_high_micros ?? null);
              const currency = r.ads?.currency_code ?? 'USD';
              return (
                <tr key={r.query_id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 font-medium text-gray-900">{r.query_text}</td>
                  <td className="py-2 pr-3 font-semibold text-gray-900">{Math.round(r.opportunity_score)}/100</td>
                  <td className="py-2 pr-3">{fmtInt(r.ads?.avg_monthly_searches ?? null)}</td>
                  <td className="py-2 pr-3">{fmtCurrency(cpcHigh, currency)}</td>
                  <td className="py-2 pr-3">{r.ads?.competition ?? '—'}</td>
                  <td className="py-2 pr-3">{Math.round(r.momentum_score)}/100</td>
                  <td className="py-2 pr-3">{Math.round(r.efficiency_score)}/100</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


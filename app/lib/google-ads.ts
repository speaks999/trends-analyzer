// Minimal Google Ads API client (server-side only).
// Fetches Keyword Planner historical metrics for a list of keywords.
//
// Required env vars:
// - GOOGLE_ADS_DEVELOPER_TOKEN
// - GOOGLE_ADS_CUSTOMER_ID (digits only, no dashes)
// - GOOGLE_ADS_CLIENT_ID
// - GOOGLE_ADS_CLIENT_SECRET
// - GOOGLE_ADS_REFRESH_TOKEN
//
// Optional:
// - GOOGLE_ADS_LOGIN_CUSTOMER_ID (manager account CID, digits only)
// - GOOGLE_ADS_API_VERSION (default: v16)

export type KeywordPlanNetwork = 'GOOGLE_SEARCH' | 'GOOGLE_SEARCH_AND_PARTNERS';

export type GoogleAdsKeywordHistoricalMetrics = {
  text: string;
  avg_monthly_searches?: number;
  competition?: 'LOW' | 'MEDIUM' | 'HIGH';
  competition_index?: number;
  low_top_of_page_bid_micros?: number;
  high_top_of_page_bid_micros?: number;
  raw?: unknown;
};

type OAuthTokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: OAuthTokenCache | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function normalizeCustomerId(input: string): string {
  return input.replace(/-/g, '').trim();
}

function geoToGeoTargetConstant(geo: string): string {
  const trimmed = geo.trim();
  if (trimmed.startsWith('geoTargetConstants/')) return trimmed;
  // Minimal mapping for this app's current defaults.
  // US = 2840 (United States)
  if (trimmed.toUpperCase() === 'US') return 'geoTargetConstants/2840';
  throw new Error(
    `Unsupported geo "${geo}". Use a geoTargetConstants/* resource name or extend mapping.`
  );
}

function languageToLanguageConstant(languageCode: string): string {
  const trimmed = languageCode.trim();
  if (trimmed.startsWith('languageConstants/')) return trimmed;
  // Minimal mapping for this app's current defaults.
  // English = 1000
  if (trimmed.toLowerCase() === 'en') return 'languageConstants/1000';
  throw new Error(
    `Unsupported languageCode "${languageCode}". Use a languageConstants/* resource name or extend mapping.`
  );
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - now > 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = requireEnv('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_ADS_CLIENT_SECRET');
  const refreshToken = requireEnv('GOOGLE_ADS_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const details = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`Failed to refresh Google OAuth token: ${resp.status} ${details}`);
  }

  const accessToken = data.access_token as string | undefined;
  const expiresIn = data.expires_in as number | undefined;
  if (!accessToken || !expiresIn) {
    throw new Error('OAuth token response missing access_token/expires_in');
  }

  tokenCache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };
  return accessToken;
}

export function isGoogleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN
  );
}

export async function fetchKeywordHistoricalMetrics(params: {
  keywords: string[];
  geo?: string; // "US" or geoTargetConstants/*
  languageCode?: string; // "en" or languageConstants/*
  network?: KeywordPlanNetwork;
}): Promise<GoogleAdsKeywordHistoricalMetrics[]> {
  const developerToken = requireEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
  const customerId = normalizeCustomerId(requireEnv('GOOGLE_ADS_CUSTOMER_ID'));
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
    ? normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    : undefined;
  const apiVersion = (process.env.GOOGLE_ADS_API_VERSION || 'v16').trim();

  const keywords = (params.keywords || []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return [];

  const geo = geoToGeoTargetConstant(params.geo || 'US');
  const language = languageToLanguageConstant(params.languageCode || 'en');
  const keywordPlanNetwork: KeywordPlanNetwork = params.network || 'GOOGLE_SEARCH';

  const accessToken = await getAccessToken();

  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}:generateKeywordHistoricalMetrics`;
  const body = {
    keywords,
    geoTargetConstants: [geo],
    language,
    keywordPlanNetwork,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const details = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`Google Ads API error: ${resp.status} ${details}`);
  }

  const results = (data.results || []) as any[];
  return results
    .map((r) => {
      const metrics = r.keywordMetrics || r.keyword_metrics || {};
      const competition = metrics.competition as string | undefined;
      return {
        text: (r.text || '').toString(),
        avg_monthly_searches: metrics.avgMonthlySearches ?? metrics.avg_monthly_searches,
        competition:
          competition === 'LOW' || competition === 'MEDIUM' || competition === 'HIGH'
            ? (competition as any)
            : undefined,
        competition_index: metrics.competitionIndex ?? metrics.competition_index,
        low_top_of_page_bid_micros:
          metrics.lowTopOfPageBidMicros ?? metrics.low_top_of_page_bid_micros,
        high_top_of_page_bid_micros:
          metrics.highTopOfPageBidMicros ?? metrics.high_top_of_page_bid_micros,
        raw: r,
      } satisfies GoogleAdsKeywordHistoricalMetrics;
    })
    .filter((r) => r.text);
}


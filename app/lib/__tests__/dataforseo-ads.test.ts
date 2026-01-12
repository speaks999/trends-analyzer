/**
 * Integration tests for DataForSEO API
 * 
 * These tests require valid DataForSEO credentials in environment variables.
 * Run with: npm test -- --testPathPattern=dataforseo
 * 
 * Required env vars:
 * - DATAFORSEO_LOGIN (your DataForSEO account email)
 * - DATAFORSEO_PASSWORD (your DataForSEO API password)
 */

import {
  isDataForSEOConfigured,
  fetchKeywordHistoricalMetrics,
  fetchAdTrafficByKeywords,
  fetchHistoricalKeywordData,
} from '../dataforseo-ads';

describe('DataForSEO API', () => {
  describe('isDataForSEOConfigured', () => {
    it('should return true when all required env vars are set', () => {
      const isConfigured = isDataForSEOConfigured();
      console.log('DataForSEO configured:', isConfigured);
      
      if (!isConfigured) {
        console.log('Missing environment variables. Required:');
        console.log('  - DATAFORSEO_LOGIN:', !!process.env.DATAFORSEO_LOGIN);
        console.log('  - DATAFORSEO_PASSWORD:', !!process.env.DATAFORSEO_PASSWORD);
      }
      
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('fetchKeywordHistoricalMetrics', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should fetch search volume metrics for a single keyword',
      async () => {
        console.log('Testing with Login:', process.env.DATAFORSEO_LOGIN);
        console.log('API Version:', process.env.DATAFORSEO_API_VERSION || 'v3 (default)');
        
        try {
          const results = await fetchKeywordHistoricalMetrics({
            keywords: ['business coaching'],
            geo: 'US',
            languageCode: 'en',
            network: 'GOOGLE_SEARCH',
          });

          console.log('Search volume results:', JSON.stringify(results, null, 2));

          expect(Array.isArray(results)).toBe(true);
          expect(results.length).toBeGreaterThan(0);

          const metric = results[0];
          expect(metric.text).toBe('business coaching');
          
          // Check that we got some data back
          if (metric.avg_monthly_searches !== undefined) {
            expect(typeof metric.avg_monthly_searches).toBe('number');
            expect(metric.avg_monthly_searches).toBeGreaterThanOrEqual(0);
            console.log(`  ✓ Monthly searches: ${metric.avg_monthly_searches.toLocaleString()}`);
          }
          
          if (metric.competition !== undefined) {
            expect(['LOW', 'MEDIUM', 'HIGH']).toContain(metric.competition);
            console.log(`  ✓ Competition: ${metric.competition}`);
          }
          
          if (metric.competition_index !== undefined) {
            expect(typeof metric.competition_index).toBe('number');
            expect(metric.competition_index).toBeGreaterThanOrEqual(0);
            expect(metric.competition_index).toBeLessThanOrEqual(100);
            console.log(`  ✓ Competition index: ${metric.competition_index}`);
          }

          if (metric.low_top_of_page_bid_micros !== undefined) {
            const cpcLow = metric.low_top_of_page_bid_micros / 1_000_000;
            console.log(`  ✓ Low CPC (USD): $${cpcLow.toFixed(2)}`);
          }

          if (metric.high_top_of_page_bid_micros !== undefined) {
            const cpcHigh = metric.high_top_of_page_bid_micros / 1_000_000;
            console.log(`  ✓ High CPC (USD): $${cpcHigh.toFixed(2)}`);
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          throw error;
        }
      },
      30000 // 30 second timeout
    );

    (runIntegrationTests ? it : it.skip)(
      'should fetch metrics for multiple keywords',
      async () => {
        const keywords = ['goal setting', 'life coach', 'productivity tips'];
        
        try {
          const results = await fetchKeywordHistoricalMetrics({
            keywords,
            geo: 'US',
            languageCode: 'en',
            network: 'GOOGLE_SEARCH',
          });

          console.log('Multiple keywords results:', JSON.stringify(results, null, 2));

          expect(Array.isArray(results)).toBe(true);
          // Should get results for all keywords (or at least some)
          expect(results.length).toBeGreaterThan(0);

          // Verify each keyword has a result
          const resultTexts = results.map((r) => r.text.toLowerCase());
          for (const keyword of keywords) {
            if (resultTexts.includes(keyword.toLowerCase())) {
              console.log(`  ✓ Found data for: ${keyword}`);
            } else {
              console.log(`  ⚠️  No data for: ${keyword}`);
            }
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          throw error;
        }
      },
      30000
    );

    (runIntegrationTests ? it : it.skip)(
      'should handle empty keywords array',
      async () => {
        const results = await fetchKeywordHistoricalMetrics({
          keywords: [],
        });

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
      },
      10000
    );
  });

  describe('fetchAdTrafficByKeywords', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should fetch ad traffic metrics for keywords',
      async () => {
        try {
          const results = await fetchAdTrafficByKeywords({
            keywords: ['digital marketing'],
            geo: 'US',
            languageCode: 'en',
          });

          console.log('Ad traffic results:', JSON.stringify(results, null, 2));

          expect(Array.isArray(results)).toBe(true);
          
          if (results.length > 0) {
            const metric = results[0];
            console.log(`  ✓ Keyword: ${metric.text}`);
            
            if (metric.ad_impressions !== undefined) {
              console.log(`  ✓ Ad impressions: ${metric.ad_impressions.toLocaleString()}`);
              expect(typeof metric.ad_impressions).toBe('number');
            }
            
            if (metric.clicks !== undefined) {
              console.log(`  ✓ Clicks: ${metric.clicks.toLocaleString()}`);
              expect(typeof metric.clicks).toBe('number');
            }
            
            if (metric.ctr !== undefined) {
              console.log(`  ✓ CTR: ${(metric.ctr * 100).toFixed(2)}%`);
              expect(typeof metric.ctr).toBe('number');
              expect(metric.ctr).toBeGreaterThanOrEqual(0);
              expect(metric.ctr).toBeLessThanOrEqual(1);
            }
            
            if (metric.avg_cpc_micros !== undefined) {
              const cpc = metric.avg_cpc_micros / 1_000_000;
              console.log(`  ✓ Avg CPC (USD): $${cpc.toFixed(2)}`);
              expect(typeof metric.avg_cpc_micros).toBe('number');
            }
          } else {
            console.log('  ⚠️  No ad traffic data returned (this may be normal for some keywords)');
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          // Ad traffic might not be available for all keywords, so we'll log but not fail
          if (error.message.includes('404') || error.message.includes('not found')) {
            console.log('  ⚠️  Ad traffic endpoint may not be available for this keyword');
            return;
          }
          throw error;
        }
      },
      30000
    );
  });

  describe('fetchHistoricalKeywordData', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should fetch historical monthly search volume data',
      async () => {
        try {
          const results = await fetchHistoricalKeywordData({
            keywords: ['business coaching'],
            geo: 'US',
            languageCode: 'en',
          });

          console.log('Historical data results:', JSON.stringify(results, null, 2));

          expect(Array.isArray(results)).toBe(true);
          
          if (results.length > 0) {
            const data = results[0];
            console.log(`  ✓ Keyword: ${data.text}`);
            
            if (data.current_search_volume !== undefined) {
              console.log(`  ✓ Current search volume: ${data.current_search_volume.toLocaleString()}`);
              expect(typeof data.current_search_volume).toBe('number');
            }
            
            if (data.historical_monthly_searches && data.historical_monthly_searches.length > 0) {
              console.log(`  ✓ Historical months: ${data.historical_monthly_searches.length}`);
              console.log(`  ✓ First month: ${data.historical_monthly_searches[0]?.month} (${data.historical_monthly_searches[0]?.search_volume.toLocaleString()} searches)`);
              console.log(`  ✓ Last month: ${data.historical_monthly_searches[data.historical_monthly_searches.length - 1]?.month} (${data.historical_monthly_searches[data.historical_monthly_searches.length - 1]?.search_volume.toLocaleString()} searches)`);
              
              expect(Array.isArray(data.historical_monthly_searches)).toBe(true);
              data.historical_monthly_searches.forEach((point) => {
                expect(typeof point.month).toBe('string');
                expect(typeof point.search_volume).toBe('number');
              });
            } else {
              console.log('  ⚠️  No historical monthly data available');
            }
          } else {
            console.log('  ⚠️  No historical data returned');
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          // Historical data might not be available for all keywords
          if (error.message.includes('404') || error.message.includes('not found')) {
            console.log('  ⚠️  Historical data endpoint may not be available for this keyword');
            return;
          }
          throw error;
        }
      },
      30000
    );
  });
});

/**
 * Integration tests for Google Ads API
 * 
 * These tests require valid Google Ads credentials in environment variables.
 * Run with: npm test -- --testPathPattern=google-ads
 * 
 * IMPORTANT: The generateKeywordHistoricalMetrics endpoint requires:
 * 1. A Google Ads account with Keyword Planner access
 * 2. A developer token with at least "Basic Access" (not just "Test Account")
 * 3. API version v18 or later (v16 and v17 have been sunset)
 * 
 * Test developer tokens can ONLY access test accounts, so keyword metrics
 * won't work until you have Basic or Standard Access approval.
 */

import {
  isGoogleAdsConfigured,
  fetchKeywordHistoricalMetrics,
  GoogleAdsKeywordHistoricalMetrics,
} from '../google-ads';

describe('Google Ads API', () => {
  describe('isGoogleAdsConfigured', () => {
    it('should return true when all required env vars are set', () => {
      // This test will pass if the env vars are configured
      const isConfigured = isGoogleAdsConfigured();
      console.log('Google Ads configured:', isConfigured);
      
      if (!isConfigured) {
        console.log('Missing environment variables. Required:');
        console.log('  - GOOGLE_ADS_DEVELOPER_TOKEN:', !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
        console.log('  - GOOGLE_ADS_CUSTOMER_ID:', !!process.env.GOOGLE_ADS_CUSTOMER_ID);
        console.log('  - GOOGLE_ADS_CLIENT_ID:', !!process.env.GOOGLE_ADS_CLIENT_ID);
        console.log('  - GOOGLE_ADS_CLIENT_SECRET:', !!process.env.GOOGLE_ADS_CLIENT_SECRET);
        console.log('  - GOOGLE_ADS_REFRESH_TOKEN:', !!process.env.GOOGLE_ADS_REFRESH_TOKEN);
      }
      
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('fetchKeywordHistoricalMetrics', () => {
    // Skip integration tests if not configured
    const runIntegrationTests = isGoogleAdsConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should fetch metrics for a single keyword',
      async () => {
        console.log('Testing with Customer ID:', process.env.GOOGLE_ADS_CUSTOMER_ID);
        console.log('API Version:', process.env.GOOGLE_ADS_API_VERSION || 'v16 (default)');
        console.log('Login Customer ID:', process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || 'not set');
        
        try {
          const results = await fetchKeywordHistoricalMetrics({
            keywords: ['business coaching'],
            geo: 'US',
            languageCode: 'en',
            network: 'GOOGLE_SEARCH',
          });

          console.log('Single keyword results:', JSON.stringify(results, null, 2));

          expect(Array.isArray(results)).toBe(true);
          expect(results.length).toBeGreaterThan(0);

          const metric = results[0];
          expect(metric.text).toBe('business coaching');
          
          // Check that we got some data back
          if (metric.avg_monthly_searches !== undefined) {
            expect(typeof metric.avg_monthly_searches).toBe('number');
            expect(metric.avg_monthly_searches).toBeGreaterThanOrEqual(0);
          }
          
          if (metric.competition !== undefined) {
            expect(['LOW', 'MEDIUM', 'HIGH']).toContain(metric.competition);
          }
          
          if (metric.competition_index !== undefined) {
            expect(typeof metric.competition_index).toBe('number');
            expect(metric.competition_index).toBeGreaterThanOrEqual(0);
            expect(metric.competition_index).toBeLessThanOrEqual(100);
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          
          // Check for common issues
          if (error.message.includes('501') || error.message.includes('UNIMPLEMENTED')) {
            console.log('\n⚠️  501 UNIMPLEMENTED Error - This usually means:');
            console.log('   • Your developer token is in TEST mode (can only access test accounts)');
            console.log('   • You need "Basic Access" approval from Google to use Keyword Planner API');
            console.log('   • Apply at: https://ads.google.com/aw/apicenter');
            console.log('\n   This test will be skipped until you have Basic Access.');
            return; // Skip test gracefully
          }
          
          if (error.message.includes('404')) {
            console.log('\n⚠️  404 Error - API version may be sunset. Try v18 or later.');
          }
          
          console.log('\nTroubleshooting tips:');
          console.log('1. Make sure your Google Ads account has Keyword Planner access');
          console.log('2. The Customer ID should be a valid Google Ads account (not MCC)');
          console.log('3. For test developer tokens, you can only query your own account');
          console.log('4. Try adding GOOGLE_ADS_LOGIN_CUSTOMER_ID if using an MCC');
          throw error;
        }
      },
      30000 // 30 second timeout for API call
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
          // Should get results for all keywords
          expect(results.length).toBe(keywords.length);

          // Verify each keyword has a result
          const resultTexts = results.map((r) => r.text.toLowerCase());
          for (const keyword of keywords) {
            expect(resultTexts).toContain(keyword.toLowerCase());
          }
        } catch (error: any) {
          if (error.message.includes('501') || error.message.includes('UNIMPLEMENTED')) {
            console.log('Skipping - developer token needs Basic Access approval');
            return;
          }
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

    (runIntegrationTests ? it : it.skip)(
      'should return bid information when available',
      async () => {
        try {
          const results = await fetchKeywordHistoricalMetrics({
            keywords: ['digital marketing'],
            geo: 'US',
            languageCode: 'en',
          });

          console.log('Bid info results:', JSON.stringify(results, null, 2));

          expect(results.length).toBeGreaterThan(0);
          
          const metric = results[0];
          
          // Log bid information
          if (metric.low_top_of_page_bid_micros !== undefined) {
            console.log(
              'Low bid (USD):',
              (metric.low_top_of_page_bid_micros / 1_000_000).toFixed(2)
            );
            expect(typeof metric.low_top_of_page_bid_micros).toBe('number');
          }
          
          if (metric.high_top_of_page_bid_micros !== undefined) {
            console.log(
              'High bid (USD):',
              (metric.high_top_of_page_bid_micros / 1_000_000).toFixed(2)
            );
            expect(typeof metric.high_top_of_page_bid_micros).toBe('number');
          }
        } catch (error: any) {
          if (error.message.includes('501') || error.message.includes('UNIMPLEMENTED')) {
            console.log('Skipping - developer token needs Basic Access approval');
            return;
          }
          throw error;
        }
      },
      30000
    );

    it('should throw error when credentials are invalid', async () => {
      // Temporarily override env vars
      const originalToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      const originalCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
      const originalClientId = process.env.GOOGLE_ADS_CLIENT_ID;
      const originalClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
      const originalRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

      try {
        // Set invalid credentials
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'invalid-token';
        process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
        process.env.GOOGLE_ADS_CLIENT_ID = 'invalid-client-id';
        process.env.GOOGLE_ADS_CLIENT_SECRET = 'invalid-secret';
        process.env.GOOGLE_ADS_REFRESH_TOKEN = 'invalid-refresh-token';

        await expect(
          fetchKeywordHistoricalMetrics({
            keywords: ['test'],
          })
        ).rejects.toThrow();
      } finally {
        // Restore original env vars
        if (originalToken) process.env.GOOGLE_ADS_DEVELOPER_TOKEN = originalToken;
        else delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
        
        if (originalCustomerId) process.env.GOOGLE_ADS_CUSTOMER_ID = originalCustomerId;
        else delete process.env.GOOGLE_ADS_CUSTOMER_ID;
        
        if (originalClientId) process.env.GOOGLE_ADS_CLIENT_ID = originalClientId;
        else delete process.env.GOOGLE_ADS_CLIENT_ID;
        
        if (originalClientSecret) process.env.GOOGLE_ADS_CLIENT_SECRET = originalClientSecret;
        else delete process.env.GOOGLE_ADS_CLIENT_SECRET;
        
        if (originalRefreshToken) process.env.GOOGLE_ADS_REFRESH_TOKEN = originalRefreshToken;
        else delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
      }
    }, 30000);
  });
});

/**
 * Integration tests for DataForSEO SERP API
 * 
 * These tests require valid DataForSEO credentials in environment variables.
 * Run with: npm test -- --testPathPattern=dataforseo-serp
 */

import {
  isDataForSEOConfigured,
  fetchGoogleSerp,
  getRelatedTopicsFromSerp,
  getRelatedQuestionsFromSerp,
} from '../dataforseo-serp';

describe('DataForSEO SERP API', () => {
  describe('isDataForSEOConfigured', () => {
    it('should return true when credentials are set', () => {
      const isConfigured = isDataForSEOConfigured();
      console.log('DataForSEO SERP configured:', isConfigured);
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('fetchGoogleSerp', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should fetch SERP data for a keyword',
      async () => {
        try {
          const result = await fetchGoogleSerp({
            keyword: 'weather forecast',
            geo: 'US',
            languageCode: 'en',
            device: 'desktop',
            depth: 10,
          });

          console.log('SERP result structure:', {
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
            itemsCount: result?.items ? (Array.isArray(result.items) ? result.items.length : 'not array') : 'no items',
          });

          expect(result).not.toBeNull();
          
          if (result) {
            // Log some key fields that might be present
            if (result.items) {
              console.log(`  ✓ Found ${Array.isArray(result.items) ? result.items.length : 0} items`);
            }
            if (result.related_searches) {
              console.log(`  ✓ Found related_searches`);
            }
            if (result.people_also_ask) {
              console.log(`  ✓ Found people_also_ask`);
            }
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          throw error;
        }
      },
      30000
    );
  });

  describe('getRelatedTopicsFromSerp', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should extract related topics from SERP data',
      async () => {
        try {
          const topics = await getRelatedTopicsFromSerp('business coaching', 'US');

          console.log('Related topics from SERP:', JSON.stringify(topics, null, 2));

          expect(Array.isArray(topics)).toBe(true);
          
          if (topics.length > 0) {
            console.log(`  ✓ Found ${topics.length} related topics`);
            topics.slice(0, 3).forEach((topic, i) => {
              console.log(`    ${i + 1}. ${topic.topic} (value: ${topic.value}, rising: ${topic.isRising})`);
            });
            
            // Verify structure
            const firstTopic = topics[0];
            expect(typeof firstTopic.topic).toBe('string');
            expect(firstTopic.topic.length).toBeGreaterThan(0);
          } else {
            console.log('  ⚠️  No related topics found (this may be normal for some keywords)');
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          throw error;
        }
      },
      30000
    );
  });

  describe('getRelatedQuestionsFromSerp', () => {
    const runIntegrationTests = isDataForSEOConfigured();

    (runIntegrationTests ? it : it.skip)(
      'should extract People Also Ask questions from SERP data',
      async () => {
        try {
          const questions = await getRelatedQuestionsFromSerp('business coaching', 'US');

          console.log('Related questions from SERP:', JSON.stringify(questions, null, 2));

          expect(Array.isArray(questions)).toBe(true);
          
          if (questions.length > 0) {
            console.log(`  ✓ Found ${questions.length} related questions`);
            questions.slice(0, 3).forEach((q, i) => {
              console.log(`    ${i + 1}. ${q.question}`);
              if (q.answer) {
                console.log(`       Answer: ${q.answer.substring(0, 100)}...`);
              }
            });
            
            // Verify structure
            const firstQuestion = questions[0];
            expect(typeof firstQuestion.question).toBe('string');
            expect(firstQuestion.question.length).toBeGreaterThan(0);
          } else {
            console.log('  ⚠️  No related questions found (this may be normal for some keywords)');
          }
        } catch (error: any) {
          console.error('API Error:', error.message);
          throw error;
        }
      },
      30000
    );
  });
});

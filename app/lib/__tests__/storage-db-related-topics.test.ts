/**
 * Tests for Related Topics and People Also Ask functionality
 */

import { DatabaseStorage } from '../storage-db';
import { RelatedTopic, PeopleAlsoAsk } from '../storage';

// Mock Supabase client
jest.mock('../supabase-client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            data: [],
            error: null,
          })),
          maybeSingle: jest.fn(() => ({
            data: null,
            error: null,
          })),
          single: jest.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
      upsert: jest.fn(() => ({
        data: [],
        error: null,
      })),
      insert: jest.fn(() => ({
        data: [],
        error: null,
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    })),
    auth: {
      getUser: jest.fn(() => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
  })),
}));

describe('DatabaseStorage - Related Topics', () => {
  let storage: DatabaseStorage;
  let mockUpsert: jest.Mock;

  beforeEach(() => {
    storage = new DatabaseStorage();
    mockUpsert = jest.fn(() => ({
      data: [],
      error: null,
    }));
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('saveRelatedTopics', () => {
    it('should filter out topics with invalid or missing topic strings', async () => {
      const queryId = 'test-query-id';
      const invalidTopics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[] = [
        { topic: 'Valid Topic', value: 50, is_rising: false },
        { topic: null as any, value: 30, is_rising: false }, // Invalid: null
        { topic: undefined as any, value: 40, is_rising: false }, // Invalid: undefined
        { topic: '', value: 20, is_rising: false }, // Invalid: empty string
        { topic: '   ', value: 10, is_rising: false }, // Invalid: whitespace only
        { topic: 'Another Valid Topic', value: 60, is_rising: true },
      ];

      // Mock the Supabase client
      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.saveRelatedTopics(queryId, invalidTopics);

      expect(mockFrom).toHaveBeenCalledWith('related_topics');
      expect(mockUpsert).toHaveBeenCalled();
      
      const upsertCall = mockUpsert.mock.calls[0];
      const savedTopics = upsertCall[0];
      
      // Should only save valid topics
      expect(savedTopics).toHaveLength(2);
      expect(savedTopics[0].topic).toBe('Valid Topic');
      expect(savedTopics[1].topic).toBe('Another Valid Topic');
    });

    it('should deduplicate topics by case-insensitive topic name', async () => {
      const queryId = 'test-query-id';
      const duplicateTopics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[] = [
        { topic: 'Business Coach', value: 50, is_rising: false },
        { topic: 'business coach', value: 60, is_rising: true }, // Duplicate, should keep this one (rising)
        { topic: 'BUSINESS COACH', value: 40, is_rising: false }, // Duplicate, should be ignored
        { topic: 'Marketing Strategy', value: 70, is_rising: false },
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.saveRelatedTopics(queryId, duplicateTopics);

      const upsertCall = mockUpsert.mock.calls[0];
      const savedTopics = upsertCall[0];
      
      // Should deduplicate to 2 unique topics
      expect(savedTopics).toHaveLength(2);
      
      // Should keep the rising one for "business coach"
      const businessCoachTopic = savedTopics.find((t: any) => 
        t.topic.toLowerCase() === 'business coach'
      );
      expect(businessCoachTopic).toBeDefined();
      expect(businessCoachTopic.is_rising).toBe(true);
      expect(businessCoachTopic.value).toBe(60);
      
      // Should keep "Marketing Strategy"
      const marketingTopic = savedTopics.find((t: any) => 
        t.topic.toLowerCase() === 'marketing strategy'
      );
      expect(marketingTopic).toBeDefined();
    });

    it('should handle numeric value conversion correctly', async () => {
      const queryId = 'test-query-id';
      const topics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[] = [
        { topic: 'Topic 1', value: 50, is_rising: false },
        { topic: 'Topic 2', value: '75' as any, is_rising: false }, // String number
        { topic: 'Topic 3', value: null as any, is_rising: false }, // Invalid, should default to 0
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.saveRelatedTopics(queryId, topics);

      const upsertCall = mockUpsert.mock.calls[0];
      const savedTopics = upsertCall[0];
      
      expect(savedTopics[0].value).toBe(50);
      expect(savedTopics[1].value).toBe(75); // Parsed from string
      expect(savedTopics[2].value).toBe(0); // Default for invalid
    });

    it('should return early if no valid topics after filtering', async () => {
      const queryId = 'test-query-id';
      const invalidTopics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[] = [
        { topic: null as any, value: 30, is_rising: false },
        { topic: '', value: 20, is_rising: false },
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.saveRelatedTopics(queryId, invalidTopics);

      // Should not call upsert if no valid topics
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const queryId = 'test-query-id';
      const topics: Omit<RelatedTopic, 'id' | 'query_id' | 'created_at'>[] = [];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.saveRelatedTopics(queryId, topics);

      // Should return early without calling upsert
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('savePeopleAlsoAsk', () => {
    it('should filter out PAA items with invalid or missing question strings', async () => {
      const queryId = 'test-query-id';
      const invalidPaa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[] = [
        { question: 'What is a business coach?', answer: 'A professional...' },
        { question: null as any, answer: 'Some answer' }, // Invalid: null
        { question: undefined as any, answer: 'Some answer' }, // Invalid: undefined
        { question: '', answer: 'Some answer' }, // Invalid: empty string
        { question: '   ', answer: 'Some answer' }, // Invalid: whitespace only
        { question: 'How to find a business coach?', answer: 'You can...' },
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.savePeopleAlsoAsk(queryId, invalidPaa);

      expect(mockFrom).toHaveBeenCalledWith('related_questions');
      expect(mockUpsert).toHaveBeenCalled();
      
      const upsertCall = mockUpsert.mock.calls[0];
      const savedPaa = upsertCall[0];
      
      // Should only save valid questions
      expect(savedPaa).toHaveLength(2);
      expect(savedPaa[0].question).toBe('What is a business coach?');
      expect(savedPaa[1].question).toBe('How to find a business coach?');
    });

    it('should deduplicate questions by case-insensitive question text', async () => {
      const queryId = 'test-query-id';
      const duplicatePaa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[] = [
        { question: 'What is a business coach?', answer: 'Answer 1' },
        { question: 'what is a business coach?', answer: 'Answer 2' }, // Duplicate
        { question: 'WHAT IS A BUSINESS COACH?', answer: 'Answer 3' }, // Duplicate
        { question: 'How to become a business coach?', answer: 'Answer 4' },
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.savePeopleAlsoAsk(queryId, duplicatePaa);

      const upsertCall = mockUpsert.mock.calls[0];
      const savedPaa = upsertCall[0];
      
      // Should deduplicate to 2 unique questions
      expect(savedPaa).toHaveLength(2);
      
      // Should keep first occurrence of "what is a business coach?"
      const firstQuestion = savedPaa.find((p: any) => 
        p.question.toLowerCase() === 'what is a business coach?'
      );
      expect(firstQuestion).toBeDefined();
      expect(firstQuestion.answer).toBe('Answer 1');
      
      // Should keep "How to become a business coach?"
      const secondQuestion = savedPaa.find((p: any) => 
        p.question.toLowerCase() === 'how to become a business coach?'
      );
      expect(secondQuestion).toBeDefined();
    });

    it('should handle empty array', async () => {
      const queryId = 'test-query-id';
      const paa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[] = [];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.savePeopleAlsoAsk(queryId, paa);

      // Should return early without calling upsert
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('should return early if no valid questions after filtering', async () => {
      const queryId = 'test-query-id';
      const invalidPaa: Omit<PeopleAlsoAsk, 'id' | 'query_id' | 'created_at'>[] = [
        { question: null as any, answer: 'Some answer' },
        { question: '', answer: 'Some answer' },
      ];

      const mockFrom = jest.fn(() => ({
        upsert: mockUpsert,
      }));
      (storage as any).supabase = {
        from: mockFrom,
      };

      await storage.savePeopleAlsoAsk(queryId, invalidPaa);

      // Should not call upsert if no valid questions
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });
});

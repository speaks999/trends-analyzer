import { useState, useEffect, useCallback } from 'react';
import { storage, Query } from '@/app/lib/storage';
import { classifyIntents } from '@/app/lib/intent-classifier';
import { useAuth } from '@/app/lib/auth-context';

export function useQueryManagement() {
  const { session } = useAuth();
  const [queries, setQueries] = useState<Query[]>([]);
  const [classifications, setClassifications] = useState<Map<string, import('@/app/lib/storage').IntentClassification>>(new Map());

  const loadQueries = useCallback(async () => {
    try {
      const allQueries = await storage.getAllQueries();
      setQueries(allQueries);

      // Load classifications
      const allClassifications = await storage.getAllIntentClassifications();
      const classificationsMap = new Map<string, import('@/app/lib/storage').IntentClassification>();
      allClassifications.forEach(classification => {
        classificationsMap.set(classification.query_id, classification);
      });
      setClassifications(classificationsMap);
    } catch (error) {
      console.error('Error loading queries:', error);
    }
  }, []);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  const handleAddQuery = useCallback(async (queryText: string) => {
    try {
      const query = await storage.addQuery({ text: queryText });
      setQueries(prev => [...prev, query]);

      // Classify intent
      try {
        const results = await classifyIntents([{ id: query.id, text: queryText }]);
        if (results.length > 0) {
          setClassifications(prev => {
            const newMap = new Map(prev);
            newMap.set(results[0].query_id, results[0]);
            return newMap;
          });
          
          // Store classification in database
          await storage.setIntentClassification(results[0]);
        }
      } catch (error) {
        console.error('Error classifying intent:', error);
      }

      // E2E test mode: skip network enrichment (runs without external services).
      if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
        return;
      }

      // Automatically fetch and store related topics and PAA data
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        
        const response = await fetch('/api/cluster/enrich', {
          method: 'POST',
          headers,
          body: JSON.stringify({ queryIds: [query.id] }),
        });
        if (response.ok) {
          console.log(`[Query Management] Enriched query ${query.id} with related topics and PAA`);
        }
      } catch (error) {
        console.warn('Error enriching query (non-blocking):', error);
      }
    } catch (error) {
      console.error('Error adding query:', error);
      alert('Failed to add query. Please try again.');
    }
  }, [session]);

  const handleRemoveQuery = useCallback(async (id: string) => {
    try {
      await storage.removeQuery(id);
      setQueries(prev => prev.filter(q => q.id !== id));
      setClassifications(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
    } catch (error) {
      console.error('Error removing query:', error);
      alert('Failed to remove query. Please try again.');
    }
  }, []);

  return {
    queries,
    classifications,
    handleAddQuery,
    handleRemoveQuery,
    refreshQueries: loadQueries,
  };
}

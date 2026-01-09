// API endpoint to enrich queries with related topics and related questions data
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedStorage } from '@/app/lib/auth-helpers';
import { getRelatedTopics } from '@/app/lib/trends';
import { getRelatedQuestions } from '@/app/lib/search-intent';

export async function POST(request: NextRequest) {
  try {
    const storage = await getAuthenticatedStorage(request);
    const body = await request.json();
    const { queryIds, forceRefresh = false } = body;

    if (!queryIds || !Array.isArray(queryIds) || queryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'queryIds array is required' },
        { status: 400 }
      );
    }

    // Get all queries
    const allQueries = await storage.getAllQueries();
    const queriesToEnrich = allQueries.filter(q => queryIds.includes(q.id));

    if (queriesToEnrich.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No queries found to enrich',
        enriched: 0,
      });
    }

    console.log(`[Enrich API] Enriching ${queriesToEnrich.length} queries with related topics and related questions (forceRefresh: ${forceRefresh})`);

    const storagePromises: Promise<void>[] = [];
    let enrichedCount = 0;

    // Fetch and store related topics and PAA for each query
    for (const query of queriesToEnrich) {
      // Check if query already has data (skip if forceRefresh)
      const existingTopics = forceRefresh ? [] : await storage.getRelatedTopics(query.id);
      const existingQuestions = forceRefresh ? [] : await storage.getRelatedQuestions(query.id);

      // Only fetch if missing or forceRefresh
      if (existingTopics.length === 0) {
        try {
          const relatedTopics = await getRelatedTopics(query.text);
          
          if (relatedTopics.length > 0) {
            // Map topics to storage format
            const mappedTopics = relatedTopics
              .filter(t => t && t.topic && typeof t.topic === 'string' && t.topic.trim().length > 0)
              .map(t => {
                let numericValue: number = typeof t.value === 'number' ? t.value : 0;
                const valueStr = String(t.value || '');
                if (valueStr.toLowerCase() === 'breakout' || valueStr.includes('%')) {
                  numericValue = 100;
                } else if (typeof t.value === 'string') {
                  const parsed = parseFloat(t.value);
                  numericValue = isNaN(parsed) ? 0 : parsed;
                }
                return {
                  topic: t.topic,
                  value: numericValue,
                  is_rising: t.isRising,
                  link: t.link,
                };
              });
            
            if (mappedTopics.length > 0) {
              storagePromises.push(
                storage.saveRelatedTopics(query.id, mappedTopics).catch(err => {
                  console.error(`Error storing related topics for query ${query.id}:`, err);
                })
              );
              enrichedCount++;
            }
          }
        } catch (error) {
          console.warn(`Error fetching related topics for query ${query.text}:`, error);
        }
      }

      if (existingQuestions.length === 0) {
        try {
          // Use the new Google Related Questions API
          const relatedQuestions = await getRelatedQuestions(query.text);
          if (relatedQuestions.length > 0) {
            console.log(`[Enrich API] Storing ${relatedQuestions.length} Related Questions for query ${query.id} (${query.text})`);
            storagePromises.push(
              storage.saveRelatedQuestions(query.id, relatedQuestions.map(q => ({
                question: q.question,
                answer: q.answer,
                snippet: q.snippet,
                title: q.title,
                link: q.link,
                source_logo: q.source_logo,
              }))).catch(err => {
                console.warn(`Error storing Related Questions for query ${query.id}:`, err);
              })
            );
            enrichedCount++;
          }
        } catch (error) {
          console.warn(`Error fetching Related Questions for query ${query.text}:`, error);
        }
      }
    }

    // Wait for all storage operations to complete
    if (storagePromises.length > 0) {
      await Promise.all(storagePromises);
      console.log(`[Enrich API] Successfully enriched ${enrichedCount} queries`);
    }

    return NextResponse.json({
      success: true,
      message: `Enriched ${enrichedCount} queries with related topics and related questions`,
      enriched: enrichedCount,
    });
  } catch (error) {
    console.error('Error enriching queries:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich queries',
      },
      { status: 500 }
    );
  }
}

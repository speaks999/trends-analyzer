// Search intent data from DataForSEO SERP API

// RelatedQuestion interface - matches the API response format
export type RelatedQuestionResponse = {
  question: string;
  answer?: string;
  snippet?: string;
  title?: string;
  link?: string;
  source_logo?: string;
};

/**
 * Fetch Related Questions using DataForSEO SERP API
 * DataForSEO provides People Also Ask questions directly from SERP data
 */
export async function getRelatedQuestions(
  keyword: string,
  maxQuestions: number = 10
): Promise<RelatedQuestionResponse[]> {
  try {
    const { getRelatedQuestionsFromSerp, isDataForSEOConfigured } = await import('./dataforseo-serp');
    if (isDataForSEOConfigured()) {
      const dataForSEOQuestions = await getRelatedQuestionsFromSerp(keyword, 'US');
      if (dataForSEOQuestions.length > 0) {
        console.log(`[Related Questions] Using DataForSEO SERP: ${dataForSEOQuestions.length} questions for "${keyword}"`);
        // Map to RelatedQuestionResponse format and limit
        return dataForSEOQuestions.slice(0, maxQuestions).map(q => ({
          question: q.question,
          answer: q.answer,
          snippet: q.snippet,
          title: q.title,
          link: q.link,
          source_logo: q.source_logo,
        }));
      }
    } else {
      console.warn('DataForSEO is not configured. Related questions will not be available.');
    }
  } catch (error) {
    console.warn(`[Related Questions] DataForSEO SERP failed for "${keyword}":`, error instanceof Error ? error.message : String(error));
  }
  return [];
}

// Keep backward compatibility alias (deprecated)
export const getPeopleAlsoAsk = getRelatedQuestions;
export type PeopleAlsoAskResponse = RelatedQuestionResponse;

// Search intent data from SERPAPI Google Search
// Using Google Related Questions API: https://serpapi.com/google-related-questions-api

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
 * Fetch Related Questions using SERPAPI Google Related Questions API
 * This is a two-step process:
 * 1. First, do a regular Google Search to get the initial related_questions with next_page_token
 * 2. Optionally, use the token to get more related questions
 * 
 * The initial Google Search already returns related_questions (People Also Ask),
 * and each question has a next_page_token to fetch more questions.
 */
export async function getRelatedQuestions(
  keyword: string,
  maxQuestions: number = 10
): Promise<RelatedQuestionResponse[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn('SERPAPI_API_KEY is not configured, skipping Related Questions data');
    return [];
  }

  try {
    // Step 1: Do a regular Google Search to get initial related questions
    const searchParams = new URLSearchParams({
      engine: 'google',
      q: keyword,
      api_key: apiKey,
    });

    const searchUrl = `https://serpapi.com/search.json?${searchParams.toString()}`;
    const searchResponse = await fetch(searchUrl);
    
    if (!searchResponse.ok) {
      console.warn(`SerpApi request failed for Related Questions: ${searchResponse.status} ${searchResponse.statusText}`);
      return [];
    }

    const searchData = await searchResponse.json();

    if (searchData.error) {
      console.warn(`SerpApi error for Related Questions: ${searchData.error}`);
      return [];
    }

    // Get initial related_questions from the search
    const initialQuestions = searchData.related_questions || [];
    
    const questions: RelatedQuestionResponse[] = initialQuestions.map((item: any) => ({
      question: item.question || '',
      answer: item.snippet || item.answer || undefined,
      snippet: item.snippet || undefined,
      title: item.title || undefined,
      link: item.link || undefined,
      source_logo: item.source_logo || undefined,
    }));

    // Filter out empty questions and limit
    const validQuestions = questions.filter(q => q.question && q.question.trim().length > 0);
    
    // If we have tokens and need more questions, fetch additional ones
    // (This uses one extra API credit per expansion, so we limit it)
    if (validQuestions.length < maxQuestions && initialQuestions.length > 0) {
      // Get up to 2 more batches of related questions using tokens
      const tokensToExpand = initialQuestions
        .filter((q: any) => q.next_page_token)
        .slice(0, 2);
      
      for (const item of tokensToExpand) {
        if (validQuestions.length >= maxQuestions) break;
        
        try {
          const expandParams = new URLSearchParams({
            engine: 'google_related_questions',
            next_page_token: item.next_page_token,
            api_key: apiKey,
          });
          
          const expandUrl = `https://serpapi.com/search.json?${expandParams.toString()}`;
          const expandResponse = await fetch(expandUrl);
          
          if (expandResponse.ok) {
            const expandData = await expandResponse.json();
            const moreQuestions = expandData.related_questions || [];
            
            for (const moreQ of moreQuestions) {
              if (validQuestions.length >= maxQuestions) break;
              if (moreQ.question && !validQuestions.some(vq => vq.question.toLowerCase() === moreQ.question.toLowerCase())) {
                validQuestions.push({
                  question: moreQ.question || '',
                  answer: moreQ.snippet || moreQ.answer || undefined,
                  snippet: moreQ.snippet || undefined,
                  title: moreQ.title || undefined,
                  link: moreQ.link || undefined,
                  source_logo: moreQ.source_logo || undefined,
                });
              }
            }
          }
        } catch (expandError) {
          console.warn(`Error expanding related questions:`, expandError);
        }
      }
    }

    console.log(`[Related Questions] Found ${validQuestions.length} questions for "${keyword}"`);
    return validQuestions.slice(0, maxQuestions);
  } catch (error) {
    console.error(`Error fetching Related Questions for ${keyword}:`, error);
    return [];
  }
}

// Keep backward compatibility alias (deprecated)
export const getPeopleAlsoAsk = getRelatedQuestions;
export type PeopleAlsoAskResponse = RelatedQuestionResponse;

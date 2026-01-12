// DataForSEO SERP API client (server-side only).
// DataForSEO SERP API client for fetching Google search results.
//
// Required env vars:
// - DATAFORSEO_LOGIN (your DataForSEO login/email)
// - DATAFORSEO_PASSWORD (your DataForSEO API password)
//
// Optional:
// - DATAFORSEO_API_VERSION (default: v3)
//
// Sign up at: https://dataforseo.com/
// API docs: https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/

import type { RelatedTopic, RelatedQuestion } from './storage';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function geoToLocationCode(geo: string): number {
  const trimmed = geo.trim().toUpperCase();
  // Common location codes (ISO 3166-1 alpha-2 to DataForSEO location_code)
  const locationMap: Record<string, number> = {
    US: 2840, // United States
    GB: 2826, // United Kingdom
    CA: 2124, // Canada
    AU: 2036, // Australia
    DE: 2276, // Germany
    FR: 250,  // France
    ES: 724,  // Spain
    IT: 380,  // Italy
    BR: 76,   // Brazil
    MX: 484,  // Mexico
    IN: 356,  // India
    JP: 392,  // Japan
    CN: 156,  // China
  };
  
  if (locationMap[trimmed]) {
    return locationMap[trimmed];
  }
  
  // Default to US if unknown
  console.warn(`Unknown geo code "${geo}", defaulting to US (2840)`);
  return 2840;
}

export function isDataForSEOConfigured(): boolean {
  return Boolean(
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
  );
}

/**
 * Fetch Google SERP data using DataForSEO SERP API
 * This can extract related searches, People Also Ask, and other SERP features
 */
export async function fetchGoogleSerp(params: {
  keyword: string;
  geo?: string; // "US" or country code
  languageCode?: string; // "en" or language code (as string, not number)
  device?: 'desktop' | 'mobile' | 'tablet';
  depth?: number; // Number of results to fetch (default: 10)
}): Promise<any> {
  const login = requireEnv('DATAFORSEO_LOGIN');
  const password = requireEnv('DATAFORSEO_PASSWORD');
  const apiVersion = (process.env.DATAFORSEO_API_VERSION || 'v3').trim();

  const locationCode = geoToLocationCode(params.geo || 'US');
  const languageCode = (params.languageCode || 'en').trim(); // Keep as string for SERP API
  const device = params.device || 'desktop';
  const depth = params.depth || 10;

  // DataForSEO SERP API endpoint
  const url = `https://api.dataforseo.com/${apiVersion}/serp/google/organic/live/advanced`;
  
  // DataForSEO expects an array with a single object
  const postData = [{
    keyword: params.keyword,
    location_code: locationCode,
    language_code: languageCode, // SERP API accepts string language codes
    device: device,
    os: device === 'desktop' ? 'windows' : 'android',
    depth: depth,
  }];

  // Basic auth for DataForSEO
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();
  
  if (!response.ok) {
    const errorDetails = typeof data === 'object' ? JSON.stringify(data) : String(data);
    throw new Error(`DataForSEO SERP API error: ${response.status} ${errorDetails}`);
  }

  // DataForSEO returns results in tasks array
  if (Array.isArray(data.tasks) && data.tasks.length > 0) {
    const task = data.tasks[0];
    if (task.result && Array.isArray(task.result) && task.result.length > 0) {
      return task.result[0]; // Return the first result
    }
  }

  return null;
}

/**
 * Extract related searches from DataForSEO SERP data
 */
export async function getRelatedTopicsFromSerp(
  keyword: string,
  geo: string = 'US'
): Promise<RelatedTopic[]> {
  if (!isDataForSEOConfigured()) {
    return [];
  }

  try {
    const serpData = await fetchGoogleSerp({
      keyword,
      geo,
      languageCode: 'en',
      device: 'desktop',
      depth: 10,
    });

    if (!serpData) return [];

    const relatedTopics: RelatedTopic[] = [];

    // Extract related searches from SERP data
    // Based on actual DataForSEO response structure:
    // - related_searches type has items array of strings
    // - people_also_search type has items array of strings
    if (serpData.items && Array.isArray(serpData.items)) {
      for (const item of serpData.items) {
        // Extract from related_searches type
        if (item.type === 'related_searches' && item.items && Array.isArray(item.items)) {
          for (const searchTerm of item.items) {
            // Items are strings directly, not objects
            if (typeof searchTerm === 'string' && searchTerm.trim().length > 0) {
              const query = searchTerm.trim();
              // Avoid duplicates
              if (!relatedTopics.find(t => t.topic.toLowerCase() === query.toLowerCase())) {
                relatedTopics.push({
                  topic: query,
                  value: 50, // Default value (SERP doesn't provide trend values)
                  isRising: false,
                  link: undefined, // Related searches don't have direct links
                });
              }
            }
          }
        }
        
        // Extract from people_also_search type (these are also related topics)
        if (item.type === 'people_also_search' && item.items && Array.isArray(item.items)) {
          for (const searchTerm of item.items) {
            // Items are strings directly
            if (typeof searchTerm === 'string' && searchTerm.trim().length > 0) {
              const query = searchTerm.trim();
              // Avoid duplicates
              if (!relatedTopics.find(t => t.topic.toLowerCase() === query.toLowerCase())) {
                relatedTopics.push({
                  topic: query,
                  value: 50, // Default value
                  isRising: false,
                  link: undefined,
                });
              }
            }
          }
        }
      }
    }

    return relatedTopics;
  } catch (error) {
    console.warn(`Error fetching related topics from DataForSEO SERP for "${keyword}":`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Extract People Also Ask questions from DataForSEO SERP data
 */
export async function getRelatedQuestionsFromSerp(
  keyword: string,
  geo: string = 'US'
): Promise<RelatedQuestion[]> {
  if (!isDataForSEOConfigured()) {
    return [];
  }

  try {
    const serpData = await fetchGoogleSerp({
      keyword,
      geo,
      languageCode: 'en',
      device: 'desktop',
      depth: 20, // Fetch more results to get PAA questions
    });

    if (!serpData) return [];

    const questions: RelatedQuestion[] = [];

    // Extract People Also Ask questions
    // Based on actual DataForSEO response structure:
    // - people_also_ask type has items array of objects with question, answer, etc.
    if (serpData.items && Array.isArray(serpData.items)) {
      for (const item of serpData.items) {
        if (item.type === 'people_also_ask' && item.items && Array.isArray(item.items)) {
          for (const paaItem of item.items) {
            // Items are objects with question, answer, title, url, etc.
            const question = paaItem.question || paaItem.title || paaItem.text;
            if (question && typeof question === 'string' && question.trim().length > 0) {
              // Avoid duplicates
              if (!questions.find(q => q.question.toLowerCase() === question.trim().toLowerCase())) {
                questions.push({
                  question: question.trim(),
                  answer: paaItem.answer || paaItem.snippet || undefined,
                  snippet: paaItem.snippet || paaItem.answer || paaItem.description || undefined,
                  title: paaItem.title || paaItem.question || undefined,
                  link: paaItem.url || paaItem.link || paaItem.href || undefined,
                  source_logo: paaItem.favicon || paaItem.thumbnail || undefined,
                });
              }
            }
          }
        }
      }
    }

    return questions;
  } catch (error) {
    console.warn(`Error fetching related questions from DataForSEO SERP for "${keyword}":`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

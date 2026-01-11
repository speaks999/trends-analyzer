// Article generation from search queries and related questions
import OpenAI from 'openai';
import { RelatedQuestion } from './storage';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. Article generation will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export type ArticlePlatform = 'blog' | 'linkedin' | 'instagram' | 'twitter';

export interface GeneratedArticle {
  title: string;
  content: string;
  platform: ArticlePlatform;
  wordCount?: number;
  characterCount?: number;
  hashtags?: string[];
  thread?: string[];
  searchQuery: string;
  createdAt: Date;
  questionsUsed: number;
}

// Build context from related questions
function buildQuestionsContext(relatedQuestions: RelatedQuestion[]): string {
  return relatedQuestions
    .filter(q => q.question && q.question.trim().length > 0)
    .map((q, i) => {
      let entry = `Q${i + 1}: ${q.question}`;
      if (q.snippet || q.answer) {
        entry += `\nA${i + 1}: ${q.snippet || q.answer}`;
      }
      return entry;
    })
    .join('\n\n');
}

/**
 * Generate a blog article from a search query and its related questions
 */
export async function generateBlogArticle(
  searchQuery: string,
  relatedQuestions: RelatedQuestion[]
): Promise<GeneratedArticle> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const questionsContext = buildQuestionsContext(relatedQuestions);

  const prompt = `You are an expert content writer creating a comprehensive blog article for entrepreneurs.

MAIN TOPIC: "${searchQuery}"

RELATED QUESTIONS AND ANSWERS FROM GOOGLE:
${questionsContext || 'No additional questions available - focus on the main topic.'}

Write a high-quality blog article (800-1200 words) that:
1. Directly addresses "${searchQuery}"
2. Incorporates insights from the related questions and answers
3. Provides actionable advice for business professionals
4. Has a compelling introduction, clear structure with ## headings, and strong conclusion
5. Answers the questions people are actually asking

Return JSON with:
- title: string (compelling, SEO-friendly title)
- content: string (markdown format with ## headings)`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional business content writer. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  
  return {
    title: parsed.title || `Guide to ${searchQuery}`,
    content: parsed.content || '',
    platform: 'blog',
    wordCount: parsed.content?.split(/\s+/).length || 0,
    searchQuery,
    createdAt: new Date(),
    questionsUsed: relatedQuestions.filter(q => q.question).length,
  };
}

/**
 * Generate a LinkedIn post from a search query and its related questions
 */
export async function generateLinkedInArticle(
  searchQuery: string,
  relatedQuestions: RelatedQuestion[]
): Promise<GeneratedArticle> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const questionsContext = buildQuestionsContext(relatedQuestions);

  const prompt = `You are a LinkedIn content expert creating professional posts for entrepreneurs.

TOPIC: "${searchQuery}"

CONTEXT FROM RELATED QUESTIONS:
${questionsContext || 'Focus on the main topic.'}

Create a LinkedIn post (~1300 characters) that:
1. Opens with a compelling hook
2. Provides valuable insights on "${searchQuery}"
3. Uses professional yet engaging tone
4. Addresses key questions professionals have
5. Includes a call-to-action for engagement
6. Uses line breaks for readability

Return JSON with:
- content: string (the post, ~1300 characters)
- hashtags: string[] (3-5 professional hashtags)`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert LinkedIn writer. Create professional, engaging posts. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const hashtags = parsed.hashtags || [];
  const hashtagText = hashtags.length > 0 ? '\n\n' + hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ') : '';
  const fullContent = (parsed.content || '') + hashtagText;

  return {
    title: `LinkedIn: ${searchQuery}`,
    content: fullContent,
    platform: 'linkedin',
    characterCount: fullContent.length,
    hashtags,
    searchQuery,
    createdAt: new Date(),
    questionsUsed: relatedQuestions.filter(q => q.question).length,
  };
}

/**
 * Generate an Instagram caption from a search query and its related questions
 */
export async function generateInstagramArticle(
  searchQuery: string,
  relatedQuestions: RelatedQuestion[]
): Promise<GeneratedArticle> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const questionsContext = buildQuestionsContext(relatedQuestions);

  const prompt = `You are an Instagram content expert creating engaging captions for entrepreneurs.

TOPIC: "${searchQuery}"

CONTEXT FROM RELATED QUESTIONS:
${questionsContext || 'Focus on the main topic.'}

Create an Instagram caption (up to 2200 characters) that:
1. Opens with a compelling hook and emoji
2. Provides value on "${searchQuery}"
3. Uses emojis appropriately throughout
4. Is conversational and engaging
5. Addresses common questions entrepreneurs have
6. Uses line breaks for visual appeal
7. Ends with a call-to-action

Return JSON with:
- content: string (the caption, up to 2200 characters)
- hashtags: string[] (5-10 relevant hashtags)`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert Instagram writer. Create engaging captions with emojis. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const hashtags = parsed.hashtags || [];
  const hashtagText = hashtags.length > 0 ? '\n\n' + hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ') : '';
  const fullContent = (parsed.content || '') + hashtagText;

  return {
    title: `Instagram: ${searchQuery}`,
    content: fullContent,
    platform: 'instagram',
    characterCount: fullContent.length,
    hashtags,
    searchQuery,
    createdAt: new Date(),
    questionsUsed: relatedQuestions.filter(q => q.question).length,
  };
}

/**
 * Generate a Twitter/X post from a search query and its related questions
 */
export async function generateTwitterArticle(
  searchQuery: string,
  relatedQuestions: RelatedQuestion[]
): Promise<GeneratedArticle> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const questionsContext = buildQuestionsContext(relatedQuestions);

  const prompt = `You are a Twitter/X content expert creating viral posts for entrepreneurs.

TOPIC: "${searchQuery}"

CONTEXT FROM RELATED QUESTIONS:
${questionsContext || 'Focus on the main topic.'}

Create a Twitter/X post (max 280 characters) that:
1. Has a compelling hook
2. Provides a valuable insight about "${searchQuery}"
3. Is engaging and shareable
4. Stays UNDER 280 characters total (including hashtags)

Also create a thread (2-4 additional tweets) that expands on the topic, each max 280 characters.

Return JSON with:
- content: string (main tweet, max 280 chars including hashtags)
- hashtags: string[] (1-3 hashtags, already included in content)
- thread: string[] (2-4 follow-up tweets, each max 280 chars)`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert Twitter writer. Create engaging, concise posts under 280 characters. Always return valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
  
  return {
    title: `X/Twitter: ${searchQuery}`,
    content: parsed.content || '',
    platform: 'twitter',
    characterCount: (parsed.content || '').length,
    hashtags: parsed.hashtags || [],
    thread: parsed.thread || [],
    searchQuery,
    createdAt: new Date(),
    questionsUsed: relatedQuestions.filter(q => q.question).length,
  };
}

/**
 * Generate an article for a specific platform
 */
export async function generateQueryArticle(
  searchQuery: string,
  relatedQuestions: RelatedQuestion[],
  platform: ArticlePlatform = 'blog'
): Promise<GeneratedArticle> {
  // Deterministic offline stub for browser automation / CI without API keys.
  if (process.env.E2E_TEST_MODE === 'true') {
    const createdAt = new Date();
    const questionsUsed = relatedQuestions.filter((q) => q.question && q.question.trim().length > 0).length;

    if (platform === 'blog') {
      const content = `## Overview\n\nThis is an E2E stub article for "${searchQuery}".\n\n## Questions considered\n\n${questionsUsed} related questions available.\n`;
      return {
        title: `Guide to ${searchQuery}`,
        content,
        platform: 'blog',
        wordCount: content.split(/\s+/).filter(Boolean).length,
        searchQuery,
        createdAt,
        questionsUsed,
      };
    }

    const content = `E2E stub content for "${searchQuery}" on ${platform}.`;
    return {
      title:
        platform === 'linkedin'
          ? `LinkedIn: ${searchQuery}`
          : platform === 'instagram'
            ? `Instagram: ${searchQuery}`
            : `X/Twitter: ${searchQuery}`,
      content,
      platform,
      characterCount: content.length,
      hashtags: [],
      thread: platform === 'twitter' ? [`Follow-up for "${searchQuery}"`] : undefined,
      searchQuery,
      createdAt,
      questionsUsed,
    };
  }

  switch (platform) {
    case 'blog':
      return generateBlogArticle(searchQuery, relatedQuestions);
    case 'linkedin':
      return generateLinkedInArticle(searchQuery, relatedQuestions);
    case 'instagram':
      return generateInstagramArticle(searchQuery, relatedQuestions);
    case 'twitter':
      return generateTwitterArticle(searchQuery, relatedQuestions);
    default:
      return generateBlogArticle(searchQuery, relatedQuestions);
  }
}

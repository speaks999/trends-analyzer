// OpenAI API wrapper for generating entrepreneurial search queries

import OpenAI from 'openai';
import { QueryTemplate, GeneratedQuery, getAvailableTemplates, getExpansionDimensions } from './query-templates';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. OpenAI features will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface QueryGenerationOptions {
  count?: number;
  focus?: 'pain' | 'tool' | 'transition' | 'education' | 'all';
  context?: string; // Additional context about current trends
}

/**
 * Generate entrepreneurial search queries using OpenAI
 */
export async function generateQueries(
  options: QueryGenerationOptions = {}
): Promise<GeneratedQuery[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const { count = 3, focus = 'all', context } = options;
  const templates = getAvailableTemplates();
  const dimensions = getExpansionDimensions();

  const focusPrompt = focus !== 'all' 
    ? `Focus on ${focus}-driven queries (${focus === 'pain' ? 'problems entrepreneurs face' : focus === 'tool' ? 'tools and systems' : focus === 'transition' ? 'business transitions and scaling' : 'educational content'}).`
    : '';

  const contextPrompt = context
    ? `\n\nContext about current trends: ${context}\nUse this to generate more relevant queries.`
    : '';

  const prompt = `You are an expert at understanding what entrepreneurs search for on Google when they need help.

Generate ${count} short, keyword-focused search queries (2-4 words ideal, maximum 5 words). These should be:
- SHORT and keyword-like (e.g., "cash flow issues", "customer churn", "sales automation")
- Problem-focused core terms that entrepreneurs actually search
- Avoid full sentences or long phrases (e.g., NOT "how to fix cash flow issues in my early-stage startup")
- Think like Google Trends keywords - simple, searchable terms
- Relevant to common entrepreneurial challenges
${focusPrompt}

Examples of GOOD short queries:
- "cash flow problems"
- "customer acquisition cost"
- "sales follow up"
- "startup funding"
- "churn rate"
- "pricing strategy"

Examples of BAD long queries (avoid these):
- "how to fix cash flow issues in my early-stage startup"
- "best way to manage customer acquisition costs for growth"
- "software for automating sales follow-up processes"

Available dimensions to inspire topics:
- Stages: ${dimensions.stages.join(', ')}
- Functions: ${dimensions.functions.join(', ')}
- Pains: ${dimensions.pains.join(', ')}
- Assets: ${dimensions.assets.join(', ')}
${contextPrompt}

Return a JSON object with a "queries" array of SHORT keyword phrases:
{"queries": ["cash flow issues", "customer churn", "sales automation"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates realistic Google search queries for entrepreneurs.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response);
    // Handle different response formats
    let queries: string[] = [];
    if (Array.isArray(parsed.queries)) {
      queries = parsed.queries;
    } else if (Array.isArray(parsed)) {
      queries = parsed;
    } else if (parsed.queries && Array.isArray(parsed.queries)) {
      queries = parsed.queries;
    } else {
      // Try to extract queries from object values
      queries = Object.values(parsed).flat().filter((v: any): v is string => typeof v === 'string');
    }

    // Map to GeneratedQuery format with metadata
    return queries.slice(0, count).map((text: string): GeneratedQuery => {
      // Try to infer metadata from query text
      const metadata: GeneratedQuery['metadata'] = {
        template: inferTemplate(text),
      };

      // Infer dimensions from text
      const lowerText = text.toLowerCase();
      for (const stage of dimensions.stages) {
        if (lowerText.includes(stage)) {
          metadata.stage = stage as any;
          break;
        }
      }
      for (const func of dimensions.functions) {
        if (lowerText.includes(func)) {
          metadata.function = func as any;
          break;
        }
      }
      for (const pain of dimensions.pains) {
        if (lowerText.includes(pain)) {
          metadata.pain = pain as any;
          break;
        }
      }
      for (const asset of dimensions.assets) {
        if (lowerText.includes(asset.toLowerCase())) {
          metadata.asset = asset as any;
          break;
        }
      }

      return { text, metadata };
    });
  } catch (error) {
    console.error('Error generating queries with OpenAI:', error);
    throw error;
  }
}

/**
 * Improve/refine queries based on trends data feedback
 */
export async function improveQueries(
  queries: string[],
  trendsFeedback: {
    highInterest: string[];
    lowInterest: string[];
    rising: string[];
  }
): Promise<GeneratedQuery[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  const prompt = `Based on Google Trends data, improve these entrepreneurial search queries:

Current queries:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Trends feedback:
- High interest: ${trendsFeedback.highInterest.join(', ')}
- Low interest: ${trendsFeedback.lowInterest.join(', ')}
- Rising: ${trendsFeedback.rising.join(', ')}

Generate improved versions of the queries that:
1. Follow patterns from high-interest queries
2. Avoid patterns from low-interest queries
3. Incorporate insights from rising trends
4. Are more specific and actionable

Return a JSON object with a "queries" array of improved query strings.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at optimizing search queries based on trend data.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response);
    // Handle different response formats
    let improvedQueries: string[] = [];
    if (Array.isArray(parsed.queries)) {
      improvedQueries = parsed.queries;
    } else if (Array.isArray(parsed)) {
      improvedQueries = parsed;
    } else if (parsed.queries && Array.isArray(parsed.queries)) {
      improvedQueries = parsed.queries;
    } else {
      improvedQueries = Object.values(parsed).flat().filter((v: any): v is string => typeof v === 'string');
    }

    return improvedQueries.map((text: string): GeneratedQuery => ({
      text,
      metadata: { template: inferTemplate(text) },
    }));
  } catch (error) {
    console.error('Error improving queries with OpenAI:', error);
    throw error;
  }
}

/**
 * Infer template from query text
 */
function inferTemplate(text: string): QueryTemplate {
  const lower = text.toLowerCase();
  if (lower.includes('how to get') || lower.includes('how to obtain')) {
    return 'how to get {result}';
  }
  if (lower.includes('how to fix') || lower.includes('how to solve')) {
    return 'how to fix {problem}';
  }
  if (lower.includes('best way to manage') || lower.includes('how to manage')) {
    return 'best way to manage {thing}';
  }
  if (lower.includes('software for') || lower.includes('tool for')) {
    return 'software for {job}';
  }
  if (lower.includes('why is') && lower.includes('low')) {
    return 'why is {metric} low';
  }
  if (lower.includes('how to exit')) {
    return 'how to exit {business_type}';
  }
  return 'how to get {result}'; // default
}


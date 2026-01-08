// AI-powered recommendation generation using OpenAI

import OpenAI from 'openai';
import { EntrepreneurProfile } from './storage';
import { TrendScoreResult } from './scoring';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. AI-powered recommendations will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface TutorialRecommendation {
  title: string;
  description: string;
  query: string;
  score: number;
  evidence: string[];
  ai_generated: boolean;
}

export interface FeatureRecommendation {
  title: string;
  description: string;
  cluster: string;
  averageScore: number;
  queryCount: number;
  evidence: string[];
  ai_generated: boolean;
}

/**
 * Build profile context string for OpenAI prompts
 */
function buildProfileContext(profile: EntrepreneurProfile | null): string {
  if (!profile) {
    return 'The entrepreneur profile is not set. Generate general recommendations suitable for a broad audience.';
  }

  const parts: string[] = [];
  
  if (profile.demographic) {
    parts.push(`Demographic: ${profile.demographic}`);
  }
  
  if (profile.tech_savviness) {
    const techLevel = {
      'non-tech': 'not tech-savvy - avoid technical jargon, focus on simple solutions',
      'basic': 'has basic technical knowledge - keep explanations clear and straightforward',
      'intermediate': 'has intermediate technical knowledge - can handle moderate complexity',
      'advanced': 'highly tech-savvy - can handle advanced technical content',
    }[profile.tech_savviness] || profile.tech_savviness;
    parts.push(`Technical Level: ${techLevel}`);
  }
  
  if (profile.business_stage) {
    parts.push(`Business Stage: ${profile.business_stage}`);
  }
  
  if (profile.industry) {
    parts.push(`Industry: ${profile.industry}`);
  }
  
  if (profile.geographic_region) {
    parts.push(`Geographic Region: ${profile.geographic_region}`);
  }

  return parts.length > 0 
    ? `Entrepreneur Profile:\n${parts.join('\n')}\n\nTailor all recommendations to this specific profile.`
    : 'No specific profile information available. Generate general recommendations.';
}

/**
 * Generate tutorial recommendations using OpenAI based on high TOS queries
 */
export async function generateTutorialRecommendationsAI(
  topQueries: Array<{ query_id: string; query_text: string; score: number; breakdown: any; classification: string }>,
  profile: EntrepreneurProfile | null,
  limit: number = 10
): Promise<TutorialRecommendation[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  if (topQueries.length === 0) {
    return [];
  }

  const profileContext = buildProfileContext(profile);

  // Format top queries for the prompt
  const queriesList = topQueries
    .slice(0, 20) // Limit to top 20 for prompt size
    .map((q, i) => `${i + 1}. "${q.query_text}" (TOS Score: ${q.score}/100, Classification: ${q.classification})`)
    .join('\n');

  const prompt = `You are an expert at creating tutorial recommendations for entrepreneurs based on trending search queries.

${profileContext}

Based on these high-scoring trending queries from Google Trends:
${queriesList}

Generate ${limit} tutorial recommendations. Each tutorial should:
1. Address one of the high-scoring queries directly
2. Be tailored to the entrepreneur's profile (especially tech-savviness level)
3. Provide clear value and actionable content
4. Be specific and relevant to the query's intent

For each recommendation, provide:
- A compelling, specific title (e.g., "Tutorial: How to Fix Cash Flow Issues for Non-Tech Entrepreneurs")
- A detailed description explaining what the tutorial should cover and why it's valuable
- The original query it addresses
- The TOS score as evidence of demand
- Brief evidence points about why this tutorial is recommended

Return a JSON object with a "tutorials" array. Each tutorial object should have:
- title: string
- description: string (2-3 sentences)
- query: string (the original query text)
- score: number (the TOS score)
- evidence: string[] (array of 2-3 evidence strings)

Focus on tutorials that match the entrepreneur's tech-savviness level and business context.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates tailored tutorial recommendations for entrepreneurs based on trending search data.',
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
    let tutorials: TutorialRecommendation[] = [];

    if (Array.isArray(parsed.tutorials)) {
      tutorials = parsed.tutorials.map((t: any) => ({
        ...t,
        ai_generated: true,
      }));
    } else if (parsed.tutorial && typeof parsed.tutorial === 'object') {
      tutorials = [{
        ...parsed.tutorial,
        ai_generated: true,
      }];
    }

    return tutorials.slice(0, limit);
  } catch (error) {
    console.error('Error generating AI tutorial recommendations:', error);
    throw error;
  }
}

/**
 * Generate tutorial recommendations for a specific opportunity cluster
 * This creates tutorials tailored to the cluster's theme, intent type, and queries
 */
export async function generateClusterTutorialRecommendationsAI(
  cluster: {
    name: string;
    intent_type: string;
    average_score: number;
    queries: Array<{ query_id: string; query_text: string; score: number; classification?: string }>;
  },
  profile: EntrepreneurProfile | null,
  limit: number = 5
): Promise<TutorialRecommendation[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  if (cluster.queries.length === 0) {
    return [];
  }

  const profileContext = buildProfileContext(profile);

  // Format queries for the prompt
  const queriesList = cluster.queries
    .map((q, i) => `${i + 1}. "${q.query_text}" (TOS Score: ${q.score}/100${q.classification ? `, ${q.classification}` : ''})`)
    .join('\n');

  // Build intent context
  const intentContexts: Record<string, string> = {
    pain: 'This cluster represents problems and pain points entrepreneurs are facing. Focus on tutorials that help solve these specific problems.',
    tool: 'This cluster represents tools and solutions entrepreneurs are seeking. Focus on tutorials that teach how to use or implement these tools.',
    transition: 'This cluster represents transitions or changes entrepreneurs are making. Focus on tutorials that guide through these transitions.',
    education: 'This cluster represents learning opportunities. Focus on educational tutorials that build knowledge and skills.',
  };
  const intentContext = intentContexts[cluster.intent_type] || 'This cluster represents a group of related queries.';

  const prompt = `You are an expert at creating tutorial recommendations for entrepreneurs based on opportunity clusters from Google Trends data.

${profileContext}

You are analyzing a specific opportunity cluster:
- Cluster Name: "${cluster.name}"
- Intent Type: ${cluster.intent_type} - ${intentContext}
- Average TOS Score: ${cluster.average_score}/100 (indicating ${cluster.average_score >= 70 ? 'high' : cluster.average_score >= 50 ? 'moderate' : 'growing'} trending interest)
- Number of Related Queries: ${cluster.queries.length}

All queries in this cluster:
${queriesList}

Generate ${limit} tutorial recommendations that:
1. Address the CLUSTER as a whole theme, not just individual queries
2. Are tailored to the entrepreneur's profile (especially tech-savviness and business stage)
3. Match the cluster's intent type (${cluster.intent_type})
4. Leverage the fact that these ${cluster.queries.length} queries are related and represent a cohesive opportunity
5. Provide clear, actionable value that addresses the underlying need represented by this cluster

For each recommendation, provide:
- A compelling, specific title that reflects the cluster theme (e.g., "Tutorial: Mastering Cash Flow Management for ${profile?.business_stage || 'Small Business'} Entrepreneurs")
- A detailed description (2-3 sentences) explaining what the tutorial covers, why it's valuable, and how it addresses the cluster
- The cluster name as the query reference
- The average cluster score as evidence of demand
- Brief evidence points (2-3) about why this tutorial is recommended for this cluster

Return a JSON object with a "tutorials" array. Each tutorial object should have:
- title: string (compelling, specific)
- description: string (2-3 sentences explaining the tutorial content and value)
- query: string (use the cluster name: "${cluster.name}")
- score: number (use the cluster average score: ${cluster.average_score})
- evidence: string[] (array of 2-3 evidence strings explaining why this tutorial fits the cluster)

Focus on tutorials that:
- Address the cluster theme holistically
- Match the entrepreneur's tech-savviness level: ${profile?.tech_savviness || 'intermediate'}
- Are appropriate for their business stage: ${profile?.business_stage || 'growth'}
- Align with the ${cluster.intent_type} intent type`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates tailored tutorial recommendations for entrepreneurs based on opportunity clusters from trending search data. You understand how to synthesize multiple related queries into cohesive tutorial themes.',
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
    let tutorials: TutorialRecommendation[] = [];

    if (Array.isArray(parsed.tutorials)) {
      tutorials = parsed.tutorials.map((t: any) => ({
        ...t,
        ai_generated: true,
      }));
    } else if (parsed.tutorial && typeof parsed.tutorial === 'object') {
      tutorials = [{
        ...parsed.tutorial,
        ai_generated: true,
      }];
    }

    return tutorials.slice(0, limit);
  } catch (error) {
    console.error('Error generating cluster tutorial recommendations:', error);
    throw error;
  }
}

/**
 * Generate feature recommendations using OpenAI based on opportunity clusters
 */
export async function generateFeatureRecommendationsAI(
  clusters: Array<{ name: string; intent_type: string; average_score: number; query_count: number; queries: string[] }>,
  profile: EntrepreneurProfile | null,
  limit: number = 10
): Promise<FeatureRecommendation[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  if (clusters.length === 0) {
    return [];
  }

  const profileContext = buildProfileContext(profile);

  // Format clusters for the prompt
  const clustersList = clusters
    .slice(0, 15) // Limit for prompt size
    .map((c, i) => `${i + 1}. "${c.name}" (Intent: ${c.intent_type}, Avg Score: ${Math.round(c.average_score)}, ${c.query_count} queries: ${c.queries.slice(0, 3).join(', ')})`)
    .join('\n');

  const prompt = `You are an expert at recommending product features for entrepreneurs based on opportunity clusters from search trend data.

${profileContext}

Based on these opportunity clusters (grouped related queries):
${clustersList}

Generate ${limit} feature recommendations. Each feature should:
1. Address a real need represented by one of the clusters
2. Be tailored to the entrepreneur's profile, industry, and business stage
3. Be practical and buildable
4. Provide clear value to the target market

For each recommendation, provide:
- A compelling feature name (e.g., "Automated Cash Flow Forecasting Tool")
- A detailed description explaining what the feature does, who it's for, and why it's valuable
- The cluster name it's based on
- The average score as evidence of demand
- The query count showing market interest
- Brief evidence points about why this feature is recommended

Return a JSON object with a "features" array. Each feature object should have:
- title: string
- description: string (2-3 sentences)
- cluster: string (the cluster name)
- averageScore: number (the average TOS score)
- queryCount: number (number of queries in cluster)
- evidence: string[] (array of 2-3 evidence strings)

Focus on features that match the entrepreneur's industry, business stage, and technical capabilities.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates tailored product feature recommendations for entrepreneurs based on trending search data and opportunity clusters.',
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
    let features: FeatureRecommendation[] = [];

    if (Array.isArray(parsed.features)) {
      features = parsed.features.map((f: any) => ({
        ...f,
        ai_generated: true,
      }));
    } else if (parsed.feature && typeof parsed.feature === 'object') {
      features = [{
        ...parsed.feature,
        ai_generated: true,
      }];
    }

    return features.slice(0, limit);
  } catch (error) {
    console.error('Error generating AI feature recommendations:', error);
    throw error;
  }
}

/**
 * Generate feature recommendations for a specific cluster using OpenAI
 */
export async function generateClusterFeatureRecommendationsAI(
  cluster: { name: string; intent_type: string; average_score: number; queries: Array<{ query_id: string; query_text: string; score: number; classification: string }> },
  profile: EntrepreneurProfile | null,
  limit: number = 5
): Promise<FeatureRecommendation[]> {
  if (!openai) {
    throw new Error('OpenAI API key is not configured');
  }

  if (cluster.queries.length === 0) {
    return [];
  }

  const profileContext = buildProfileContext(profile);

  const clusterQueriesList = cluster.queries
    .map((q, i) => `${i + 1}. "${q.query_text}" (TOS Score: ${q.score}/100, Classification: ${q.classification})`)
    .join('\n');

  const prompt = `You are an expert at creating product feature recommendations for entrepreneurs based on a specific opportunity cluster from trending search queries.

${profileContext}

The opportunity cluster is named "${cluster.name}" with an average TOS score of ${cluster.average_score}/100 and an intent type of "${cluster.intent_type}". It contains the following high-scoring trending queries:
${clusterQueriesList}

Generate ${limit} product feature recommendations specifically for this cluster. Each feature should:
1. Address the overall theme and intent of the cluster, not just individual queries.
2. Be tailored to the entrepreneur's profile (especially tech-savviness level, industry, and business stage).
3. Provide clear value and be practical to build.
4. Be specific and relevant to the cluster's intent and the queries within it.
5. Have a compelling, specific feature name (e.g., "Automated Cash Flow Forecasting Dashboard").

For each recommendation, provide:
- A compelling, specific feature name/title
- A detailed description explaining what the feature does, who it's for, and why it's valuable (2-3 sentences)
- The cluster name it's based on
- The average cluster score as evidence of demand
- The query count as evidence of market interest
- Brief evidence points about why this feature is recommended (2-3 points)

Return a JSON object with a "features" array. Each feature object should have:
- title: string (the feature name)
- description: string (2-3 sentences)
- cluster: string (the cluster name: "${cluster.name}")
- averageScore: number (the cluster average score: ${cluster.average_score})
- queryCount: number (the number of queries: ${cluster.queries.length})
- evidence: string[] (array of 2-3 evidence strings)

Focus on features that match the entrepreneur's tech-savviness level and business context, and leverage the collective insight from the cluster's queries.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates tailored product feature recommendations for entrepreneurs based on trending search data and opportunity clusters.',
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
    let features: FeatureRecommendation[] = [];

    if (Array.isArray(parsed.features)) {
      features = parsed.features.map((f: any) => ({
        ...f,
        ai_generated: true,
      }));
    } else if (parsed.feature && typeof parsed.feature === 'object') {
      features = [{
        ...parsed.feature,
        ai_generated: true,
      }];
    }

    return features.slice(0, limit);
  } catch (error) {
    console.error('Error generating AI cluster feature recommendations:', error);
    throw error;
  }
}

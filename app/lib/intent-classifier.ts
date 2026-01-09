// Intent classification for queries

import OpenAI from 'openai';
import { storage, IntentClassification } from './storage';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. Intent classification will use rule-based fallback.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export type IntentType = 'pain' | 'tool' | 'transition' | 'education';

export interface ClassificationResult {
  query_id: string;
  intent_type: IntentType;
  confidence: number;
  subcategory?: string;
}

/**
 * Rule-based intent classification (fallback when OpenAI is not available)
 */
function classifyByRules(queryText: string): { intent: IntentType; confidence: number } {
  const lower = queryText.toLowerCase();

  // Pain-driven indicators
  const painKeywords = [
    'problem', 'issue', 'struggle', 'difficulty', 'challenge', 'pain',
    'cash flow', 'churn', 'burnout', 'stress', 'failing', 'losing',
    'can\'t', 'unable', 'stuck', 'blocked'
  ];
  const painScore = painKeywords.filter(kw => lower.includes(kw)).length;

  // Tool-driven indicators
  const toolKeywords = [
    'software', 'tool', 'system', 'platform', 'app', 'solution',
    'CRM', 'dashboard', 'automation', 'integration', 'plugin'
  ];
  const toolScore = toolKeywords.filter(kw => lower.includes(kw)).length;

  // Transition-driven indicators
  const transitionKeywords = [
    'exit', 'scale', 'grow', 'expand', 'transition', 'change',
    'next step', 'move to', 'upgrade', 'migrate', 'switch'
  ];
  const transitionScore = transitionKeywords.filter(kw => lower.includes(kw)).length;

  // Education-driven indicators
  const educationKeywords = [
    'how to', 'learn', 'guide', 'tutorial', 'best practice',
    'tips', 'strategy', 'method', 'approach', 'way to'
  ];
  const educationScore = educationKeywords.filter(kw => lower.includes(kw)).length;

  // Determine intent based on highest score
  const scores = [
    { intent: 'pain' as IntentType, score: painScore },
    { intent: 'tool' as IntentType, score: toolScore },
    { intent: 'transition' as IntentType, score: transitionScore },
    { intent: 'education' as IntentType, score: educationScore },
  ];

  const maxScore = Math.max(...scores.map(s => s.score));
  const selected = scores.find(s => s.score === maxScore) || scores[0];

  // Calculate confidence based on score difference
  const totalScore = painScore + toolScore + transitionScore + educationScore;
  const confidence = totalScore > 0 ? Math.min(100, (selected.score / totalScore) * 100) : 50;

  return {
    intent: selected.intent,
    confidence: Math.round(confidence),
  };
}

/**
 * Analyze intent from multiple data sources
 */
export async function analyzeIntentFromMultipleSources(
  queryId: string,
  queryText: string,
  relatedTopics?: Array<{ topic: string; value: number }>,
  paaQuestions?: Array<{ question: string; answer?: string }>
): Promise<ClassificationResult & { subcategory?: string }> {
  if (!openai) {
    // Fallback to basic classification if OpenAI not available
    const basic = await classifyIntent(queryId, queryText);
    return basic;
  }

  try {
    // Build context from all sources
    const contextParts: string[] = [];
    
    if (relatedTopics && relatedTopics.length > 0) {
      contextParts.push(`Related Topics: ${relatedTopics.slice(0, 5).map(t => t.topic).join(', ')}`);
    }
    
    if (paaQuestions && paaQuestions.length > 0) {
      contextParts.push(`People Also Ask: ${paaQuestions.slice(0, 3).map(q => q.question).join('; ')}`);
    }

    const context = contextParts.length > 0 ? `\n\nAdditional Context:\n${contextParts.join('\n')}` : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at classifying search queries by intent. Classify queries into one of these categories:
- pain: Problems, struggles, challenges entrepreneurs face
- tool: Software, systems, platforms, solutions
- transition: Business changes, scaling, exits, migrations
- education: How-to guides, tutorials, learning, best practices

For each category, also identify the sub-category:
- Pain: Financial, Operational, Growth, Team, Customer
- Tool: CRM, Analytics, Automation, Communication, Marketing
- Transition: Scaling, Pivot, Exit, Acquisition, IPO
- Education: Strategy, Tactics, Case Studies, Frameworks

Respond with ONLY a JSON object: {"intent": "pain|tool|transition|education", "subcategory": "subcategory name", "confidence": 0-100}`,
        },
        {
          role: 'user',
          content: `Classify this query: "${queryText}"${context}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (response) {
      const parsed = JSON.parse(response);
      return {
        query_id: queryId,
        intent_type: parsed.intent || 'education',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        subcategory: parsed.subcategory || undefined,
      };
    }
  } catch (error) {
    console.error('Error analyzing intent from multiple sources:', error);
  }

  // Fallback to basic classification
  return await classifyIntent(queryId, queryText);
}

/**
 * Classify query intent using OpenAI (if available) or rules
 */
export async function classifyIntent(
  queryId: string,
  queryText: string
): Promise<ClassificationResult> {
  // Check if already classified
  const existing = await storage.getIntentClassification(queryId);
  if (existing) {
    return {
      query_id: queryId,
      intent_type: existing.intent_type,
      confidence: existing.confidence,
    };
  }

  let result: { intent: IntentType; confidence: number };

  if (openai) {
    try {
      // Use OpenAI for classification
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at classifying search queries by intent. Classify queries into one of these categories:
- pain: Problems, struggles, challenges entrepreneurs face
- tool: Software, systems, platforms, solutions
- transition: Business changes, scaling, exits, migrations
- education: How-to guides, tutorials, learning, best practices

Respond with ONLY a JSON object: {"intent": "pain|tool|transition|education", "confidence": 0-100}`,
          },
          {
            role: 'user',
            content: `Classify this query: "${queryText}"`,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        const parsed = JSON.parse(response);
        result = {
          intent: parsed.intent || 'education',
          confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        };
      } else {
        result = classifyByRules(queryText);
      }
    } catch (error) {
      console.error('Error classifying intent with OpenAI:', error);
      result = classifyByRules(queryText);
    }
  } else {
    result = classifyByRules(queryText);
  }

  // Store classification
  const classification: IntentClassification = {
    query_id: queryId,
    intent_type: result.intent,
    confidence: result.confidence,
    subcategory: (result as any).subcategory || undefined,
  };
  await storage.setIntentClassification(classification);

  return {
    query_id: queryId,
    intent_type: result.intent,
    confidence: result.confidence,
    subcategory: (result as any).subcategory || undefined,
  };
}

/**
 * Classify multiple queries
 */
export async function classifyIntents(
  queries: Array<{ id: string; text: string }>
): Promise<ClassificationResult[]> {
  const results = await Promise.all(
    queries.map(q => classifyIntent(q.id, q.text))
  );
  return results;
}

/**
 * Get queries by intent type
 */
export async function getQueriesByIntent(intent: IntentType): Promise<string[]> {
  const classifications = await storage.getAllIntentClassifications();
  return classifications
    .filter(c => c.intent_type === intent)
    .map(c => c.query_id);
}


// Actions engine - triggers content/product/alert actions based on scores and intent

import { storage as defaultStorage, Query } from './storage';
import { TrendScoreResult } from './scoring';
import { IntentType } from './intent-classifier';
import { OpportunityCluster } from './storage';
import type { DatabaseStorage } from './storage-db';

// Storage interface for dependency injection
type StorageInstance = DatabaseStorage;

export type ActionType = 'content' | 'product' | 'alert';

export interface ContentAction {
  type: 'content';
  category: 'blog' | 'tutorial' | 'checklist' | 'comparison' | 'email' | 'video';
  title: string;
  description: string;
  priority: number;
  queryIds: string[];
  clusterId?: string;
}

export interface ProductAction {
  type: 'product';
  category: 'feature' | 'rename' | 'onboarding' | 'template' | 'roadmap';
  title: string;
  description: string;
  priority: number;
  queryIds: string[];
  clusterId?: string;
}

export interface AlertAction {
  type: 'alert';
  category: 'threshold' | 'breakout' | 'summary';
  title: string;
  description: string;
  priority: number;
  queryIds: string[];
  clusterId?: string;
}

export type Action = ContentAction | ProductAction | AlertAction;

/**
 * Generate content actions based on queries and scores
 */
async function generateContentActions(
  queries: Query[],
  scores: TrendScoreResult[],
  clusters: OpportunityCluster[],
  storageInstance?: StorageInstance
): Promise<ContentAction[]> {
  const storage = storageInstance || defaultStorage;
  const actions: ContentAction[] = [];

  // High-scoring queries (breakout or growing) get content actions
  const highScoringQueries = queries.filter(q => {
    const score = scores.find(s => s.query_id === q.id);
    return score && (score.classification === 'breakout' || score.classification === 'growing');
  });

  for (const query of highScoringQueries) {
    const score = scores.find(s => s.query_id === query.id)!;
    const classification = await storage.getIntentClassification(query.id);
    const intent = classification?.intent_type || 'education';

    // Determine content type based on intent
    let category: ContentAction['category'] = 'blog';
    if (intent === 'education') {
      category = 'tutorial';
    } else if (intent === 'tool') {
      category = 'comparison';
    } else if (intent === 'pain') {
      category = 'checklist';
    }

    actions.push({
      type: 'content',
      category,
      title: `Create ${category} about: ${query.text}`,
      description: `High interest query (TOS: ${score.score}) - ${query.text}`,
      priority: score.score,
      queryIds: [query.id],
    });
  }

  // Cluster-based content actions
  clusters.forEach(cluster => {
    if (cluster.average_score >= 60 && cluster.queries.length >= 3) {
      actions.push({
        type: 'content',
        category: 'blog',
        title: `Content series: ${cluster.name}`,
        description: `Cluster of ${cluster.queries.length} related queries with average TOS of ${cluster.average_score}`,
        priority: cluster.average_score,
        queryIds: cluster.queries,
        clusterId: cluster.id,
      });
    }
  });

  return actions;
}

/**
 * Generate product actions based on queries and scores
 */
async function generateProductActions(
  queries: Query[],
  scores: TrendScoreResult[],
  clusters: OpportunityCluster[],
  storageInstance?: StorageInstance
): Promise<ProductAction[]> {
  const storage = storageInstance || defaultStorage;
  const actions: ProductAction[] = [];

  // Tool-driven queries with high scores suggest product features
  const toolQueries: Query[] = [];
  for (const q of queries) {
    const classification = await storage.getIntentClassification(q.id);
    if (classification?.intent_type === 'tool') {
      toolQueries.push(q);
    }
  }

  for (const query of toolQueries) {
    const score = scores.find(s => s.query_id === query.id);
    if (score && score.score >= 60) {
      actions.push({
        type: 'product',
        category: 'feature',
        title: `Consider feature: ${query.text}`,
        description: `High demand for tool/solution (TOS: ${score.score}) - ${query.text}`,
        priority: score.score,
        queryIds: [query.id],
      });
    }
  }

  // Pain-driven queries suggest product improvements
  const painQueries: Query[] = [];
  for (const q of queries) {
    const classification = await storage.getIntentClassification(q.id);
    if (classification?.intent_type === 'pain') {
      painQueries.push(q);
    }
  }

  for (const query of painQueries) {
    const score = scores.find(s => s.query_id === query.id);
    if (score && score.score >= 70) {
      actions.push({
        type: 'product',
        category: 'template',
        title: `Create template/automation for: ${query.text}`,
        description: `High pain point (TOS: ${score.score}) - ${query.text}`,
        priority: score.score,
        queryIds: [query.id],
      });
    }
  }

  // High-scoring clusters suggest roadmap items
  clusters.forEach(cluster => {
    if (cluster.average_score >= 70 && cluster.queries.length >= 5) {
      actions.push({
        type: 'product',
        category: 'roadmap',
        title: `Roadmap consideration: ${cluster.name}`,
        description: `Strong cluster signal (TOS: ${cluster.average_score}, ${cluster.queries.length} queries)`,
        priority: cluster.average_score,
        queryIds: cluster.queries,
        clusterId: cluster.id,
      });
    }
  });

  return actions;
}

/**
 * Generate alert actions
 */
function generateAlertActions(
  queries: Query[],
  scores: TrendScoreResult[]
): AlertAction[] {
  const actions: AlertAction[] = [];

  // Breakout queries (TOS >= 80)
  const breakoutQueries = queries.filter(q => {
    const score = scores.find(s => s.query_id === q.id);
    return score && score.classification === 'breakout';
  });

  if (breakoutQueries.length > 0) {
    actions.push({
      type: 'alert',
      category: 'breakout',
      title: `${breakoutQueries.length} breakout opportunity${breakoutQueries.length > 1 ? 'ies' : 'y'}`,
      description: `New breakout queries detected: ${breakoutQueries.map(q => q.text).join(', ')}`,
      priority: 100,
      queryIds: breakoutQueries.map(q => q.id),
    });
  }

  // Queries crossing threshold (recently reached 60+)
  const thresholdQueries = queries.filter(q => {
    const score = scores.find(s => s.query_id === q.id);
    return score && score.score >= 60 && score.score < 80;
  });

  if (thresholdQueries.length > 0) {
    actions.push({
      type: 'alert',
      category: 'threshold',
      title: `${thresholdQueries.length} query${thresholdQueries.length > 1 ? 'ies' : ''} showing growing demand`,
      description: `Queries with TOS 60-79: ${thresholdQueries.map(q => q.text).join(', ')}`,
      priority: 70,
      queryIds: thresholdQueries.map(q => q.id),
    });
  }

  return actions;
}

/**
 * Generate all actions based on current state
 */
export async function generateActions(storageInstance?: StorageInstance): Promise<Action[]> {
  const storage = storageInstance || defaultStorage;
  const queries = await storage.getAllQueries();
  const scores = await calculateTOSForQueries(queries.map(q => q.id));
  const clusters = await storage.getAllClusters();

  const contentActions = await generateContentActions(queries, scores, clusters, storageInstance);
  const productActions = await generateProductActions(queries, scores, clusters, storageInstance);
  const alertActions = generateAlertActions(queries, scores);

  // Combine and sort by priority
  const allActions: Action[] = [
    ...contentActions,
    ...productActions,
    ...alertActions,
  ].sort((a, b) => b.priority - a.priority);

  return allActions;
}

/**
 * Get actions by type
 */
export async function getActionsByType(type: ActionType, storageInstance?: StorageInstance): Promise<Action[]> {
  const allActions = await generateActions(storageInstance);
  return allActions.filter(a => a.type === type);
}

/**
 * Get top actions by priority
 */
export async function getTopActions(limit: number = 20, storageInstance?: StorageInstance): Promise<Action[]> {
  const allActions = await generateActions(storageInstance);
  return allActions.slice(0, limit);
}

// Helper function for calculateTOSForQueries
async function calculateTOSForQueries(queryIds: string[]): Promise<TrendScoreResult[]> {
  const { calculateTOSForQueries: calcTOS } = await import('./scoring');
  return await calcTOS(queryIds, '30d');
}


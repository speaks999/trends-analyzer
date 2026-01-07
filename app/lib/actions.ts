// Actions engine - triggers content/product/alert actions based on scores and intent

import { storage, Query } from './storage';
import { TrendScoreResult, calculateTOS } from './scoring';
import { IntentType } from './intent-classifier';
import { OpportunityCluster } from './storage';

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
function generateContentActions(
  queries: Query[],
  scores: TrendScoreResult[],
  clusters: OpportunityCluster[]
): ContentAction[] {
  const actions: ContentAction[] = [];

  // High-scoring queries (breakout or growing) get content actions
  const highScoringQueries = queries.filter(q => {
    const score = scores.find(s => s.query_id === q.id);
    return score && (score.classification === 'breakout' || score.classification === 'growing');
  });

  highScoringQueries.forEach(query => {
    const score = scores.find(s => s.query_id === query.id)!;
    const classification = storage.getIntentClassification(query.id);
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
  });

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
function generateProductActions(
  queries: Query[],
  scores: TrendScoreResult[],
  clusters: OpportunityCluster[]
): ProductAction[] {
  const actions: ProductAction[] = [];

  // Tool-driven queries with high scores suggest product features
  const toolQueries = queries.filter(q => {
    const classification = storage.getIntentClassification(q.id);
    return classification?.intent_type === 'tool';
  });

  toolQueries.forEach(query => {
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
  });

  // Pain-driven queries suggest product improvements
  const painQueries = queries.filter(q => {
    const classification = storage.getIntentClassification(q.id);
    return classification?.intent_type === 'pain';
  });

  painQueries.forEach(query => {
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
  });

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
export function generateActions(): Action[] {
  const queries = storage.getAllQueries();
  const scores = calculateTOSForQueries(queries.map(q => q.id));
  const clusters = storage.getAllClusters();

  const contentActions = generateContentActions(queries, scores, clusters);
  const productActions = generateProductActions(queries, scores, clusters);
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
export function getActionsByType(type: ActionType): Action[] {
  const allActions = generateActions();
  return allActions.filter(a => a.type === type);
}

/**
 * Get top actions by priority
 */
export function getTopActions(limit: number = 20): Action[] {
  const allActions = generateActions();
  return allActions.slice(0, limit);
}

// Helper function for calculateTOSForQueries
function calculateTOSForQueries(queryIds: string[]): TrendScoreResult[] {
  return queryIds.map(id => calculateTOS(id));
}


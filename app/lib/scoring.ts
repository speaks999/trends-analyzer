// Trend scoring engine - calculates TOS (Trend Opportunity Score)

import { storage, TrendSnapshot } from './storage';
import { TrendDataPoint } from './trends';
import type { DatabaseStorage } from './storage-db';

export interface ScoreBreakdown {
  slope: number;
  acceleration: number;
  consistency: number;
  breadth: number;
}

export interface TrendScoreResult {
  query_id: string;
  score: number; // TOS (0-100)
  breakdown: ScoreBreakdown;
  classification: 'breakout' | 'growing' | 'stable' | 'declining';
}

/**
 * Calculate slope (direction and steepness of interest over time)
 */
function calculateSlope(data: TrendDataPoint[]): number {
  if (data.length < 2) return 0;

  // Use linear regression to calculate slope
  const n = data.length;
  const x = data.map((_, i) => i);
  const y = data.map(d => d.value);

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  // Normalize to 0-100 scale (assuming max reasonable slope is 10)
  return Math.max(0, Math.min(100, (slope + 10) * 5));
}

/**
 * Calculate acceleration (change in slope over recent period)
 */
function calculateAcceleration(data: TrendDataPoint[]): number {
  if (data.length < 4) return 0;

  // Split data into two halves
  const mid = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid);
  const secondHalf = data.slice(mid);

  const slope1 = calculateSlope(firstHalf);
  const slope2 = calculateSlope(secondHalf);

  // Acceleration is the change in slope
  const acceleration = slope2 - slope1;

  // Normalize to 0-100 scale
  return Math.max(0, Math.min(100, (acceleration + 20) * 2.5));
}

/**
 * Calculate consistency (sustained growth vs spikes)
 */
function calculateConsistency(data: TrendDataPoint[]): number {
  if (data.length < 3) return 50; // Default to neutral

  // Calculate variance in the trend
  const values = data.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Lower variance = higher consistency
  // Normalize: if stdDev is 0, consistency is 100; if stdDev is high, consistency is lower
  const maxStdDev = 50; // Reasonable max for normalized 0-100 data
  const consistency = Math.max(0, Math.min(100, 100 - (stdDev / maxStdDev) * 100));

  return consistency;
}

/**
 * Calculate breadth (number of regions with meaningful interest)
 */
async function calculateBreadth(queryId: string, window?: '30d'): Promise<number> {
  // Get all snapshots for this query
  const snapshots = await storage.getTrendSnapshots(queryId, window);
  
  if (snapshots.length === 0) return 0;

  // Count unique regions with value > 0
  const regions = new Set(
    snapshots
      .filter(s => s.region && s.interest_value > 0)
      .map(s => s.region!)
  );

  // Normalize: assume max reasonable regions is 20
  return Math.min(100, (regions.size / 20) * 100);
}

/**
 * Calculate Trend Opportunity Score (TOS)
 */
export async function calculateTOS(queryId: string, window: '30d' = '30d'): Promise<TrendScoreResult> {
  // Get trend snapshots for the specified window
  const snapshots = await storage.getTrendSnapshots(queryId, window);
  
  if (snapshots.length === 0) {
    return {
      query_id: queryId,
      score: 0,
      breakdown: {
        slope: 0,
        acceleration: 0,
        consistency: 50,
        breadth: 0,
      },
      classification: 'declining',
    };
  }

  // Convert snapshots to TrendDataPoint format
  const data: TrendDataPoint[] = snapshots.map(s => ({
    date: s.date,
    value: s.interest_value,
  }));

  // Calculate individual metrics (all on 0-100 scale)
  const slope = calculateSlope(data);
  const acceleration = calculateAcceleration(data);
  const consistency = calculateConsistency(data);
  const breadth = await calculateBreadth(queryId, window);

  // Calculate TOS with equal weighting (0-100 scale)
  // TOS = (Slope + Acceleration + Consistency + Breadth) / 4
  // All components are already on 0-100 scale, so simple average
  const score = Math.round(
    (slope + acceleration + consistency + breadth) / 4
  );

  // Classify score
  let classification: 'breakout' | 'growing' | 'stable' | 'declining';
  if (score >= 80) {
    classification = 'breakout';
  } else if (score >= 60) {
    classification = 'growing';
  } else if (score >= 40) {
    classification = 'stable';
  } else {
    classification = 'declining';
  }

  return {
    query_id: queryId,
    score,
    breakdown: {
      slope,
      acceleration,
      consistency,
      breadth,
    },
    classification,
  };
}

/**
 * Calculate TOS for multiple queries
 */
export async function calculateTOSForQueries(
  queryIds: string[],
  window: '30d' = '30d'
): Promise<TrendScoreResult[]> {
  return Promise.all(queryIds.map(id => calculateTOS(id, window)));
}

/**
 * Get top queries by TOS score from database
 */
export async function getTopQueriesByTOS(
  limit: number = 10,
  window: '30d' = '30d',
  minScore: number = 0,
  storageInstance?: DatabaseStorage
): Promise<TrendScoreResult[]> {
  // Use the provided storage instance or default to global storage
  const storageToUse = storageInstance || storage;
  // Use the database storage's getTopRankedQueries method
  const scores = await storageToUse.getTopRankedQueries(limit, window, minScore);
  
  // Convert to TrendScoreResult format
  return scores.map(score => ({
    query_id: score.query_id,
    score: score.score,
    breakdown: {
      slope: score.slope,
      acceleration: score.acceleration,
      consistency: score.consistency,
      breadth: score.breadth,
    },
    classification: score.score >= 80 ? 'breakout' 
      : score.score >= 60 ? 'growing'
      : score.score >= 40 ? 'stable'
      : 'declining',
  }));
}


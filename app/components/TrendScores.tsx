'use client';

import { TrendScore } from '@/app/lib/storage';
import { TrendScoreResult } from '@/app/lib/scoring';

interface TrendScoresProps {
  scores: TrendScoreResult[];
}

export default function TrendScores({ scores }: TrendScoresProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getClassificationColor = (classification: string) => {
    const colors: Record<string, string> = {
      breakout: 'bg-green-100 text-green-800',
      growing: 'bg-blue-100 text-blue-800',
      stable: 'bg-yellow-100 text-yellow-800',
      declining: 'bg-gray-100 text-gray-800',
    };
    return colors[classification] || 'bg-gray-100 text-gray-800';
  };

  if (scores.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-bold mb-4">Trend Scores</h2>
        <p className="text-gray-500">No scores available. Fetch trends data first.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Trend Scores (TOS)</h2>
      <div className="space-y-3">
        {scores
          .sort((a, b) => b.score - a.score)
          .map(score => (
            <div key={score.query_id} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-2xl font-bold ${getScoreColor(score.score)}`}>
                  {score.score}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getClassificationColor(score.classification)}`}>
                  {score.classification.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Slope:</span>
                  <span className="ml-1 font-semibold">{Math.round(score.breakdown.slope)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Acceleration:</span>
                  <span className="ml-1 font-semibold">{Math.round(score.breakdown.acceleration)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Consistency:</span>
                  <span className="ml-1 font-semibold">{Math.round(score.breakdown.consistency)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Breadth:</span>
                  <span className="ml-1 font-semibold">{Math.round(score.breakdown.breadth)}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}


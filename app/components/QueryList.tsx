'use client';

import { Query, TrendScore, IntentClassification } from '@/app/lib/storage';
import IntentBadges from './IntentBadges';

interface QueryListProps {
  queries: Query[];
  scores: Map<string, TrendScore>;
  classifications: Map<string, IntentClassification>;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
}

export default function QueryList({ queries, scores, classifications, onRemove, onSelect, selectedIds }: QueryListProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Breakout';
    if (score >= 60) return 'Growing';
    if (score >= 40) return 'Stable';
    return 'Declining';
  };

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-bold mb-4">Tracked Queries ({queries.length})</h2>
      {queries.length === 0 ? (
        <p className="text-gray-500">No queries tracked yet. Add a query to get started.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {queries.map(query => {
            const score = scores.get(query.id);
            return (
              <div
                key={query.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedIds.includes(query.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onSelect(query.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{query.text}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {score && (
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getScoreColor(score.score)}`}
                        >
                          TOS: {score.score} ({getScoreLabel(score.score)})
                        </span>
                      )}
                      <IntentBadges classification={classifications.get(query.id)} />
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(query.id);
                    }}
                    className="ml-4 text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


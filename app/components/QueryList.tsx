'use client';

import { Query, IntentClassification } from '@/app/lib/storage';
import IntentBadges from './IntentBadges';

interface QueryListProps {
  queries: Query[];
  classifications: Map<string, IntentClassification>;
  onRemove: (id: string) => void;
}

export default function QueryList({ queries, classifications, onRemove }: QueryListProps) {

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-bold mb-4">Tracked Queries ({queries.length})</h2>
      {queries.length === 0 ? (
        <p className="text-gray-500">No queries tracked yet. Add a query to get started.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {queries.map(query => (
            <div
              key={query.id}
              className="p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{query.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <IntentBadges classification={classifications.get(query.id)} />
                  </div>
                </div>
                <button
                  onClick={() => onRemove(query.id)}
                  className="ml-4 text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


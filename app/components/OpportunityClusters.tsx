'use client';

import { OpportunityCluster, Query } from '@/app/lib/storage';

interface OpportunityClustersProps {
  clusters: OpportunityCluster[];
  queries: Map<string, Query>;
  onQueryClick?: (queryId: string) => void;
}

export default function OpportunityClusters({ clusters, queries, onQueryClick }: OpportunityClustersProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'border-green-500 bg-green-50';
    if (score >= 60) return 'border-blue-500 bg-blue-50';
    return 'border-gray-300 bg-gray-50';
  };

  const getIntentColor = (intent: string) => {
    const colors: Record<string, string> = {
      pain: 'bg-red-100 text-red-800',
      tool: 'bg-blue-100 text-blue-800',
      transition: 'bg-purple-100 text-purple-800',
      education: 'bg-green-100 text-green-800',
    };
    return colors[intent] || 'bg-gray-100 text-gray-800';
  };

  if (clusters.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-bold mb-4">Opportunity Clusters</h2>
        <p className="text-gray-500">No clusters found. Generate clusters after tracking queries.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Opportunity Clusters</h2>
      <div className="space-y-4">
        {clusters.map(cluster => (
          <div
            key={cluster.id}
            className={`border-2 rounded-lg p-4 ${getScoreColor(cluster.average_score)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-lg">{cluster.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getIntentColor(cluster.intent_type)}`}>
                    {cluster.intent_type}
                  </span>
                  <span className="text-sm text-gray-600">
                    Avg TOS: {cluster.average_score} | {cluster.queries.length} queries
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">Queries in cluster:</p>
              <div className="flex flex-wrap gap-2">
                {cluster.queries.slice(0, 5).map(queryId => {
                  const query = queries.get(queryId);
                  if (!query) return null;
                  return (
                    <button
                      key={queryId}
                      onClick={() => onQueryClick?.(queryId)}
                      className="px-2 py-1 bg-white border rounded text-sm hover:bg-gray-100"
                    >
                      {query.text}
                    </button>
                  );
                })}
                {cluster.queries.length > 5 && (
                  <span className="px-2 py-1 text-sm text-gray-500">
                    +{cluster.queries.length - 5} more
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


'use client';

import { useState, useCallback } from 'react';
import { OpportunityCluster, Query } from '@/app/lib/storage';
import { TutorialRecommendation, FeatureRecommendation } from '@/app/lib/recommendations-ai';
import { useAuth } from '@/app/lib/auth-context';

interface OpportunityClustersProps {
  clusters: OpportunityCluster[];
  queries: Map<string, Query>;
  onQueryClick?: (queryId: string) => void;
}

export default function OpportunityClusters({ clusters, queries, onQueryClick }: OpportunityClustersProps) {
  const { session } = useAuth();
  const [generatingClusterId, setGeneratingClusterId] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<'tutorials' | 'features' | null>(null);
  const [clusterTutorials, setClusterTutorials] = useState<Map<string, TutorialRecommendation[]>>(new Map());
  const [clusterFeatures, setClusterFeatures] = useState<Map<string, FeatureRecommendation[]>>(new Map());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  // Helper to get auth headers for API requests
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session]);

  const handleGenerateTutorials = useCallback(async (clusterId: string) => {
    setGeneratingClusterId(clusterId);
    setGeneratingType('tutorials');
    try {
      const response = await fetch('/api/cluster/recommendations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          clusterId,
          limit: 5,
          type: 'tutorials',
        }),
      });

      const data = await response.json();
      if (data.success && data.tutorials) {
        // Update tutorials for this cluster
        setClusterTutorials(prev => {
          const newMap = new Map(prev);
          newMap.set(clusterId, data.tutorials);
          return newMap;
        });
        // Auto-expand to show tutorials
        setExpandedClusters(prev => new Set(prev).add(clusterId));
      } else {
        console.error('Failed to generate tutorials:', data.error);
        alert(`Failed to generate tutorials: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating tutorials:', error);
      alert(`Error generating tutorials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingClusterId(null);
      setGeneratingType(null);
    }
  }, [getAuthHeaders]);

  const handleGenerateFeatures = useCallback(async (clusterId: string) => {
    setGeneratingClusterId(clusterId);
    setGeneratingType('features');
    try {
      const response = await fetch('/api/cluster/recommendations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          clusterId,
          limit: 5,
          type: 'features',
        }),
      });

      const data = await response.json();
      if (data.success && data.features) {
        // Update features for this cluster
        setClusterFeatures(prev => {
          const newMap = new Map(prev);
          newMap.set(clusterId, data.features);
          return newMap;
        });
        // Auto-expand to show features
        setExpandedClusters(prev => new Set(prev).add(clusterId));
      } else {
        console.error('Failed to generate features:', data.error);
        alert(`Failed to generate features: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error generating features:', error);
      alert(`Error generating features: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingClusterId(null);
      setGeneratingType(null);
    }
  }, [getAuthHeaders]);

  const toggleClusterExpansion = useCallback((clusterId: string) => {
    setExpandedClusters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clusterId)) {
        newSet.delete(clusterId);
      } else {
        newSet.add(clusterId);
      }
      return newSet;
    });
  }, []);
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
              <div className="flex-1">
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
              <div className="flex gap-2">
                <button
                  onClick={() => handleGenerateTutorials(cluster.id)}
                  disabled={generatingClusterId === cluster.id && generatingType === 'tutorials'}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                >
                  {generatingClusterId === cluster.id && generatingType === 'tutorials' ? 'Generating...' : 'Generate Tutorials'}
                </button>
                <button
                  onClick={() => handleGenerateFeatures(cluster.id)}
                  disabled={generatingClusterId === cluster.id && generatingType === 'features'}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                >
                  {generatingClusterId === cluster.id && generatingType === 'features' ? 'Generating...' : 'Generate Features'}
                </button>
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

            {/* Tutorial Recommendations Section */}
            {clusterTutorials.has(cluster.id) && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-md text-gray-700">Tutorial Recommendations</h4>
                  <button
                    onClick={() => toggleClusterExpansion(cluster.id)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {expandedClusters.has(cluster.id) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {expandedClusters.has(cluster.id) && (
                  <div className="space-y-3 mt-2">
                    {clusterTutorials.get(cluster.id)?.map((tutorial, idx) => (
                      <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between mb-1">
                          <h5 className="font-semibold text-sm text-gray-900">{tutorial.title}</h5>
                          {tutorial.ai_generated && (
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">
                              AI Generated
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{tutorial.description}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <span>Score: {tutorial.score}/100</span>
                          <span>•</span>
                          <span>Query: {tutorial.query}</span>
                        </div>
                        {tutorial.evidence && tutorial.evidence.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">Evidence:</p>
                            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                              {tutorial.evidence.map((evidence, eIdx) => (
                                <li key={eIdx}>{evidence}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Feature Recommendations Section */}
            {clusterFeatures.has(cluster.id) && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-md text-gray-700">Feature Recommendations</h4>
                  <button
                    onClick={() => toggleClusterExpansion(cluster.id)}
                    className="text-sm text-green-600 hover:text-green-800"
                  >
                    {expandedClusters.has(cluster.id) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {expandedClusters.has(cluster.id) && (
                  <div className="space-y-3 mt-2">
                    {clusterFeatures.get(cluster.id)?.map((feature, idx) => (
                      <div key={idx} className="bg-white border rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between mb-1">
                          <h5 className="font-semibold text-sm text-gray-900">{feature.title}</h5>
                          {feature.ai_generated && (
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">
                              AI Generated
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{feature.description}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <span>Cluster: {feature.cluster}</span>
                          <span>•</span>
                          <span>Score: {feature.averageScore}/100</span>
                          <span>•</span>
                          <span>{feature.queryCount} queries</span>
                        </div>
                        {feature.evidence && feature.evidence.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700 mb-1">Evidence:</p>
                            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                              {feature.evidence.map((evidence, eIdx) => (
                                <li key={eIdx}>{evidence}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


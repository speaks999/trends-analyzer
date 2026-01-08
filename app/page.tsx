'use client';

import { useState, useEffect, useCallback } from 'react';
import { storage, Query } from '@/app/lib/storage';
import { classifyIntents } from '@/app/lib/intent-classifier';
import { clusterQueries, OpportunityCluster } from '@/app/lib/clustering';
import { generateActions, Action } from '@/app/lib/actions';
import QueryInput from '@/app/components/QueryInput';
import QueryList from '@/app/components/QueryList';
import AISuggestions from '@/app/components/AISuggestions';
import TrendsChart from '@/app/components/TrendsChart';
import TrendScores from '@/app/components/TrendScores';
import OpportunityClusters from '@/app/components/OpportunityClusters';
import ActionsPanel from '@/app/components/ActionsPanel';
// Recommendations component removed - recommendations now shown in cluster cards
import { TrendScoreResult } from '@/app/lib/scoring';
import AuthGuard from '@/app/components/AuthGuard';
import UserMenu from '@/app/components/UserMenu';
import SettingsPanel from '@/app/components/SettingsPanel';
import { useAuth } from '@/app/lib/auth-context';

function HomeContent() {
  const { session } = useAuth();

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
  const [queries, setQueries] = useState<Query[]>([]);
  const [classifications, setClassifications] = useState<Map<string, import('@/app/lib/storage').IntentClassification>>(new Map());
  const [clusters, setClusters] = useState<OpportunityCluster[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [trendSeries, setTrendSeries] = useState<
    Array<{ query: string; window: '90d'; data: Array<{ date: string; value: number }> }>
  >([]);
  const [trendScores, setTrendScores] = useState<TrendScoreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    tutorials: Array<import('@/app/lib/recommendations').TutorialRecommendation | import('@/app/lib/recommendations-ai').TutorialRecommendation>;
    features: Array<import('@/app/lib/recommendations').FeatureRecommendation | import('@/app/lib/recommendations-ai').FeatureRecommendation>;
  }>({ tutorials: [], features: [] });
  const [showSettings, setShowSettings] = useState(false);

  // Load initial data
  useEffect(() => {
    loadQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateClusters = useCallback(async () => {
    if (queries.length === 0) return;

    try {
      const response = await fetch('/api/cluster', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          recluster: false,
          similarityThreshold: 0.3,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setClusters(data.clusters);
      }
    } catch (error) {
      console.error('Error updating clusters:', error);
    }
  }, [queries, getAuthHeaders]);

  const updateActions = useCallback(async () => {
    try {
      const response = await fetch('/api/actions', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setActions(data.actions);
      }
    } catch (error) {
      console.error('Error updating actions:', error);
    }
  }, [getAuthHeaders]);

  // Update clusters when queries change
  useEffect(() => {
    if (queries.length > 0 && session) {
      updateClusters();
      updateActions();
    }
  }, [queries, updateClusters, updateActions]);

  const loadQueries = async () => {
    try {
      const allQueries = await storage.getAllQueries();
      setQueries(allQueries);

      // Load classifications
      const allClassifications = await storage.getAllIntentClassifications();
      const classificationsMap = new Map<string, import('@/app/lib/storage').IntentClassification>();
      allClassifications.forEach(classification => {
        classificationsMap.set(classification.query_id, classification);
      });
      setClassifications(classificationsMap);

      // Load scores for display
      if (allQueries.length > 0) {
        loadTrendScores();
      }
    } catch (error) {
      console.error('Error loading queries:', error);
    }
  };

  const loadTrendScores = async () => {
    try {
      const response = await fetch(`/api/score?window=90d`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success && data.scores && data.scores.length > 0) {
        // Sort by score descending - highest ranking terms first
        const sortedScores = data.scores.sort((a: TrendScoreResult, b: TrendScoreResult) => b.score - a.score);
        setTrendScores(sortedScores);
      } else {
        // If no scores, refresh them for all queries
        if (queries.length > 0) {
          refreshAllScores();
        }
      }
    } catch (error) {
      console.error('Error loading trend scores:', error);
    }
  };

  const refreshAllScores = async () => {
    try {
      const response = await fetch('/api/score/refresh', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ window: '90d' }), // Use 90-day window
      });
      const data = await response.json();
      if (data.success && data.topQueries) {
        setTrendScores(data.topQueries);
      }
    } catch (error) {
      console.error('Error refreshing scores:', error);
    }
  };

  const handleAddQuery = async (queryText: string) => {
    try {
      const query = await storage.addQuery({ text: queryText });
      setQueries([...queries, query]);

      // Classify intent
      try {
        const results = await classifyIntents([{ id: query.id, text: queryText }]);
        if (results.length > 0) {
          const newClassifications = new Map(classifications);
          newClassifications.set(results[0].query_id, results[0]);
          setClassifications(newClassifications);
          
          // Store classification in database
          await storage.setIntentClassification(results[0]);
        }
      } catch (error) {
        console.error('Error classifying intent:', error);
      }
    } catch (error) {
      console.error('Error adding query:', error);
      alert('Failed to add query. Please try again.');
    }
  };

  const handleRemoveQuery = async (id: string) => {
    try {
      await storage.removeQuery(id);
      setQueries(queries.filter(q => q.id !== id));
      // Remove from scores if present
      setTrendScores(trendScores.filter(s => s.query_id !== id));
    } catch (error) {
      console.error('Error removing query:', error);
      alert('Failed to remove query. Please try again.');
    }
  };

  const handleFetchTrends = async () => {
    if (queries.length === 0) {
      alert('Please add at least one query first');
      return;
    }

    setLoading(true);
    try {
      const queryTexts = queries.map(q => q.text);

      const response = await fetch('/api/trends', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          queries: queryTexts,
          windows: ['90d'],
          includeRegional: true,
          includeRelated: true,
          regions: ['US'], // Request data for United States only
        }),
      });

      const data = await response.json();
      if (data.success) {
        // IMPORTANT: server in-memory storage is not shared with the browser.
        // Use the API response directly for charts.
        const interestOverTime = data.data?.interestOverTime || [];
        setTrendSeries(interestOverTime);

        // TOS scores are calculated and returned in the trends response
        // Also refresh all scores to ensure rankings are up to date
        if (data.tosScores && data.tosScores.length > 0) {
          // Convert to TrendScoreResult format and sort
          const sortedScores = data.tosScores.map((s: any) => ({
            query_id: s.query_id,
            score: s.score,
            classification: s.classification,
            breakdown: {
              slope: 0,
              acceleration: 0,
              consistency: 0,
              breadth: 0,
            },
          })).sort((a: TrendScoreResult, b: TrendScoreResult) => b.score - a.score);
          setTrendScores(sortedScores);
        }
        
        // Refresh all scores in background to ensure we have the latest rankings
        refreshAllScores();

        const totalPoints = interestOverTime.reduce((sum: number, s: any) => sum + (s.data?.length || 0), 0);
        if (totalPoints === 0) {
          alert(
            'Google Trends returned no time-series points for the queries.\n\n' +
              'This usually means the queries are too specific or have insufficient search volume.\n' +
              'Try queries with broader, more commonly searched terms.'
          );
        }
      } else {
        alert('Failed to fetch trends: ' + (data.error || 'Unknown error'));
        console.error('Trend fetch error:', data);
      }
    } catch (error) {
      console.error('Error fetching trends:', error);
      alert('Error fetching trends');
    } finally {
      setLoading(false);
    }
  };

  // Note: Window selection removed - we only use 90d now
  // Removed useEffect that depended on window variable since it doesn't exist

  // Load AI-powered recommendations when queries change (only if we have queries)
  useEffect(() => {
    const loadRecommendations = async () => {
      if (queries.length > 0 && session) {
        try {
          // Use AI-powered recommendations API
          const response = await fetch('/api/recommendations?window=90d&limit=10&useAI=true', {
            headers: getAuthHeaders(),
          });
          const data = await response.json();
          if (data.success) {
            setRecommendations({
              tutorials: data.tutorials || [],
              features: data.features || [],
            });
          }
        } catch (error) {
          // Silently fail - recommendations are optional
          // This can happen if user is not authenticated or has no data
          console.debug('Could not load recommendations:', error);
          setRecommendations({ tutorials: [], features: [] });
        }
      } else {
        setRecommendations({ tutorials: [], features: [] });
      }
    };

    loadRecommendations();
  }, [queries, getAuthHeaders]);

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">Entrepreneur Demand & Trend Intelligence System</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
            >
              Settings
            </button>
            <UserMenu />
          </div>
        </div>

        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Query Management */}
            <div className="bg-white rounded-lg shadow p-6">
              <QueryInput onAdd={handleAddQuery} />
              <AISuggestions onAddQuery={handleAddQuery} />
              <div className="mt-6">
                <QueryList
                  queries={queries}
                  classifications={classifications}
                  onRemove={handleRemoveQuery}
                />
              </div>
              {queries.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={handleFetchTrends}
                    disabled={loading}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {loading ? 'Fetching Trends...' : `View Trends (${queries.length} ${queries.length === 1 ? 'query' : 'queries'})`}
                  </button>
                </div>
              )}
            </div>

            {/* Chart */}
            {queries.length > 0 && trendSeries.length === 0 && !loading && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No trend data yet.</p>
                  <p className="text-sm text-gray-400">Click &ldquo;View Trends&rdquo; above to load data for your queries.</p>
                </div>
              </div>
            )}
            {queries.length > 0 && trendSeries.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Trends Over Time (90 Days)</h2>
                </div>
                <TrendsChart
                  window="90d"
                  series={trendSeries.map(s => ({
                    name: s.query,
                    window: s.window,
                    data: s.data,
                  }))}
                />
              </div>
            )}

            {/* Clusters */}
            {clusters.length > 0 && (
              <OpportunityClusters
                clusters={clusters}
                queries={new Map(queries.map(q => [q.id, q]))}
              />
            )}

            {/* Recommendations removed - now shown within cluster cards */}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Trend Scores (TOS) */}
            {trendScores.length > 0 && (
              <TrendScores 
                scores={trendScores} 
                queries={new Map(queries.map(q => [q.id, q.text]))}
              />
            )}
            
            {/* Actions */}
            {actions.length > 0 && (
              <ActionsPanel actions={actions} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}

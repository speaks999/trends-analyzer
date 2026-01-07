'use client';

import { useState, useEffect, useCallback } from 'react';
import { storage, Query, TrendSnapshot, TrendScore } from '@/app/lib/storage';
import { calculateTOSForQueries, TrendScoreResult } from '@/app/lib/scoring';
import { classifyIntents } from '@/app/lib/intent-classifier';
import { clusterQueries, OpportunityCluster } from '@/app/lib/clustering';
import { generateActions, Action } from '@/app/lib/actions';
import { getAllRecommendations } from '@/app/lib/recommendations';
import QueryInput from '@/app/components/QueryInput';
import QueryList from '@/app/components/QueryList';
import AISuggestions from '@/app/components/AISuggestions';
import TrendsChart from '@/app/components/TrendsChart';
import OpportunityClusters from '@/app/components/OpportunityClusters';
import TrendScores from '@/app/components/TrendScores';
import ActionsPanel from '@/app/components/ActionsPanel';
import Recommendations from '@/app/components/Recommendations';

export default function Home() {
  const [queries, setQueries] = useState<Query[]>([]);
  const [selectedQueryIds, setSelectedQueryIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Map<string, TrendScore>>(new Map());
  const [classifications, setClassifications] = useState<Map<string, import('@/app/lib/storage').IntentClassification>>(new Map());
  const [scoreResults, setScoreResults] = useState<TrendScoreResult[]>([]);
  const [clusters, setClusters] = useState<OpportunityCluster[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [trendSeries, setTrendSeries] = useState<
    Array<{ query: string; window: '30d' | '90d' | '12m'; data: Array<{ date: string; value: number }> }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [window, setWindow] = useState<'30d' | '90d' | '12m'>('12m');

  // Load initial data
  useEffect(() => {
    loadQueries();
  }, []);

  const updateScores = useCallback(async () => {
    if (queries.length === 0) return;

    try {
      const queryIds = queries.map(q => q.id);
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queryIds,
          window,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const scoresMap = new Map<string, TrendScore>();
        const allScores = storage.getAllTrendScores();
        allScores.forEach(score => {
          scoresMap.set(score.query_id, score);
        });
        setScores(scoresMap);
        setScoreResults(data.scores);
      }
    } catch (error) {
      console.error('Error updating scores:', error);
    }
  }, [queries, window]);

  const updateClusters = useCallback(async () => {
    if (queries.length === 0) return;

    try {
      const response = await fetch('/api/cluster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
  }, [queries]);

  const updateActions = useCallback(async () => {
    try {
      const response = await fetch('/api/actions');
      const data = await response.json();
      if (data.success) {
        setActions(data.actions);
      }
    } catch (error) {
      console.error('Error updating actions:', error);
    }
  }, []);

  // Update scores and clusters when queries change
  useEffect(() => {
    if (queries.length > 0) {
      updateScores();
      updateClusters();
      updateActions();
    }
  }, [queries, updateScores, updateClusters, updateActions]);

  const loadQueries = () => {
    const allQueries = storage.getAllQueries();
    setQueries(allQueries);
    
    // Load scores
    const allScores = storage.getAllTrendScores();
    const scoresMap = new Map<string, TrendScore>();
    allScores.forEach(score => {
      scoresMap.set(score.query_id, score);
    });
    setScores(scoresMap);

    // Load classifications
    const allClassifications = storage.getAllIntentClassifications();
    const classificationsMap = new Map<string, import('@/app/lib/storage').IntentClassification>();
    allClassifications.forEach(classification => {
      classificationsMap.set(classification.query_id, classification);
    });
    setClassifications(classificationsMap);
  };

  const handleAddQuery = async (queryText: string) => {
    const query = storage.addQuery({ text: queryText });
    setQueries([...queries, query]);

    // Classify intent
    try {
      const results = await classifyIntents([{ id: query.id, text: queryText }]);
      if (results.length > 0) {
        const newClassifications = new Map(classifications);
        newClassifications.set(results[0].query_id, results[0]);
        setClassifications(newClassifications);
      }
    } catch (error) {
      console.error('Error classifying intent:', error);
    }
  };

  const handleRemoveQuery = (id: string) => {
    storage.removeQuery(id);
    setQueries(queries.filter(q => q.id !== id));
    setSelectedQueryIds(selectedQueryIds.filter(qid => qid !== id));
  };

  const handleSelectQuery = (id: string) => {
    setSelectedQueryIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(qid => qid !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleFetchTrends = async () => {
    if (selectedQueryIds.length === 0) {
      alert('Please select at least one query to fetch trends for');
      return;
    }

    setLoading(true);
    try {
      const selectedQueries = queries.filter(q => selectedQueryIds.includes(q.id));
      const queryTexts = selectedQueries.map(q => q.text);

      const response = await fetch('/api/trends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries: queryTexts,
          windows: ['30d', '90d', '12m'],
          includeRegional: true,
          includeRelated: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // IMPORTANT: server in-memory storage is not shared with the browser.
        // Use the API response directly for charts.
        const interestOverTime = data.data?.interestOverTime || [];
        setTrendSeries(interestOverTime);

        const totalPoints = interestOverTime.reduce((sum: number, s: any) => sum + (s.data?.length || 0), 0);
        if (totalPoints === 0) {
          const resolved = (data.resolved || [])
            .map((r: any) => `${r.originalQuery} → "${r.keywordUsed}"`)
            .join('\n');
          alert(
            'Google Trends returned no time-series points for this query.\n\n' +
              'This usually means the phrase is too specific.\n' +
              'Try a shorter keyword-like query (e.g. "cash flow issues", "customer acquisition cost").\n\n' +
              (resolved ? `Keyword simplification used:\n${resolved}` : '')
          );
        } else {
          // Recalculate scores now that we have trend data
          await updateScores();
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


  const queryNames = selectedQueryIds.map(id => {
    const query = queries.find(q => q.id === id);
    return query?.text || id;
  });

  const recommendations = getAllRecommendations();

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 md:mb-8">Entrepreneur Demand & Trend Intelligence System</h1>

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
                  scores={scores}
                  classifications={classifications}
                  onRemove={handleRemoveQuery}
                  onSelect={handleSelectQuery}
                  selectedIds={selectedQueryIds}
                />
              </div>
              {queries.length > 0 && selectedQueryIds.length === 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    💡 <strong>Tip:</strong> Click on queries above to select them, then click &ldquo;Fetch Trends&rdquo; to see charts and scores.
                  </p>
                </div>
              )}
              {selectedQueryIds.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={handleFetchTrends}
                    disabled={loading}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {loading ? 'Fetching...' : `Fetch Trends (${selectedQueryIds.length} selected)`}
                  </button>
                </div>
              )}
            </div>

            {/* Chart */}
            {selectedQueryIds.length > 0 && trendSeries.length === 0 && !loading && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No trend data yet.</p>
                  <p className="text-sm text-gray-400">Click &ldquo;Fetch Trends&rdquo; above to load data for selected queries.</p>
                </div>
              </div>
            )}
            {selectedQueryIds.length > 0 && trendSeries.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Trends Over Time</h2>
                  <select
                    value={window}
                    onChange={(e) => setWindow(e.target.value as '30d' | '90d' | '12m')}
                    className="px-3 py-1 border border-gray-300 rounded"
                  >
                    <option value="30d">30 Days</option>
                    <option value="90d">90 Days</option>
                    <option value="12m">12 Months</option>
                  </select>
                </div>
                <TrendsChart
                  window={window}
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
                onQueryClick={handleSelectQuery}
              />
            )}

            {/* Recommendations */}
            <Recommendations
              tutorials={recommendations.tutorials}
              features={recommendations.features}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Scores */}
            {scoreResults.length > 0 && (
              <TrendScores scores={scoreResults} />
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

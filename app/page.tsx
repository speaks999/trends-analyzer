'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/app/components/AuthGuard';
import Navigation from '@/app/components/Navigation';
import QueryInput from '@/app/components/QueryInput';
import QueryList from '@/app/components/QueryList';
import AISuggestions from '@/app/components/AISuggestions';
import TrendsChart from '@/app/components/TrendsChart';
import TrendScores from '@/app/components/TrendScores';
import { TrendScoreResult } from '@/app/lib/scoring';
import { useQueryManagement } from '@/app/lib/hooks/useQueryManagement';
import { useAuthHeaders } from '@/app/lib/hooks/useAuthHeaders';

function HomeContent() {
  const getAuthHeaders = useAuthHeaders();
  const { queries, classifications, handleAddQuery, handleRemoveQuery } = useQueryManagement();
  
  // Trends state
  const [showTrends, setShowTrends] = useState(false);
  const [trendSeries, setTrendSeries] = useState<
    Array<{ query: string; window: '90d'; data: Array<{ date: string; value: number }> }>
  >([]);
  const [trendScores, setTrendScores] = useState<TrendScoreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  // Auto-fetch trends when "Compare Term Trends" is clicked
  const handleViewTrends = useCallback(async () => {
    if (queries.length === 0) return;
    
    setShowTrends(true);
    setLoading(true);
    setTrendsError(null);
    
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
          regions: ['US'],
        }),
      });

      const data = await response.json();
      if (data.success) {
        const interestOverTime = data.data?.interestOverTime || [];
        setTrendSeries(interestOverTime);

        if (data.tosScores && data.tosScores.length > 0) {
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

        // Also refresh scores from backend
        try {
          const scoreResponse = await fetch('/api/score/refresh', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ window: '90d' }),
          });
          const scoreData = await scoreResponse.json();
          if (scoreData.success && scoreData.topQueries) {
            setTrendScores(scoreData.topQueries);
          }
        } catch (scoreError) {
          console.warn('Error refreshing scores:', scoreError);
        }

        const totalPoints = interestOverTime.reduce((sum: number, s: any) => sum + (s.data?.length || 0), 0);
        if (totalPoints === 0) {
          setTrendsError(
            'Google Trends returned no data for these queries. Try queries with broader, more commonly searched terms.'
          );
        }
      } else {
        setTrendsError(data.error || 'Failed to fetch trends');
      }
    } catch (error) {
      console.error('Error fetching trends:', error);
      setTrendsError('Error fetching trends. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [queries, getAuthHeaders]);

  // Hide trends section when queries are removed
  useEffect(() => {
    if (queries.length === 0) {
      setShowTrends(false);
      setTrendSeries([]);
      setTrendScores([]);
    }
  }, [queries.length]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              Entrepreneur Demand & Trend Intelligence System
            </h1>
            <p className="text-xl text-gray-600">
              Discover what entrepreneurs are searching for and detect rising demand
            </p>
          </div>

          {/* Query Management Section */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Manage Search Queries</h2>
            <p className="text-gray-600 mb-6">
              Add search terms to track. Each query will automatically show Related Queries and Related Questions.
            </p>
            
            <QueryInput onAdd={handleAddQuery} />
            <AISuggestions onAddQuery={handleAddQuery} />
            
            <div className="mt-6">
              <QueryList
                queries={queries}
                classifications={classifications}
                onRemove={handleRemoveQuery}
              />
            </div>
          </div>

          {/* Compare Term Trends Button - Only show if queries exist and trends not shown */}
          {queries.length > 0 && !showTrends && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <button
                onClick={handleViewTrends}
                disabled={loading}
                className="w-full flex flex-col items-center justify-center p-8 border-2 border-blue-500 rounded-lg hover:bg-blue-50 transition-colors text-center cursor-pointer disabled:opacity-50"
              >
                <div className="text-5xl mb-4">📈</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {loading ? 'Loading Trends...' : 'Compare Term Trends'}
                </h3>
                <p className="text-gray-600 text-sm">
                  Analyze search trend data and see Trend Opportunity Scores (TOS) for your {queries.length} {queries.length === 1 ? 'query' : 'queries'}.
                </p>
              </button>
            </div>
          )}

          {/* Trends Section - Show when trends are loaded */}
          {showTrends && queries.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">📈 Trends Analysis</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleViewTrends}
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {loading ? 'Refreshing...' : '🔄 Refresh'}
                  </button>
                  <button
                    onClick={() => setShowTrends(false)}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Hide
                  </button>
                </div>
              </div>

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                    <p className="text-gray-600">Fetching trend data from Google Trends...</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {!loading && trendsError && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800">{trendsError}</p>
                </div>
              )}

              {/* Chart and Scores */}
              {!loading && trendSeries.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Chart - takes 2 columns */}
                  <div className="lg:col-span-2">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Interest Over Time (90 Days)</h3>
                    <TrendsChart
                      window="90d"
                      series={trendSeries.map(s => ({
                        name: s.query,
                        window: s.window,
                        data: s.data,
                      }))}
                    />
                  </div>

                  {/* Scores - takes 1 column */}
                  <div>
                    {trendScores.length > 0 && (
                      <TrendScores 
                        scores={trendScores} 
                        queries={new Map(queries.map(q => [q.id, q.text]))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* No data state */}
              {!loading && !trendsError && trendSeries.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No trend data available. The queries may be too specific or have low search volume.</p>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {queries.length === 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <p className="text-gray-500 mb-4">
                Add queries above to get started. Each query will automatically show related topics and questions.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}

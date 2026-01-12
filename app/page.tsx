'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/app/components/AuthGuard';
import Navigation from '@/app/components/Navigation';
import QueryInput from '@/app/components/QueryInput';
import QueryList from '@/app/components/QueryList';
import AISuggestions from '@/app/components/AISuggestions';
import TrendsChart from '@/app/components/TrendsChart';
import OpportunityTable from '@/app/components/OpportunityTable';
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
  const [loading, setLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  // Opportunity state (automatically loaded when trends are fetched)
  const [opportunityRows, setOpportunityRows] = useState<any[]>([]);

  const loadOpportunity = useCallback(async () => {
    if (queries.length === 0) return;
    try {
      const resp = await fetch('/api/opportunity?window=90d&geo=US&languageCode=en&network=GOOGLE_SEARCH&limit=50', {
        headers: getAuthHeaders(),
      });
      const data = await resp.json();
      if (data.success && Array.isArray(data.top)) {
        setOpportunityRows(data.top);
      }
    } catch (e) {
      // non-blocking
    }
  }, [queries.length, getAuthHeaders]);

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


        // Load existing opportunity scores (if any)
        loadOpportunity();

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
  }, [queries, getAuthHeaders, loadOpportunity]);

  // Hide trends section when queries are removed
  useEffect(() => {
    if (queries.length === 0) {
      setShowTrends(false);
      setTrendSeries([]);
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

          {/* Getting started */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border border-blue-100">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Getting started</h2>
                <p className="text-gray-600">
                  Add keywords and compare trends. Opportunity scores are automatically calculated when you view trends.
                  <span className="ml-2">
                    <Link href="/help" className="text-blue-600 hover:text-blue-800 underline font-medium">
                      Read the full guide
                    </Link>
                  </span>
                </p>
              </div>
              <Link
                href="/help#quick-start-in-the-ui"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
              >
                Open Quick Start
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="font-semibold text-gray-900 mb-1">1) Add queries</div>
                <div className="text-gray-600">
                  Use manual entry or AI suggestions.
                  <span className="ml-2">
                    <Link href="/help#quick-start-in-the-ui" className="text-blue-600 hover:text-blue-800 underline">
                      Details
                    </Link>
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="font-semibold text-gray-900 mb-1">2) Compare trends</div>
                <div className="text-gray-600">
                  Fetch historical search volume from DataForSEO to visualize trends over time.
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="font-semibold text-gray-900 mb-1">3) View Opportunity Scores</div>
                <div className="text-gray-600">
                  Opportunity scores are automatically calculated and displayed when you view trends.
                  <span className="ml-2">
                    <Link href="/help#opportunity-v2" className="text-blue-600 hover:text-blue-800 underline">
                      How it works
                    </Link>
                  </span>
                </div>
              </div>
            </div>
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
                  Analyze search trend data for your {queries.length} {queries.length === 1 ? 'query' : 'queries'}.
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
                  <Link
                    href="/help#opportunity-v2"
                    className="px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100"
                    title="Learn how Opportunity (v2) works"
                  >
                    Help
                  </Link>
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
                    <p className="text-gray-600">Fetching trend data from DataForSEO...</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {!loading && trendsError && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800">{trendsError}</p>
                </div>
              )}

              {/* Chart */}
              {!loading && trendSeries.length > 0 && (
                <div>
                  {/* Chart - full width */}
                  <div>
                    {(() => {
                      // Calculate actual date range from the data
                      const allDates = trendSeries.flatMap(s => s.data.map(d => new Date(d.date)));
                      if (allDates.length > 0) {
                        const sortedDates = allDates.sort((a, b) => a.getTime() - b.getTime());
                        const startDate = sortedDates[0];
                        const endDate = sortedDates[sortedDates.length - 1];
                        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                        const monthsDiff = Math.round(daysDiff / 30);
                        const startDateStr = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        const endDateStr = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        const title = monthsDiff >= 12 
                          ? `Search Interest Over Time (${startDateStr} - ${endDateStr})`
                          : daysDiff >= 30
                          ? `Search Interest Over Time (${monthsDiff} months: ${startDateStr} - ${endDateStr})`
                          : `Search Interest Over Time (${daysDiff} days: ${startDateStr} - ${endDateStr})`;
                        return <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>;
                      }
                      return <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Interest Over Time</h3>;
                    })()}
                    <TrendsChart
                      window="90d"
                      series={trendSeries.map(s => ({
                        name: s.query,
                        window: s.window,
                        data: s.data,
                      }))}
                    />
                  </div>
                </div>
              )}

              {/* Opportunity section - automatically loaded when trends are fetched */}
              {!loading && (
                <div className="mt-6">
                  <OpportunityTable rows={opportunityRows} />
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

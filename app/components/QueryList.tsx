'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Query, IntentClassification, RelatedTopic, RelatedQuestion } from '@/app/lib/storage';
import IntentBadges from './IntentBadges';
import { useAuthHeaders } from '@/app/lib/hooks/useAuthHeaders';

type ArticlePlatform = 'blog' | 'linkedin' | 'instagram' | 'twitter';

interface GeneratedArticle {
  title: string;
  content: string;
  platform: ArticlePlatform;
  wordCount?: number;
  characterCount?: number;
  hashtags?: string[];
  thread?: string[];
  searchQuery: string;
  createdAt: Date;
  questionsUsed: number;
}

interface QueryListProps {
  queries: Query[];
  classifications: Map<string, IntentClassification>;
  onRemove: (id: string) => void;
}

const PLATFORM_CONFIG: Record<ArticlePlatform, { icon: string; label: string; color: string }> = {
  blog: { icon: '📝', label: 'Blog', color: 'bg-green-500 hover:bg-green-600' },
  linkedin: { icon: '💼', label: 'LinkedIn', color: 'bg-blue-600 hover:bg-blue-700' },
  instagram: { icon: '📸', label: 'Instagram', color: 'bg-pink-500 hover:bg-pink-600' },
  twitter: { icon: '𝕏', label: 'X/Twitter', color: 'bg-gray-800 hover:bg-gray-900' },
};

export default function QueryList({ queries, classifications, onRemove }: QueryListProps) {
  const getAuthHeaders = useAuthHeaders();
  const [relatedTopics, setRelatedTopics] = useState<Map<string, RelatedTopic[]>>(new Map());
  const [relatedQuestions, setRelatedQuestions] = useState<Map<string, RelatedQuestion[]>>(new Map());
  const [loadingQueries, setLoadingQueries] = useState<Set<string>>(new Set());
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  const [generatingArticle, setGeneratingArticle] = useState<Map<string, ArticlePlatform>>(new Map());
  const [articles, setArticles] = useState<Map<string, GeneratedArticle>>(new Map());
  const fetchedQueriesRef = useRef<Set<string>>(new Set()); // Track which queries we've attempted to fetch (using ref to avoid dependency issues)
  const previousQueryIdsRef = useRef<Set<string>>(new Set()); // Track previous query IDs to detect new ones

  // Fetch data for a single query
  const fetchQueryData = useCallback(async (query: Query) => {
    // Mark as fetched immediately to prevent duplicate calls
    fetchedQueriesRef.current.add(query.id);
    setLoadingQueries(prev => new Set(prev).add(query.id));
    
    try {
      // First, try to get existing data from database
      const [topicsResponse, questionsResponse] = await Promise.all([
        fetch(`/api/query/${query.id}/related-topics`, {
          headers: getAuthHeaders(),
        }).catch(() => null),
        fetch(`/api/query/${query.id}/related-questions`, {
          headers: getAuthHeaders(),
        }).catch(() => null),
      ]);

      let topics: RelatedTopic[] = [];
      let questions: RelatedQuestion[] = [];

      if (topicsResponse?.ok) {
        const topicsData = await topicsResponse.json();
        console.log(`[QueryList] Topics response for ${query.id}:`, JSON.stringify(topicsData, null, 2));
        if (topicsData.success && Array.isArray(topicsData.topics)) {
          topics = topicsData.topics;
          console.log(`[QueryList] Loaded ${topics.length} topics for ${query.id}`);
        } else {
          console.warn(`[QueryList] Topics response format issue:`, topicsData);
        }
      } else {
        console.warn(`[QueryList] Topics response not OK for ${query.id}:`, topicsResponse?.status, await topicsResponse?.text());
      }

      if (questionsResponse?.ok) {
        const questionsData = await questionsResponse.json();
        console.log(`[QueryList] Questions response for ${query.id}:`, JSON.stringify(questionsData, null, 2));
        if (questionsData.success && Array.isArray(questionsData.questions)) {
          questions = questionsData.questions;
          console.log(`[QueryList] Loaded ${questions.length} questions for ${query.id}`);
        } else {
          console.warn(`[QueryList] Questions response format issue:`, questionsData);
        }
      } else {
        console.warn(`[QueryList] Questions response not OK for ${query.id}:`, questionsResponse?.status, await questionsResponse?.text());
      }

      // If no data exists, fetch it from SERPAPI via the enrich endpoint
      if (topics.length === 0 && questions.length === 0) {
        console.log(`[QueryList] No data for query ${query.id}, fetching from SERPAPI...`);
        
        try {
          const enrichResponse = await fetch('/api/cluster/enrich', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ queryIds: [query.id] }),
          });
          
          if (enrichResponse.ok) {
            // Wait a bit for data to be stored, then fetch again
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const [newTopicsResponse, newQuestionsResponse] = await Promise.all([
              fetch(`/api/query/${query.id}/related-topics`, {
                headers: getAuthHeaders(),
              }).catch(() => null),
              fetch(`/api/query/${query.id}/related-questions`, {
                headers: getAuthHeaders(),
              }).catch(() => null),
            ]);

            if (newTopicsResponse?.ok) {
              const topicsData = await newTopicsResponse.json();
              console.log(`[QueryList] After enrich - Topics response for ${query.id}:`, topicsData);
              if (topicsData.success && topicsData.topics) {
                topics = topicsData.topics;
                console.log(`[QueryList] After enrich - Loaded ${topics.length} topics for ${query.id}`);
              }
            } else {
              console.warn(`[QueryList] After enrich - Topics response not OK for ${query.id}:`, newTopicsResponse?.status);
            }

            if (newQuestionsResponse?.ok) {
              const questionsData = await newQuestionsResponse.json();
              console.log(`[QueryList] After enrich - Questions response for ${query.id}:`, questionsData);
              if (questionsData.success && questionsData.questions) {
                questions = questionsData.questions;
                console.log(`[QueryList] After enrich - Loaded ${questions.length} questions for ${query.id}`);
              }
            } else {
              console.warn(`[QueryList] After enrich - Questions response not OK for ${query.id}:`, newQuestionsResponse?.status);
            }
          }
        } catch (error) {
          console.warn(`Error enriching query ${query.id}:`, error);
        }
      }

      // Update state
      console.log(`[QueryList] Updating state for ${query.id}: ${topics.length} topics, ${questions.length} questions`);
      if (topics.length > 0) {
        setRelatedTopics(prev => {
          const newMap = new Map(prev);
          newMap.set(query.id, topics);
          console.log(`[QueryList] Set ${topics.length} topics in state for ${query.id}`);
          return newMap;
        });
      }
      if (questions.length > 0) {
        setRelatedQuestions(prev => {
          const newMap = new Map(prev);
          newMap.set(query.id, questions);
          console.log(`[QueryList] Set ${questions.length} questions in state for ${query.id}`);
          return newMap;
        });
      }
    } catch (error) {
      console.warn(`Error loading data for query ${query.id}:`, error);
    } finally {
      setLoadingQueries(prev => {
        const newSet = new Set(prev);
        newSet.delete(query.id);
        return newSet;
      });
    }
  }, [getAuthHeaders]);

  // Load data for all queries on mount and when queries change
  useEffect(() => {
    if (queries.length === 0) {
      previousQueryIdsRef.current.clear();
      return;
    }

    // Get current query IDs
    const currentQueryIds = new Set(queries.map(q => q.id));
    
    // Find new queries that weren't in the previous set
    const newQueries = queries.filter(query => !previousQueryIdsRef.current.has(query.id));
    
    // Update the previous query IDs
    previousQueryIdsRef.current = currentQueryIds;

    // Automatically fetch data for new queries immediately
    newQueries.forEach(query => {
      // Only fetch if we haven't already attempted to fetch this query
      if (!fetchedQueriesRef.current.has(query.id)) {
        // Set loading state immediately to prevent button from showing
        setLoadingQueries(prev => new Set(prev).add(query.id));
        // Fetch the data
        fetchQueryData(query);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, fetchQueryData]);

  const toggleExpand = (queryId: string) => {
    setExpandedQueries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(queryId)) {
        newSet.delete(queryId);
      } else {
        newSet.add(queryId);
      }
      return newSet;
    });
  };

  const handleRefresh = async (query: Query) => {
    // Clear existing data and re-fetch
    setRelatedTopics(prev => {
      const newMap = new Map(prev);
      newMap.delete(query.id);
      return newMap;
    });
    setRelatedQuestions(prev => {
      const newMap = new Map(prev);
      newMap.delete(query.id);
      return newMap;
    });
    // Clear the fetched flag so it can be fetched again
    fetchedQueriesRef.current.delete(query.id);
    
    // Force re-fetch from SERPAPI
    setLoadingQueries(prev => new Set(prev).add(query.id));
    
    try {
      const enrichResponse = await fetch('/api/cluster/enrich', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ queryIds: [query.id], forceRefresh: true }),
      });
      
      if (enrichResponse.ok) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fetchQueryData(query);
      }
    } catch (error) {
      console.warn(`Error refreshing query ${query.id}:`, error);
      setLoadingQueries(prev => {
        const newSet = new Set(prev);
        newSet.delete(query.id);
        return newSet;
      });
    }
  };

  const handleDelete = async (query: Query) => {
    const topicsCount = relatedTopics.get(query.id)?.length || 0;
    const questionsCount = relatedQuestions.get(query.id)?.length || 0;
    
    let message = `Are you sure you want to delete "${query.text}"?`;
    if (topicsCount > 0 || questionsCount > 0) {
      message += `\n\nThis will also delete:`;
      if (topicsCount > 0) message += `\n• ${topicsCount} related queries`;
      if (questionsCount > 0) message += `\n• ${questionsCount} related questions`;
    }
    
    if (window.confirm(message)) {
      // Clear local state first
      setRelatedTopics(prev => {
        const newMap = new Map(prev);
        newMap.delete(query.id);
        return newMap;
      });
      setRelatedQuestions(prev => {
        const newMap = new Map(prev);
        newMap.delete(query.id);
        return newMap;
      });
      setExpandedQueries(prev => {
        const newSet = new Set(prev);
        newSet.delete(query.id);
        return newSet;
      });
      fetchedQueriesRef.current.delete(query.id);
      
      // Call the parent's onRemove to delete from database
      onRemove(query.id);
    }
  };

  const handleCreateArticle = async (query: Query, platform: ArticlePlatform) => {
    setGeneratingArticle(prev => new Map(prev).set(query.id, platform));
    
    try {
      const response = await fetch(`/api/query/${query.id}/article`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform }),
      });
      
      const data = await response.json();
      
      if (data.success && data.article) {
        setArticles(prev => new Map(prev).set(query.id, data.article));
      } else {
        alert('Failed to generate article: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error generating article:', error);
      alert('Error generating article. Please try again.');
    } finally {
      setGeneratingArticle(prev => {
        const newMap = new Map(prev);
        newMap.delete(query.id);
        return newMap;
      });
    }
  };

  const handleCloseArticle = (queryId: string) => {
    setArticles(prev => {
      const newMap = new Map(prev);
      newMap.delete(queryId);
      return newMap;
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900">Tracked Queries ({queries.length})</h2>
      {queries.length === 0 ? (
        <p className="text-gray-500">No queries tracked yet. Add a query to get started.</p>
      ) : (
        <div className="space-y-4">
          {queries.map(query => {
            const topics = relatedTopics.get(query.id) || [];
            const questions = relatedQuestions.get(query.id) || [];
            const isExpanded = expandedQueries.has(query.id);
            const isLoading = loadingQueries.has(query.id);
            const hasData = topics.length > 0 || questions.length > 0;
            const generatingPlatform = generatingArticle.get(query.id);
            const article = articles.get(query.id);
            
            // Debug logging
            if (topics.length > 0 || questions.length > 0) {
              console.log(`[QueryList] Rendering query ${query.id}: ${topics.length} topics, ${questions.length} questions, isLoading=${isLoading}`);
            }

            return (
              <div
                key={query.id}
                className="p-4 border border-gray-200 rounded-lg bg-white"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <p className="font-medium text-gray-900 text-lg">{query.text}</p>
                      <IntentBadges classification={classifications.get(query.id)} />
                    </div>
                    
                    {/* Create Article Buttons */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(Object.entries(PLATFORM_CONFIG) as [ArticlePlatform, typeof PLATFORM_CONFIG[ArticlePlatform]][]).map(([platform, config]) => (
                        <button
                          key={platform}
                          onClick={() => handleCreateArticle(query, platform)}
                          disabled={!!generatingPlatform || isLoading}
                          className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${config.color}`}
                          title={`Create ${config.label} content`}
                        >
                          {generatingPlatform === platform ? (
                            <>
                              <span className="animate-spin">⏳</span> Creating...
                            </>
                          ) : (
                            <>
                              <span>{config.icon}</span> {config.label}
                            </>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                      <div className="mt-3 text-sm text-gray-500">
                        <span className="inline-block animate-pulse">Loading related topics and questions...</span>
                      </div>
                    )}

                    {/* Related Queries Section */}
                    {!isLoading && topics.length > 0 && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <span>🔍</span> Related Queries
                          <span className="text-xs font-normal text-blue-600">({topics.length})</span>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {topics.slice(0, isExpanded ? topics.length : 8).map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded text-xs font-medium bg-white text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              {topic.topic}
                              {topic.is_rising && <span className="ml-1 text-green-600">↗</span>}
                            </span>
                          ))}
                          {topics.length > 8 && !isExpanded && (
                            <button
                              onClick={() => toggleExpand(query.id)}
                              className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              +{topics.length - 8} more
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Related Questions Section (from Google Related Questions API) */}
                    {!isLoading && questions.length > 0 && (
                      <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
                        <h4 className="text-sm font-semibold text-purple-900 mb-2 flex items-center gap-2">
                          <span>❓</span> Related Questions
                          <span className="text-xs font-normal text-purple-600">({questions.length})</span>
                        </h4>
                        <ul className="space-y-2">
                          {questions.slice(0, isExpanded ? questions.length : 4).map((item, idx) => (
                            <li key={idx} className="text-sm text-purple-900 bg-white p-2 rounded border border-purple-100">
                              <div className="flex items-start gap-2">
                                <span className="font-medium flex-1">{item.question}</span>
                                {item.link && (
                                  <a 
                                    href={item.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-purple-600 hover:text-purple-800 text-xs shrink-0"
                                    title="View source"
                                  >
                                    🔗
                                  </a>
                                )}
                              </div>
                              {item.snippet && (
                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.snippet}</p>
                              )}
                            </li>
                          ))}
                          {questions.length > 4 && !isExpanded && (
                            <button
                              onClick={() => toggleExpand(query.id)}
                              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                            >
                              +{questions.length - 4} more questions
                            </button>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Show expand/collapse button if there's data */}
                    {!isLoading && hasData && (
                      <button
                        onClick={() => toggleExpand(query.id)}
                        className="mt-3 text-sm text-gray-600 hover:text-gray-800 font-medium"
                      >
                        {isExpanded ? '▲ Show less' : '▼ Show all'}
                      </button>
                    )}

                    {/* No data state - show refresh button */}
                    {!isLoading && !hasData && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-sm text-gray-500 mb-2">No related data found yet.</p>
                        <button
                          onClick={() => handleRefresh(query)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          🔄 Fetch related topics & questions
                        </button>
                      </div>
                    )}

                    {/* Generated Article Display */}
                    {article && (
                      <div className={`mt-4 p-4 rounded-lg border ${
                        article.platform === 'blog' ? 'bg-green-50 border-green-200' :
                        article.platform === 'linkedin' ? 'bg-blue-50 border-blue-200' :
                        article.platform === 'instagram' ? 'bg-pink-50 border-pink-200' :
                        'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              <span>{PLATFORM_CONFIG[article.platform].icon}</span>
                              {PLATFORM_CONFIG[article.platform].label} Content
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              {article.wordCount ? `${article.wordCount} words` : `${article.characterCount} characters`}
                              {article.questionsUsed > 0 && ` • Used ${article.questionsUsed} related questions`}
                              {article.hashtags && article.hashtags.length > 0 && ` • ${article.hashtags.length} hashtags`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleCloseArticle(query.id)}
                            className="text-gray-500 hover:text-gray-700 text-lg"
                            title="Close"
                          >
                            ✕
                          </button>
                        </div>
                        
                        {/* Content Display */}
                        <div className={`bg-white p-4 rounded-lg border max-h-96 overflow-y-auto ${
                          article.platform === 'blog' ? 'border-green-100' :
                          article.platform === 'linkedin' ? 'border-blue-100' :
                          article.platform === 'instagram' ? 'border-pink-100' :
                          'border-gray-100'
                        }`}>
                          {article.platform === 'blog' ? (
                            // Blog: Render with markdown
                            <div className="prose prose-sm max-w-none text-gray-800">
                              {article.content.split('\n').map((paragraph, idx) => {
                                if (paragraph.startsWith('## ')) {
                                  return <h2 key={idx} className="text-lg font-bold mt-4 mb-2 text-gray-900">{paragraph.replace('## ', '')}</h2>;
                                }
                                if (paragraph.startsWith('### ')) {
                                  return <h3 key={idx} className="text-md font-semibold mt-3 mb-2 text-gray-800">{paragraph.replace('### ', '')}</h3>;
                                }
                                if (paragraph.trim() === '') return <br key={idx} />;
                                if (paragraph.trim().startsWith('- ') || paragraph.trim().startsWith('* ')) {
                                  return <li key={idx} className="ml-4 text-gray-700">{paragraph.replace(/^[-*]\s/, '')}</li>;
                                }
                                return <p key={idx} className="mb-2 text-gray-700">{paragraph}</p>;
                              })}
                            </div>
                          ) : article.platform === 'twitter' ? (
                            // Twitter: Show main tweet and thread
                            <div className="space-y-4">
                              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <p className="text-gray-900 whitespace-pre-wrap">{article.content}</p>
                                <p className="text-xs text-gray-500 mt-2">{article.characterCount}/280 characters</p>
                              </div>
                              {article.thread && article.thread.length > 0 && (
                                <div className="border-l-2 border-gray-300 pl-4 space-y-3">
                                  <p className="text-xs font-semibold text-gray-600 uppercase">Thread:</p>
                                  {article.thread.map((tweet, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <p className="text-gray-900 whitespace-pre-wrap text-sm">{tweet}</p>
                                      <p className="text-xs text-gray-500 mt-1">{tweet.length}/280</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            // LinkedIn & Instagram: Show with line breaks preserved
                            <div>
                              <p className="text-gray-900 whitespace-pre-wrap">{article.content}</p>
                              {article.characterCount && (
                                <p className="text-xs text-gray-500 mt-3">
                                  {article.characterCount} characters
                                  {article.platform === 'linkedin' && ' (optimal: ~1300)'}
                                  {article.platform === 'instagram' && ' (max: 2200)'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              const copyText = article.platform === 'blog' 
                                ? `# ${article.title}\n\n${article.content}`
                                : article.content;
                              navigator.clipboard.writeText(copyText);
                              alert('Copied to clipboard!');
                            }}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            📋 Copy
                          </button>
                          <button
                            onClick={() => handleCreateArticle(query, article.platform)}
                            disabled={!!generatingPlatform}
                            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                          >
                            🔄 Regenerate
                          </button>
                          {/* Quick switch to other platforms */}
                          {(Object.entries(PLATFORM_CONFIG) as [ArticlePlatform, typeof PLATFORM_CONFIG[ArticlePlatform]][])
                            .filter(([p]) => p !== article.platform)
                            .map(([platform, config]) => (
                              <button
                                key={platform}
                                onClick={() => handleCreateArticle(query, platform)}
                                disabled={!!generatingPlatform}
                                className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                              >
                                {config.icon} Switch to {config.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => handleRefresh(query)}
                      disabled={isLoading}
                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      title="Refresh data"
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => handleDelete(query)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete query and all associated data"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

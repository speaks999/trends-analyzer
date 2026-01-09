'use client';

import { useState } from 'react';
import { GeneratedQuery } from '@/app/lib/query-templates';

interface AISuggestionsProps {
  onAddQuery: (query: string) => void;
}

export default function AISuggestions({ onAddQuery }: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<GeneratedQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(3);
  const [focus, setFocus] = useState<'all' | 'pain' | 'tool' | 'transition' | 'education'>('all');

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-queries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count,
          focus: focus === 'all' ? undefined : focus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSuggestions(data.queries);
      } else {
        console.error('Failed to generate suggestions:', data.error);
        alert('Failed to generate suggestions: ' + data.error);
      }
    } catch (error) {
      console.error('Error generating suggestions:', error);
      alert('Error generating suggestions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900">AI Query Suggestions</h2>
      
      <div className="flex gap-2 mb-4">
        <input
          type="number"
          min="1"
          max="50"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-gray-900 bg-white"
        />
        <select
          value={focus}
          onChange={(e) => setFocus(e.target.value as any)}
          className="px-3 py-1 border border-gray-300 rounded text-gray-900 bg-white"
        >
          <option value="all">All</option>
          <option value="pain">Pain</option>
          <option value="tool">Tool</option>
          <option value="transition">Transition</option>
          <option value="education">Education</option>
        </select>
        <button
          onClick={generateSuggestions}
          disabled={loading}
          className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Suggestions'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-900">Suggestions ({suggestions.length}):</h3>
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 border border-gray-300 rounded hover:bg-gray-50 bg-white"
            >
              <span className="flex-1 text-gray-900 font-medium">{suggestion.text}</span>
              <button
                onClick={() => onAddQuery(suggestion.text)}
                className="ml-2 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


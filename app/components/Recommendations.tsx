'use client';

import { TutorialRecommendation, FeatureRecommendation } from '@/app/lib/recommendations';
import type { TutorialRecommendation as AITutorialRecommendation, FeatureRecommendation as AIFeatureRecommendation } from '@/app/lib/recommendations-ai';

interface RecommendationsProps {
  tutorials: (TutorialRecommendation | AITutorialRecommendation)[];
  features: (FeatureRecommendation | AIFeatureRecommendation)[];
}

export default function Recommendations({ tutorials, features }: RecommendationsProps) {
  // Tutorial recommendations are now generated within cluster cards, so we only show features here
  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Feature Recommendations</h2>
      {features.length === 0 ? (
        <p className="text-gray-500">No feature recommendations yet. Generate feature recommendations from cluster cards.</p>
      ) : (
        <div className="space-y-3">
          {features.map((feature, index) => (
            <div key={index} className="border rounded p-3">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-semibold">{feature.title}</h3>
                {(feature as any).ai_generated && (
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-medium">
                    AI Generated
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-2">{feature.description}</p>
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-1">Evidence:</p>
                <ul className="list-disc list-inside space-y-1">
                  {feature.evidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


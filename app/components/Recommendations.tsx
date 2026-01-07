'use client';

import { TutorialRecommendation, FeatureRecommendation } from '@/app/lib/recommendations';

interface RecommendationsProps {
  tutorials: TutorialRecommendation[];
  features: FeatureRecommendation[];
}

export default function Recommendations({ tutorials, features }: RecommendationsProps) {
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-bold mb-4">Tutorial Recommendations</h2>
        {tutorials.length === 0 ? (
          <p className="text-gray-500">No tutorial recommendations yet.</p>
        ) : (
          <div className="space-y-3">
            {tutorials.map((tutorial, index) => (
              <div key={index} className="border rounded p-3">
                <h3 className="font-semibold mb-1">{tutorial.title}</h3>
                <p className="text-sm text-gray-600 mb-2">{tutorial.description}</p>
                <div className="text-xs text-gray-500">
                  <p className="font-medium mb-1">Evidence:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {tutorial.evidence.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-bold mb-4">Feature Recommendations</h2>
        {features.length === 0 ? (
          <p className="text-gray-500">No feature recommendations yet.</p>
        ) : (
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div key={index} className="border rounded p-3">
                <h3 className="font-semibold mb-1">{feature.title}</h3>
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
    </div>
  );
}


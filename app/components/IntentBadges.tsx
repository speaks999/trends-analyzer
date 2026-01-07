'use client';

import { IntentClassification } from '@/app/lib/storage';

interface IntentBadgesProps {
  classification?: IntentClassification;
}

export default function IntentBadges({ classification }: IntentBadgesProps) {

  if (!classification) {
    return null;
  }

  const intentColors: Record<string, string> = {
    pain: 'bg-red-100 text-red-800',
    tool: 'bg-blue-100 text-blue-800',
    transition: 'bg-purple-100 text-purple-800',
    education: 'bg-green-100 text-green-800',
  };

  const intentLabels: Record<string, string> = {
    pain: 'Pain',
    tool: 'Tool',
    transition: 'Transition',
    education: 'Education',
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-semibold ${intentColors[classification.intent_type] || 'bg-gray-100 text-gray-800'}`}
      title={`Confidence: ${classification.confidence}%`}
    >
      {intentLabels[classification.intent_type] || classification.intent_type}
    </span>
  );
}


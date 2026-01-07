'use client';

import { Action } from '@/app/lib/actions';

interface ActionsPanelProps {
  actions: Action[];
}

export default function ActionsPanel({ actions }: ActionsPanelProps) {
  const getActionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      content: 'bg-blue-100 text-blue-800',
      product: 'bg-purple-100 text-purple-800',
      alert: 'bg-yellow-100 text-yellow-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      blog: '📝',
      tutorial: '🎓',
      checklist: '✅',
      comparison: '⚖️',
      email: '📧',
      video: '🎥',
      feature: '⚙️',
      rename: '🏷️',
      onboarding: '🚀',
      template: '📋',
      roadmap: '🗺️',
      threshold: '🔔',
      breakout: '🚀',
      summary: '📊',
    };
    return icons[category] || '•';
  };

  if (actions.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <h2 className="text-xl font-bold mb-4">Actions</h2>
        <p className="text-gray-500">No actions generated yet.</p>
      </div>
    );
  }

  // Group by type
  const actionsByType = actions.reduce((acc, action) => {
    if (!acc[action.type]) {
      acc[action.type] = [];
    }
    acc[action.type].push(action);
    return acc;
  }, {} as Record<string, Action[]>);

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Actions</h2>
      <div className="space-y-4">
        {Object.entries(actionsByType).map(([type, typeActions]) => (
          <div key={type}>
            <h3 className={`inline-block px-3 py-1 rounded text-sm font-semibold mb-2 ${getActionTypeColor(type)}`}>
              {type.toUpperCase()} ({typeActions.length})
            </h3>
            <div className="space-y-2">
              {typeActions.map((action, index) => (
                <div
                  key={index}
                  className="border rounded p-3 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getCategoryIcon(action.category)}</span>
                        <span className="font-semibold">{action.title}</span>
                        <span className="text-xs text-gray-500">Priority: {action.priority}</span>
                      </div>
                      <p className="text-sm text-gray-600">{action.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


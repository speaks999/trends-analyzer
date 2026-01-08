'use client';

import { useState, useEffect } from 'react';
import { EntrepreneurProfile } from '@/app/lib/storage';
import { useAuth } from '@/app/lib/auth-context';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<Partial<EntrepreneurProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      loadProfile();
    } else {
      setLoading(false);
    }
  }, [session]);

  const loadProfile = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/profile', { headers });
      const data = await response.json();
      if (data.success) {
        setProfile(data.profile || {});
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session) {
      alert('You must be logged in to save your profile');
      return;
    }

    setSaving(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          demographic: profile.demographic || null,
          tech_savviness: profile.tech_savviness || null,
          business_stage: profile.business_stage || null,
          industry: profile.industry || null,
          geographic_region: profile.geographic_region || null,
          preferences: profile.preferences || null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert('Profile saved successfully!');
        onClose();
      } else {
        alert('Failed to save profile: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Entrepreneur Profile Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Set your profile to receive personalized tutorial and feature recommendations tailored to your needs.
        </p>

        <div className="space-y-4">
          {/* Demographic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Demographic
            </label>
            <input
              type="text"
              value={profile.demographic || ''}
              onChange={(e) => setProfile({ ...profile, demographic: e.target.value })}
              placeholder="e.g., age 35-50, urban, suburban, rural"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Tech Savviness */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tech Savviness Level
            </label>
            <select
              value={profile.tech_savviness || ''}
              onChange={(e) => setProfile({ ...profile, tech_savviness: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select level...</option>
              <option value="non-tech">Non-Tech Savvy</option>
              <option value="basic">Basic</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          {/* Business Stage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Stage
            </label>
            <input
              type="text"
              value={profile.business_stage || ''}
              onChange={(e) => setProfile({ ...profile, business_stage: e.target.value })}
              placeholder="e.g., idea, early-stage, growth, established"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Industry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Industry
            </label>
            <input
              type="text"
              value={profile.industry || ''}
              onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
              placeholder="e.g., e-commerce, SaaS, services, retail"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Geographic Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Geographic Region
            </label>
            <input
              type="text"
              value={profile.geographic_region || ''}
              onChange={(e) => setProfile({ ...profile, geographic_region: e.target.value })}
              placeholder="e.g., North America, Europe, Asia"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import { useState } from 'react';
import SettingsPanel from './SettingsPanel';

export default function Navigation() {
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <>
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Trend Intelligence
              </Link>
              <Link
                href="/help"
                className={`text-sm font-medium px-3 py-2 rounded-lg ${
                  isActive('/help')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Help
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Settings
              </button>
              <UserMenu />
            </div>
          </div>
        </div>
      </nav>
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

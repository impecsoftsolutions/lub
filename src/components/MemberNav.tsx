import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMember } from '../contexts/useMember';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Profile', path: '/dashboard/profile' },
  { label: 'Settings', path: '/dashboard/settings' },
];

const MemberNav: React.FC = () => {
  const location = useLocation();
  const { member } = useMember();

  const displayName = (() => {
    const raw = member?.full_name ?? '';
    return raw.trim().split(/\s+/).slice(0, 2).join(' ');
  })();

  return (
    <div className="bg-card border-b border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1" aria-label="Member navigation">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {displayName && (
            <span className="text-xs text-muted-foreground hidden sm:block">{displayName}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberNav;

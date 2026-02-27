'use client';

import { useCallback } from 'react';
import { NavLinks } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileSidebar } from '@/components/MobileSidebar';
import { GlobalSearch, SearchTrigger } from '@/components/GlobalSearch';

/**
 * Sidebar -- client wrapper that coordinates desktop sidebar, mobile sidebar,
 * and the Cmd+K search palette. Rendered inside layout.tsx.
 */
export function Sidebar() {
  const openSearch = useCallback(() => {
    // We trigger the search modal by simulating Cmd+K.
    // Instead, we expose a controlled open state via a custom event.
    // The GlobalSearch component listens for this.
    window.dispatchEvent(new CustomEvent('manor:open-search'));
  }, []);

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className="hidden md:flex"
        style={{
          width: '220px',
          flexShrink: 0,
          flexDirection: 'column',
          background: 'var(--sidebar-bg)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderRight: '1px solid var(--separator)',
        }}
      >
        {/* App icon + title */}
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f5c518, #e8b800)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0,
              }}
            >
              {'\ud83c\udff0'}
            </div>
            <div>
              <div
                style={{
                  fontSize: '17px',
                  fontWeight: 600,
                  letterSpacing: '-0.3px',
                  color: 'var(--text-primary)',
                }}
              >
                Manor
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.01em',
                }}
              >
                Command Centre
              </div>
            </div>
          </div>
        </div>

        {/* Search trigger */}
        <div className="px-3 pb-2">
          <SearchTrigger onClick={openSearch} />
        </div>

        <NavLinks />
        <ThemeToggle />
      </aside>

      {/* Mobile sidebar */}
      <MobileSidebar onOpenSearch={openSearch} />

      {/* Global search modal (Cmd+K) */}
      <GlobalSearch />
    </>
  );
}

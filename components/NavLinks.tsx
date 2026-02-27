'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Map, MessageSquare, Clock, Brain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CronJob } from '@/lib/types';

// ---------------------------------------------------------------------------
// Nav item definition
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: 'agents' | 'unread' | 'errors';
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Map', icon: Map, badge: 'agents' },
  { href: '/chat', label: 'Messages', icon: MessageSquare, badge: 'unread' },
  { href: '/crons', label: 'Crons', icon: Clock, badge: 'errors' },
  { href: '/memory', label: 'Memory', icon: Brain },
];

// ---------------------------------------------------------------------------
// NavLinks component
// ---------------------------------------------------------------------------

export function NavLinks() {
  const pathname = usePathname();
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [cronErrorCount, setCronErrorCount] = useState<number | null>(null);

  // Fetch agent count
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setAgentCount(data.length);
        }
      })
      .catch(() => {
        setAgentCount(null);
      });
  }, []);

  // Fetch cron error count
  useEffect(() => {
    fetch('/api/crons')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const errors = (data as CronJob[]).filter((c) => c.status === 'error');
          setCronErrorCount(errors.length);
        }
      })
      .catch(() => {
        setCronErrorCount(null);
      });
  }, []);

  // Resolve badge content per nav item
  function getBadge(item: NavItem): React.ReactNode {
    if (item.badge === 'agents' && agentCount !== null) {
      return (
        <span
          className="nav-badge"
          style={{
            marginLeft: 'auto',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--fill-quaternary)',
            color: 'var(--text-tertiary)',
            lineHeight: '16px',
          }}
        >
          {agentCount}
        </span>
      );
    }
    if (item.badge === 'errors' && cronErrorCount !== null && cronErrorCount > 0) {
      return (
        <span
          className="nav-badge-error"
          aria-label={`${cronErrorCount} cron error${cronErrorCount > 1 ? 's' : ''}`}
          style={{
            marginLeft: 'auto',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--system-red)',
            flexShrink: 0,
            animation: 'pulse-red 1.5s ease-in-out infinite',
          }}
        />
      );
    }
    return null;
  }

  return (
    <nav className="flex-1 flex flex-col" aria-label="Main navigation">
      <div className="px-3 pt-2 pb-3">
        {/* Section header */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            padding: '0 8px',
            marginBottom: '4px',
          }}
        >
          Workspace
        </div>

        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item focus-ring ${isActive ? 'nav-item-active' : ''}`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '44px',
                  padding: '0 10px 0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-fill)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 100ms var(--ease-smooth)',
                }}
              >
                <Icon
                  size={18}
                  style={{
                    flexShrink: 0,
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    transition: 'color 100ms var(--ease-smooth)',
                  }}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {getBadge(item)}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1" />

      {/* User footer */}
      <div
        style={{
          borderTop: '1px solid var(--separator)',
          padding: '10px 16px',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'var(--accent-fill)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent)',
              flexShrink: 0,
              letterSpacing: '-0.02em',
            }}
          >
            JR
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              John Rice
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
              }}
            >
              Owner
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

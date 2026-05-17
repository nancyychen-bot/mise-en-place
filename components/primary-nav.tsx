'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ROW1 = [
  { label: 'Watchlist', href: '/dashboard' },
  { label: 'Preferences', href: '/dashboard/preferences' },
  { label: 'Activity', href: '/dashboard/activity' },
] as const;

const NAV_ROW2 = [
  { label: 'Setup Guide', href: '/dashboard/setup' },
  { label: 'Account', href: '/dashboard/account' },
] as const;

const NAV_ITEMS = [...NAV_ROW1, ...NAV_ROW2];

export default function PrimaryNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  return (
    <nav
      style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '0',
        padding: '0',
        borderBottom: '1px solid var(--border)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      {NAV_ITEMS.map(({ label, href }, i) => (
        <React.Fragment key={href}>
        {i === 3 && <span className="min-[600px]:hidden" style={{ flexBasis: '100%', height: 0 }} />}
        <Link
          href={href}
          style={{
            display: 'inline-block',
            padding: '12px 16px',
            color: 'var(--text)',
            textDecoration: 'none',
            borderBottom: isActive(href)
              ? '2px solid var(--text)'
              : '2px solid transparent',
            marginBottom: '-1px',
            transition: 'border-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!isActive(href)) {
              (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = 'var(--text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive(href)) {
              (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = 'transparent';
            }
          }}
        >
          {label}
        </Link>
        </React.Fragment>
      ))}
    </nav>
  );
}

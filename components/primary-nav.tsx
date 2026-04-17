'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Watchlist', href: '/dashboard' },
  { label: 'Preferences', href: '/dashboard/preferences' },
  { label: 'Activity', href: '/dashboard/activity' },
  { label: 'Setup Guide', href: '/dashboard/setup' },
  { label: 'Account', href: '/dashboard/account' },
] as const;

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
        gap: '28px',
        padding: '14px 40px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
      className="max-[600px]:justify-start max-[600px]:px-4"
    >
      {NAV_ITEMS.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          style={{
            display: 'inline-block',
            padding: '0 0 14px',
            color: 'var(--text)',
            textDecoration: 'none',
            borderBottom: isActive(href)
              ? '2px solid var(--text)'
              : '2px solid transparent',
            marginBottom: '-1px',
            transition: 'border-color 0.15s',
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
      ))}
    </nav>
  );
}

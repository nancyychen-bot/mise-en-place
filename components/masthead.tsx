import type { User } from '@/lib/types';
import SignOutButton from './sign-out-button';

interface MastheadProps {
  user?: User | null;
}

export default function Masthead({ user }: MastheadProps) {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '28px 40px 20px',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          fontSize: '11px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          fontWeight: 500,
        }}
      >
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* Hamburger — decorative only */}
          <button
            style={{
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              padding: '5px 10px',
              fontFamily: 'var(--font-family-sans)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              cursor: 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            aria-hidden="true"
            tabIndex={-1}
          >
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Menu
          </button>
          {/* Language pill — decorative */}
          <span
            style={{
              border: '1px solid var(--border-light)',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.08em',
            }}
          >
            EN
          </span>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {user && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
              <SignOutButton />
            </>
          )}
        </div>
      </div>

      {/* Centered title block */}
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <p
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontStyle: 'italic',
            fontSize: '16px',
            fontWeight: 700,
            marginBottom: '2px',
            color: 'var(--text)',
          }}
        >
          Impossible reservations made possible
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontWeight: 900,
            fontSize: '56px',
            letterSpacing: '-0.02em',
            lineHeight: '0.95',
            color: 'var(--text)',
            display: 'inline-block',
          }}
        >
          MISE EN PLACE
          <sup
            style={{
              fontSize: '14px',
              fontWeight: 400,
              verticalAlign: 'super',
              marginLeft: '2px',
              fontFamily: 'var(--font-family-sans)',
            }}
          >
            ®
          </sup>
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginTop: '10px',
          }}
        >
          Get notified every time one of your favourite restaurants has an upcoming opening
        </p>
      </div>
    </header>
  );
}

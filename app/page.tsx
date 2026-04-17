import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      {/* Masthead (public, no user) */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '28px 40px 20px',
        }}
      >
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
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link href="/signin" style={{ color: 'var(--text-secondary)' }}>
              Sign In
            </Link>
            <Link href="/signup" style={{ color: 'var(--text-secondary)' }}>
              Create Account
            </Link>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-family-serif)',
              fontStyle: 'italic',
              fontSize: '16px',
              fontWeight: 700,
              marginBottom: '2px',
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
              lineHeight: 0.95,
              color: 'var(--text)',
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
              fontFamily: 'var(--font-family-sans)',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginTop: '10px',
            }}
          >
            Get notified every time one of your favourite restaurants has an upcoming opening
          </p>
        </div>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 40px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontWeight: 700,
            fontSize: '28px',
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            maxWidth: '560px',
            lineHeight: 1.3,
            marginBottom: '48px',
          }}
        >
          Monitor Resy and OpenTable for impossible reservations — get a free push
          notification the moment a table opens up.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/signin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '14px 32px',
              background: 'var(--text)',
              color: 'var(--bg)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              border: '1px solid var(--text)',
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '14px 32px',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              border: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            Create Account
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-light)',
          padding: '20px 40px',
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Mise en Place · $0/month forever · Built with direct API calls + ntfy.sh
      </footer>
    </div>
  );
}

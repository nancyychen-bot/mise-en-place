'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BtnPrimary } from '@/components/buttons';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Sign in failed');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '80px 32px 60px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p
            style={{
              fontFamily: 'var(--font-family-serif)',
              fontStyle: 'italic',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            Bienvenue à
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-family-serif)',
              fontWeight: 900,
              fontSize: '40px',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: 'var(--text)',
            }}
          >
            Mise en Place
          </h1>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid var(--border)',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: 'var(--text)',
              color: 'var(--bg)',
            }}
          >
            Sign In
          </div>
          <Link
            href="/signup"
            style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: 'var(--bg)',
              color: 'var(--text)',
              display: 'block',
            }}
          >
            Create Account
          </Link>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--tag-red)',
                background: 'var(--red-light)',
                padding: '10px 14px',
                borderLeft: '3px solid var(--tag-red)',
              }}
            >
              {error}
            </p>
          )}

          <BtnPrimary
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </BtnPrimary>
        </form>

        {/* Footer */}
        <p
          style={{
            marginTop: '32px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Each account has its own watchlist, API keys, and notification settings.
          Your data is encrypted and never shared.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BtnPrimary } from '@/components/buttons';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to update password');
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

        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '28px',
          }}
        >
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
              New Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label
              htmlFor="confirm"
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
              Confirm Password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
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
            {loading ? 'Updating…' : 'Set New Password'}
          </BtnPrimary>
        </form>

        <p style={{ marginTop: '24px', textAlign: 'center' }}>
          <Link
            href="/signin"
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              textDecoration: 'underline',
            }}
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

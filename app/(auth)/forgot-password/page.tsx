'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BtnPrimary } from '@/components/buttons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      setSubmitted(true);
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

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text)',
                lineHeight: 1.6,
                marginBottom: '24px',
              }}
            >
              If an account exists for <strong>{email}</strong>, you&apos;ll receive a
              password reset link shortly. Check your inbox.
            </p>
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
          </div>
        ) : (
          <>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                marginBottom: '28px',
              }}
            >
              Enter your email address and we&apos;ll send you a link to reset your
              password.
            </p>

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
                {loading ? 'Sending…' : 'Send Reset Link'}
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
          </>
        )}
      </div>
    </div>
  );
}

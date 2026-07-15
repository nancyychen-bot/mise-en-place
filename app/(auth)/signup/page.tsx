'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BtnPrimary } from '@/components/buttons';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestSource, setRequestSource] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState('');

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setRequestError('');
    setRequestLoading(true);

    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: requestName, email: requestEmail, source: requestSource }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRequestError(data.error ?? 'Something went wrong');
        return;
      }

      setRequestSent(true);
    } catch {
      setRequestError('Something went wrong. Please try again.');
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName || undefined, inviteCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Sign up failed');
        return;
      }

      // New users go to setup guide
      router.push('/dashboard/setup');
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
          <Link
            href="/signin"
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
            Sign In
          </Link>
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
            Create Account
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="displayName"
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
              Name <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

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
              htmlFor="inviteCode"
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
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="text"
              required
              className="form-input"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter your invite code"
            />
            <button
              type="button"
              onClick={() => setShowRequestModal(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Request a code
            </button>
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
              autoComplete="new-password"
              required
              minLength={8}
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
            {loading ? 'Creating account…' : 'Create Account'}
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

      {showRequestModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => setShowRequestModal(false)}
        >
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              width: '100%',
              maxWidth: '400px',
              padding: '32px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontFamily: 'var(--font-family-serif)',
                fontWeight: 700,
                fontSize: '22px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}
            >
              Request an Invite Code
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '24px',
                lineHeight: 1.5,
              }}
            >
              We&apos;ll review your request and send you a code.
            </p>

            {requestSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p
                  style={{
                    fontSize: '14px',
                    color: 'var(--text)',
                    fontWeight: 600,
                    marginBottom: '8px',
                  }}
                >
                  Request sent!
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  We&apos;ll be in touch soon.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowRequestModal(false);
                    setRequestSent(false);
                    setRequestName('');
                    setRequestEmail('');
                    setRequestSource('');
                  }}
                  style={{
                    marginTop: '16px',
                    background: 'none',
                    border: 'none',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleRequestCode}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                <div>
                  <label
                    htmlFor="requestName"
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
                    Name
                  </label>
                  <input
                    id="requestName"
                    type="text"
                    required
                    className="form-input"
                    value={requestName}
                    onChange={(e) => setRequestName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="requestEmail"
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
                    id="requestEmail"
                    type="email"
                    required
                    className="form-input"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="requestSource"
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
                    Where did you hear about this?
                  </label>
                  <input
                    id="requestSource"
                    type="text"
                    required
                    className="form-input"
                    value={requestSource}
                    onChange={(e) => setRequestSource(e.target.value)}
                    placeholder="A friend, social media, etc."
                  />
                </div>

                {requestError && (
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--tag-red)',
                      background: 'var(--red-light)',
                      padding: '10px 14px',
                      borderLeft: '3px solid var(--tag-red)',
                    }}
                  >
                    {requestError}
                  </p>
                )}

                <BtnPrimary
                  type="submit"
                  disabled={requestLoading}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {requestLoading ? 'Sending…' : 'Send Request'}
                </BtnPrimary>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

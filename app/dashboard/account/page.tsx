'use client';

import { useState, useEffect } from 'react';
import type { NtfyPriority } from '@/lib/types';
import { BtnPrimary, BtnSecondary } from '@/components/buttons';
import FieldRow from '@/components/field-row';
import Toggle from '@/components/toggle';
import SignOutButton from '@/components/sign-out-button';

interface AccountData {
  email: string;
  displayName: string | null;
  ntfyTopic: string | null;
  ntfyPriority: NtfyPriority;
  monitoringEnabled: boolean;
  timezone: string;
  resyApiKey: string | null;
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '40px',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-serif)',
  fontWeight: 900,
  fontSize: '22px',
  paddingBottom: '12px',
  borderBottom: '2px solid var(--border)',
  marginBottom: '20px',
};

export default function AccountPage() {
  const [data, setData] = useState<AccountData>({
    email: '',
    displayName: null,
    ntfyTopic: null,
    ntfyPriority: 'default',
    monitoringEnabled: true,
    timezone: 'America/New_York',
    resyApiKey: null,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      email: data.email,
      displayName: data.displayName ?? undefined,
      ntfyTopic: data.ntfyTopic ?? undefined,
      ntfyPriority: data.ntfyPriority,
      monitoringEnabled: data.monitoringEnabled,
      timezone: data.timezone,
      resyApiKey: data.resyApiKey ?? undefined,
    };

    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Save failed');
        return;
      }

      setSaved(true);
      // Refresh
      const fresh = await fetch('/api/account').then((r) => r.json());
      setData(fresh);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestNotification() {
    setTesting(true);
    setTestResult('');
    try {
      const res = await fetch('/api/notify-test', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setTestResult('✓ Notification sent! Check your phone.');
      } else {
        setTestResult(`✗ ${d.error ?? 'Test failed'}`);
      }
    } catch {
      setTestResult('✗ Something went wrong');
    } finally {
      setTesting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    border: '1px solid var(--border-light)',
    background: 'var(--bg)',
    fontSize: '14px',
    color: 'var(--text)',
    outline: 'none',
    width: '100%',
    fontFamily: 'var(--font-family-sans)',
    borderRadius: 0,
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 40px 80px' }}>
      <form onSubmit={handleSave}>
        {/* Profile */}
        <div style={sectionStyle}>
          <h2 style={sectionHeaderStyle}>Profile</h2>
          <FieldRow label="Display Name" description="How you appear in the app">
            <input
              type="text"
              style={inputStyle}
              value={data.displayName ?? ''}
              onChange={(e) => setData((d) => ({ ...d, displayName: e.target.value || null }))}
              placeholder="Your name"
            />
          </FieldRow>
          <FieldRow label="Email" description="Used to sign in">
            <input
              type="email"
              style={inputStyle}
              value={data.email}
              onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
            />
          </FieldRow>
        </div>

        {/* Notifications */}
        <div style={sectionStyle}>
          <h2 style={sectionHeaderStyle}>Notifications (ntfy.sh)</h2>
          <FieldRow
            label="ntfy Topic"
            description="Your private notification channel. Create a unique topic name in the ntfy app."
          >
            <input
              type="text"
              style={inputStyle}
              value={data.ntfyTopic ?? ''}
              onChange={(e) => setData((d) => ({ ...d, ntfyTopic: e.target.value || null }))}
              placeholder="e.g. mise-en-place-nancy-x9k2"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Hit <strong>Save Changes</strong> at the bottom before testing notifications.
            </p>
          </FieldRow>
          <FieldRow
            label="Notification Priority"
            description="Controls how urgently your phone alerts you."
          >
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={data.ntfyPriority}
              onChange={(e) => setData((d) => ({ ...d, ntfyPriority: e.target.value as NtfyPriority }))}
            >
              <option value="min">Min — silent</option>
              <option value="low">Low — no sound</option>
              <option value="default">Default — standard alert</option>
              <option value="high">High — urgent alert</option>
              <option value="max">Max — maximum urgency</option>
            </select>
          </FieldRow>
          <FieldRow label="Test Notification" description="Send a test to verify your setup works.">
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <BtnSecondary small type="button" onClick={handleTestNotification} disabled={testing}>
                {testing ? 'Sending…' : 'Send Test Notification'}
              </BtnSecondary>
              {testResult && (
                <span
                  style={{
                    fontSize: '13px',
                    color: testResult.startsWith('✓') ? 'var(--tag-green)' : 'var(--tag-red)',
                  }}
                >
                  {testResult}
                </span>
              )}
            </div>
          </FieldRow>
        </div>

        {/* Monitoring */}
        <div style={sectionStyle}>
          <h2 style={sectionHeaderStyle}>Monitoring</h2>
          <FieldRow
            label="Timezone"
            description="Used to interpret your active hours and quiet hours correctly."
          >
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={data.timezone}
              onChange={(e) => setData((d) => ({ ...d, timezone: e.target.value }))}
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="America/Anchorage">Alaska Time (AKT)</option>
              <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="Europe/Paris">Paris (CET/CEST)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
              <option value="Asia/Shanghai">Shanghai (CST)</option>
              <option value="Australia/Sydney">Sydney (AEST)</option>
            </select>
          </FieldRow>
          <FieldRow
            label="Monitoring Enabled"
            description="Toggle to pause all checks without removing your watchlist."
          >
            <Toggle
              checked={data.monitoringEnabled}
              onChange={(checked) => setData((d) => ({ ...d, monitoringEnabled: checked }))}
              label="monitoring"
            />
          </FieldRow>
        </div>

        {error && (
          <p
            style={{
              marginBottom: '24px',
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

        {/* Footer bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '24px',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            style={{
              border: '1px solid var(--border-light)',
              background: 'none',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '8px 16px',
              color: 'var(--tag-red)',
              fontFamily: 'var(--font-family-sans)',
            }}
            onClick={async () => {
              if (!confirm('Are you sure you want to delete your account? This cannot be undone.'))
                return;
              await fetch('/api/account', { method: 'DELETE' });
              window.location.href = '/';
            }}
          >
            Delete Account
          </button>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <SignOutButton />
            <BtnPrimary type="submit" disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </BtnPrimary>
          </div>
        </div>
      </form>
    </div>
  );
}

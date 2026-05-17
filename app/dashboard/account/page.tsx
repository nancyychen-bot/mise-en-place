'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NtfyPriority } from '@/lib/types';
import { BtnSecondary } from '@/components/buttons';
import FieldRow from '@/components/field-row';
import Toggle from '@/components/toggle';
import SignOutButton from '@/components/sign-out-button';
import Link from 'next/link';

interface AccountData {
  email: string;
  displayName: string | null;
  ntfyTopic: string | null;
  ntfyPriority: NtfyPriority;
  monitoringEnabled: boolean;
  timezone: string;
  resyApiKey: string | null;
  resyAuthToken: string | null;
  opentableSession: string | null;
  sevenroomsAuthToken: string | null;
  tokenExpired: Record<string, boolean>;
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
    resyAuthToken: null,
    opentableSession: null,
    sevenroomsAuthToken: null,
    tokenExpired: {},
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        loaded.current = true;
      });
  }, []);

  // Auto-save: debounce 800ms after any data change
  const doSave = useCallback(async (current: AccountData) => {
    setSaveStatus('saving');
    setError('');
    const payload: Record<string, unknown> = {
      email: current.email,
      displayName: current.displayName ?? undefined,
      ntfyTopic: current.ntfyTopic ?? undefined,
      ntfyPriority: current.ntfyPriority,
      monitoringEnabled: current.monitoringEnabled,
      timezone: current.timezone,
      resyApiKey: current.resyApiKey ?? undefined,
      resyAuthToken: current.resyAuthToken && current.resyAuthToken !== '••••••' ? current.resyAuthToken : undefined,
      opentableSession: current.opentableSession && current.opentableSession !== '••••••' ? current.opentableSession : undefined,
      sevenroomsAuthToken: current.sevenroomsAuthToken && current.sevenroomsAuthToken !== '••••••' ? current.sevenroomsAuthToken : undefined,
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
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setError('Something went wrong');
      setSaveStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(data), 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data, doSave]);

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
      {/* Auto-save indicator */}
      <div style={{ position: 'fixed', top: '16px', right: '24px', zIndex: 100, backdropFilter: 'blur(8px)' }}>
        {saveStatus === 'saving' && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg)', padding: '4px 10px', border: '1px solid var(--border-light)' }}>
            Saving…
          </span>
        )}
        {saveStatus === 'saved' && (
          <span style={{ fontSize: '12px', color: 'var(--tag-green)', background: 'var(--bg)', padding: '4px 10px', border: '1px solid var(--border-light)' }}>
            ✓ Saved
          </span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: '12px', color: 'var(--tag-red)', background: 'var(--bg)', padding: '4px 10px', border: '1px solid var(--border-light)' }}>
            Save failed
          </span>
        )}
      </div>

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

      {/* Platform Connections */}
      <div style={sectionStyle}>
        <h2 style={sectionHeaderStyle}>Platform Connections</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Connect your accounts to enable auto-booking. See the{' '}
          <Link href="/dashboard/setup" style={{ textDecoration: 'underline' }}>Setup Guide</Link>{' '}
          for instructions.
        </p>
        {(['resy', 'opentable'] as const).map((platform) => {
          const fieldMap = { resy: 'resyAuthToken', opentable: 'opentableSession' } as const;
          const labelMap = { resy: 'Resy', opentable: 'OpenTable' } as const;
          const field = fieldMap[platform];
          const isSet = !!data[field];
          const isExpired = data.tokenExpired?.[platform] === true;
          const dotColor = isExpired ? 'var(--tag-red)' : isSet ? 'var(--tag-green)' : 'var(--text-muted)';
          const statusText = isExpired ? 'Expired' : isSet ? 'Connected' : 'Not connected';

          return (
            <FieldRow key={platform} label={`${labelMap[platform]} Token`} description={statusText}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <input
                  type="password"
                  style={inputStyle}
                  value={data[field] ?? ''}
                  onChange={(e) => setData((d) => ({ ...d, [field]: e.target.value || null }))}
                  placeholder="Paste token here"
                  autoComplete="off"
                />
              </div>
            </FieldRow>
          );
        })}
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

        <SignOutButton />
      </div>
    </div>
  );
}

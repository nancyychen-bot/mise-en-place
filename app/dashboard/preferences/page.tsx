'use client';

import { useState, useEffect } from 'react';
import type { UserSettings, DaysOfWeek } from '@/lib/types';
import { BtnPrimary, BtnSecondary } from '@/components/buttons';

const DEFAULTS: Omit<UserSettings, 'userId' | 'resyApiKey' | 'ntfyTopic' | 'ntfyPriority' | 'monitoringEnabled'> = {
  earliestTime: '18:00',
  latestTime: '20:00',
  dayRange: 7,
  daysOfWeek: 'all',
  checkIntervalMin: 5,
  activeHoursStart: '08:00',
  activeHoursEnd: '22:00',
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-serif)',
  fontWeight: 900,
  fontSize: '22px',
  paddingBottom: '12px',
  borderBottom: '2px solid var(--border)',
  marginBottom: '20px',
  marginTop: '40px',
};

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((data) => {
        if (data.earliestTime) {
          setPrefs({
            earliestTime: data.earliestTime,
            latestTime: data.latestTime,
            dayRange: data.dayRange,
            daysOfWeek: data.daysOfWeek,
            checkIntervalMin: data.checkIntervalMin,
            activeHoursStart: data.activeHoursStart,
            activeHoursEnd: data.activeHoursEnd,
            quietHoursStart: data.quietHoursStart,
            quietHoursEnd: data.quietHoursEnd,
          });
        }
      })
      .catch(() => {});
  }, []);

  function update<K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Save failed');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 40px 80px' }}>
      <form onSubmit={handleSave}>
        {/* Time Window */}
        <h2 style={sectionHeaderStyle}>Time Window</h2>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}
          className="max-[720px]:grid-cols-1"
        >
          <div>
            <label htmlFor="earliestTime" style={labelStyle}>Earliest Time</label>
            <input
              id="earliestTime"
              type="time"
              className="form-input"
              value={prefs.earliestTime}
              onChange={(e) => update('earliestTime', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="latestTime" style={labelStyle}>Latest Time</label>
            <input
              id="latestTime"
              type="time"
              className="form-input"
              value={prefs.latestTime}
              onChange={(e) => update('latestTime', e.target.value)}
            />
          </div>
        </div>

        {/* Day Range */}
        <h2 style={sectionHeaderStyle}>Day Range</h2>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}
          className="max-[720px]:grid-cols-1"
        >
          <div>
            <label htmlFor="dayRange" style={labelStyle}>How Many Days Ahead</label>
            <select
              id="dayRange"
              className="form-select"
              value={prefs.dayRange}
              onChange={(e) => update('dayRange', Number(e.target.value))}
            >
              {[1, 3, 7, 14, 30, 60].map((n) => (
                <option key={n} value={n}>{n} days</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="daysOfWeek" style={labelStyle}>Days of Week</label>
            <select
              id="daysOfWeek"
              className="form-select"
              value={prefs.daysOfWeek}
              onChange={(e) => update('daysOfWeek', e.target.value as DaysOfWeek)}
            >
              <option value="all">All days</option>
              <option value="weekdays">Weekdays only</option>
              <option value="weekends">Weekends only</option>
              <option value="sat">Saturdays only</option>
              <option value="fri-sun">Fri–Sun</option>
            </select>
          </div>
        </div>

        {/* Check Interval */}
        <h2 style={sectionHeaderStyle}>Check Interval</h2>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}
          className="max-[720px]:grid-cols-1"
        >
          <div>
            <label htmlFor="checkIntervalMin" style={labelStyle}>Check Every</label>
            <select
              id="checkIntervalMin"
              className="form-select"
              value={prefs.checkIntervalMin}
              onChange={(e) => update('checkIntervalMin', Number(e.target.value))}
            >
              {[5, 10, 15, 30, 60].map((n) => (
                <option key={n} value={n}>{n} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="activeHoursStart" style={labelStyle}>Active Hours Start</label>
            <input
              id="activeHoursStart"
              type="time"
              className="form-input"
              value={prefs.activeHoursStart}
              onChange={(e) => update('activeHoursStart', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="activeHoursEnd" style={labelStyle}>Active Hours End</label>
            <input
              id="activeHoursEnd"
              type="time"
              className="form-input"
              value={prefs.activeHoursEnd}
              onChange={(e) => update('activeHoursEnd', e.target.value)}
            />
          </div>
        </div>

        {/* Quiet Hours */}
        <h2 style={sectionHeaderStyle}>Notification Quiet Hours</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          No notifications will be sent during these hours. Supports midnight-spanning ranges
          (e.g. 22:00 – 07:00).
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}
          className="max-[720px]:grid-cols-1"
        >
          <div>
            <label htmlFor="quietHoursStart" style={labelStyle}>Quiet From</label>
            <input
              id="quietHoursStart"
              type="time"
              className="form-input"
              value={prefs.quietHoursStart}
              onChange={(e) => update('quietHoursStart', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="quietHoursEnd" style={labelStyle}>Quiet Until</label>
            <input
              id="quietHoursEnd"
              type="time"
              className="form-input"
              value={prefs.quietHoursEnd}
              onChange={(e) => update('quietHoursEnd', e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p
            style={{
              marginTop: '24px',
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

        <div
          style={{
            marginTop: '40px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <BtnSecondary
            type="button"
            onClick={() => setPrefs(DEFAULTS)}
          >
            Reset to Defaults
          </BtnSecondary>
          <BtnPrimary type="submit" disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Preferences'}
          </BtnPrimary>
        </div>
      </form>
    </div>
  );
}

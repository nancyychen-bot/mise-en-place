import Link from 'next/link';
import type { UserSettings } from '@/lib/types';

interface PreferencesBarProps {
  settings: Pick<
    UserSettings,
    'earliestTime' | 'latestTime' | 'dayRange' | 'daysOfWeek' | 'checkIntervalMin' | 'activeHoursStart' | 'activeHoursEnd' | 'ntfyTopic'
  >;
}

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${suffix}`;
}

const DAYS_LABEL: Record<string, string> = {
  all: 'All days',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  sat: 'Saturdays',
  'fri-sun': 'Fri–Sun',
};

export default function PreferencesBar({ settings }: PreferencesBarProps) {
  const {
    earliestTime, latestTime, dayRange, daysOfWeek,
    checkIntervalMin, activeHoursStart, activeHoursEnd, ntfyTopic
  } = settings;

  const prefs = [
    {
      label: 'Time Window',
      value: `${fmt12h(earliestTime)} – ${fmt12h(latestTime)}`,
    },
    {
      label: 'Day Range',
      value: `${dayRange} days · ${DAYS_LABEL[daysOfWeek] ?? daysOfWeek}`,
    },
    {
      label: 'Check Interval',
      value: `Every ${checkIntervalMin} min · ${fmt12h(activeHoursStart)}–${fmt12h(activeHoursEnd)}`,
    },
    {
      label: 'Notifications',
      value: ntfyTopic ? `ntfy: ${ntfyTopic}` : 'Not configured',
    },
  ];

  return (
    <div
      style={{
        border: '1px solid var(--border-light)',
        padding: '20px 24px',
        marginBottom: '32px',
        gap: '16px',
      }}
      className="grid grid-cols-2 min-[720px]:grid-cols-4"
    >
      {prefs.map(({ label, value }, i) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p
            style={{
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            {value}
          </p>
          {i === prefs.length - 1 && (
            <Link
              href="/dashboard/preferences"
              style={{
                fontSize: '11px',
                color: 'var(--tag-red)',
                marginTop: '2px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Edit →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

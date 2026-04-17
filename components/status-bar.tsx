import type { UserSettings } from '@/lib/types';

interface StatusBarProps {
  watchingCount: number;
  slotsFoundCount: number;
  settings: Pick<
    UserSettings,
    'earliestTime' | 'latestTime' | 'dayRange' | 'checkIntervalMin' | 'monitoringEnabled'
  >;
}

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${suffix}`;
}

interface DotProps {
  color: string;
  bordered?: boolean;
}

function Dot({ color, bordered }: DotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        border: bordered ? '1px solid #D4B835' : undefined,
      }}
    />
  );
}

export default function StatusBar({ watchingCount, slotsFoundCount, settings }: StatusBarProps) {
  const { earliestTime, latestTime, dayRange, checkIntervalMin, monitoringEnabled } = settings;

  const items = [
    { dot: <Dot color="var(--tag-green)" />, label: 'Watching', value: String(watchingCount) },
    { dot: <Dot color="var(--tag-orange)" />, label: 'Slots Found', value: String(slotsFoundCount) },
    {
      dot: <Dot color="var(--text-muted)" />,
      label: 'Window',
      value: `${fmt12h(earliestTime)}–${fmt12h(latestTime)}`,
    },
    { dot: <Dot color="var(--text-muted)" />, label: 'Range', value: `${dayRange} days` },
    { dot: <Dot color="var(--text-muted)" />, label: 'Every', value: `${checkIntervalMin} min` },
    {
      dot: <Dot color={monitoringEnabled ? 'var(--tag-green)' : 'var(--tag-red)'} />,
      label: 'Cost',
      value: '$0/mo',
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: '32px',
        padding: '12px 0',
        borderBottom: '1px solid var(--border-light)',
        fontSize: '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        fontWeight: 500,
        marginBottom: '40px',
        flexWrap: 'wrap',
      }}
    >
      {items.map(({ dot, label, value }) => (
        <div
          key={label}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {dot}
          <span>{label}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600, letterSpacing: '0.04em' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

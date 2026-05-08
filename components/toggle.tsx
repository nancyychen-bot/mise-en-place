'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

export default function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: '44px',
          height: '26px',
          borderRadius: '13px',
          border: checked ? '1px solid var(--tag-green)' : '1px solid var(--border)',
          background: checked ? 'var(--tag-green)' : 'var(--bg)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.2s',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: checked ? 'var(--bg)' : 'var(--text)',
            top: '3px',
            left: checked ? '22px' : '3px',
            transition: 'all 0.2s',
          }}
        />
      </button>
      {label && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: checked ? 'var(--tag-green)' : 'var(--text-muted)',
          }}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
      )}
    </div>
  );
}

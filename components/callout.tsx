import React from 'react';

type CalloutVariant = 'tip' | 'warn' | 'info';

interface CalloutProps {
  variant?: CalloutVariant;
  children: React.ReactNode;
}

const COLORS: Record<CalloutVariant, { border: string; bg: string }> = {
  tip: { border: 'var(--tag-green)', bg: 'var(--green-light)' },
  warn: { border: 'var(--tag-yellow)', bg: 'var(--yellow-light)' },
  info: { border: 'var(--tag-cyan)', bg: 'var(--bg-muted)' },
};

export default function Callout({ variant = 'info', children }: CalloutProps) {
  const { border, bg } = COLORS[variant];
  return (
    <div
      style={{
        background: bg,
        borderLeft: `3px solid ${border}`,
        padding: '14px 18px',
        margin: '16px 0',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  );
}

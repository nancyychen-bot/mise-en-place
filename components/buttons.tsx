import React from 'react';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  small?: boolean;
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: 'var(--font-family-sans)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  transition: 'all 0.15s',
  borderRadius: 0,
  outline: 'none',
};

export function BtnPrimary({ children, small, style, ...props }: BtnProps) {
  return (
    <button
      {...props}
      style={{
        ...baseStyle,
        padding: small ? '6px 12px' : '10px 18px',
        fontSize: small ? '10px' : '11px',
        background: 'var(--text)',
        color: 'var(--bg)',
        borderColor: 'var(--text)',
        ...style,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--bg)';
        el.style.color = 'var(--text)';
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--text)';
        el.style.color = 'var(--bg)';
        props.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({ children, small, style, ...props }: BtnProps) {
  return (
    <button
      {...props}
      style={{
        ...baseStyle,
        padding: small ? '6px 12px' : '10px 18px',
        fontSize: small ? '10px' : '11px',
        background: 'var(--bg)',
        color: 'var(--text)',
        borderColor: 'var(--border)',
        ...style,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--text)';
        el.style.color = 'var(--bg)';
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--bg)';
        el.style.color = 'var(--text)';
        props.onMouseLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}

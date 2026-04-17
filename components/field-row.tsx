import React from 'react';

interface FieldRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export default function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gap: '20px',
        padding: '16px 0',
        borderBottom: '1px solid var(--border-hair)',
        alignItems: 'start',
      }}
      className="max-[720px]:grid-cols-1"
    >
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
          {label}
        </p>
        {description && (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '4px',
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  );
}

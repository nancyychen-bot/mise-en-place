'use client';

import { useRouter } from 'next/navigation';

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        border: 'none',
        background: 'none',
        fontFamily: 'var(--font-family-sans)',
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }}
    >
      Sign Out
    </button>
  );
}

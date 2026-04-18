import type { Platform } from '@/lib/types';

interface PlatformTagProps {
  platform: Platform;
}

export default function PlatformTag({ platform }: PlatformTagProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--bg)',
        background: platform === 'resy' ? 'var(--tag-red)' : platform === 'opentable' ? 'var(--tag-blue)' : 'var(--tag-orange)',
        alignSelf: 'flex-start',
        marginBottom: '16px',
      }}
    >
      {platform === 'resy' ? 'Resy' : platform === 'opentable' ? 'OpenTable' : 'SevenRooms'}
    </span>
  );
}

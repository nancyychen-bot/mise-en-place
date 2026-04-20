import Link from 'next/link';
import Callout from '@/components/callout';

function StepNumber({ n }: { n: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        border: '2px solid var(--border)',
        fontFamily: 'var(--font-family-serif)',
        fontWeight: 900,
        fontSize: '18px',
        marginBottom: '16px',
        flexShrink: 0,
      }}
    >
      {n}
    </div>
  );
}

interface StepProps {
  number: number;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}

function Step({ number, eyebrow, title, children }: StepProps) {
  return (
    <div
      style={{
        marginBottom: '48px',
        paddingBottom: '48px',
        borderBottom: '1px solid var(--border-hair)',
      }}
    >
      <StepNumber n={number} />
      <p
        style={{
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--tag-red)',
          fontWeight: 700,
          marginBottom: '8px',
        }}
      >
        {eyebrow}
      </p>
      <h3
        style={{
          fontFamily: 'var(--font-family-serif)',
          fontWeight: 900,
          fontSize: '28px',
          letterSpacing: '-0.01em',
          marginBottom: '4px',
          lineHeight: 1.1,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

const descStyle: React.CSSProperties = {
  fontSize: '15px',
  color: 'var(--text-secondary)',
  lineHeight: 1.65,
  marginBottom: '20px',
  maxWidth: '640px',
};

export default function SetupPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 40px 80px' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid var(--border)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontWeight: 900,
            fontSize: '32px',
            letterSpacing: '-0.01em',
          }}
        >
          Setup Guide
        </h2>
        <span
          style={{
            fontSize: '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 500,
          }}
        >
          Est. 8 minutes · Free forever
        </span>
      </div>

      {/* Intro callout */}
      <div
        style={{
          borderLeft: '4px solid var(--tag-yellow)',
          padding: '16px 20px',
          background: 'var(--yellow-light)',
          marginBottom: '32px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontWeight: 700,
            fontSize: '18px',
            marginBottom: '6px',
          }}
        >
          Read this first!
        </p>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Mise en Place is free because <em>you</em> run the checks on your own computer (or a free
          cloud service). We&rsquo;ll walk you through every step, explaining what each thing does and
          why. No prior experience needed — just follow the instructions in order.
        </p>
      </div>

      {/* Step 1 */}
      <Step number={1} eyebrow="About 5 minutes" title="Set up push notifications with ntfy.sh">
        <p style={descStyle}>
          This is how your phone gets alerted when a reservation opens up. You pick a secret topic
          name, subscribe on your phone, and paste it here — that&rsquo;s it.
        </p>

        <Callout variant="tip">
          <strong>Why ntfy.sh?</strong> It&rsquo;s 100% free, no ads, no phone number or email
          required. Just a secret name for your channel.
        </Callout>

        <strong style={{ fontSize: '13px' }}>Do this:</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Install the ntfy app on your phone.</strong> Search for &ldquo;ntfy&rdquo; (N-T-F-Y)
            in the App Store or Google Play. It&rsquo;s free.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Tap &ldquo;Subscribe to topic&rdquo;</strong> and pick a secret name. Make it
            hard to guess — e.g.{' '}
            <code className="code">reso-nancy-x9k2-dinner</code>. Tap <strong>Subscribe</strong>.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Copy your topic name</strong>, then open the{' '}
            <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>
              Account
            </Link>{' '}
            tab and paste it into the Notifications field.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Click &ldquo;Save Changes,&rdquo;</strong> then{' '}
            <strong>&ldquo;Send Test Notification.&rdquo;</strong> Your phone should buzz within 5
            seconds.
          </li>
        </ol>
      </Step>

      {/* Step 2 */}
      <Step number={2} eyebrow="About 3 minutes" title="Add your first restaurant">
        <p style={descStyle}>
          Time for the fun part. Let&rsquo;s add a restaurant to your watchlist so Mise en Place knows
          what to watch. We support both <strong>Resy</strong> and <strong>OpenTable</strong>.
        </p>

        <strong style={{ fontSize: '13px' }}>For Resy:</strong>
        <ol style={{ margin: '16px 0 24px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Find the restaurant on Resy</strong> and copy its URL. Example:{' '}
            <code className="code">resy.com/cities/ny/venues/don-angie</code>
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Come back to Mise en Place</strong> and click the{' '}
            <Link href="/dashboard" style={{ textDecoration: 'underline' }}>
              Watchlist
            </Link>{' '}
            tab, then &ldquo;+ Add Restaurant.&rdquo;
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Paste the URL</strong> into the &ldquo;Venue ID or URL&rdquo; field — we&rsquo;ll
            extract the venue ID automatically.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Type the restaurant name, pick your party size, click Save.</strong>
          </li>
        </ol>

        <strong style={{ fontSize: '13px' }}>For OpenTable:</strong>
        <Callout variant="warn">
          OpenTable doesn&rsquo;t expose its venue ID in the URL — you need to find it in the page
          source. This takes about 60 seconds.
        </Callout>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Open the restaurant&rsquo;s OpenTable page</strong> in your browser.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>View the page source</strong> — press{' '}
            <code className="code">Cmd+U</code> (Mac) or{' '}
            <code className="code">Ctrl+U</code> (Windows), or right-click anywhere and choose
            &ldquo;View Page Source.&rdquo;
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Search for <code className="code">&quot;rid&quot;</code></strong> — press{' '}
            <code className="code">Cmd+F</code> / <code className="code">Ctrl+F</code> and type{' '}
            <code className="code">&quot;rid&quot;</code>. Look for a line like{' '}
            <code className="code">&ldquo;rid&rdquo;:12345</code>. That number is the venue ID.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Come back to Mise en Place</strong>, click &ldquo;+ Add Restaurant,&rdquo; select{' '}
            <strong>OpenTable</strong> as the platform, and paste the numeric ID into the
            &ldquo;Venue ID&rdquo; field.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Type the restaurant name, pick your party size, click Save.</strong>
          </li>
        </ol>

        <p style={{ ...descStyle, marginTop: '-4px' }}>Repeat for each restaurant you want to watch!</p>

        <Callout variant="tip">
          <strong>Pro tip:</strong> Hit the{' '}
          <Link href="/dashboard/preferences" style={{ textDecoration: 'underline' }}>
            Preferences
          </Link>{' '}
          tab next to set your time window (e.g. 6–8 PM), how many days ahead to check, and how often.
        </Callout>
      </Step>

      {/* Done */}
      <div style={{ marginBottom: '48px' }}>
        <Callout variant="tip">
          <strong>You&rsquo;re all set!</strong> Monitoring is already running — there&rsquo;s nothing
          else to turn on. Go cook something, or go for a walk. Your phone will buzz when a table opens
          up. You can pause monitoring anytime from the{' '}
          <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>
            Account
          </Link>{' '}
          page.
        </Callout>
      </div>
    </div>
  );
}

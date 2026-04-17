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
          Est. 15 minutes · Free forever
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
      <Step number={1} eyebrow="About 3 minutes" title="Set up push notifications with ntfy.sh">
        <p style={descStyle}>
          This is how your phone will get the alert when a reservation opens up. Think of it like a
          private channel that only you can see. When our program finds a slot, it sends a message to
          your channel, and your phone buzzes.
        </p>

        <Callout variant="tip">
          <strong>Why ntfy.sh?</strong> It&rsquo;s 100% free, there are no ads, and you don&rsquo;t
          need to give them your phone number or email. You just pick a secret name for your channel,
          tell your phone to listen for it, and you&rsquo;re done.
        </Callout>

        <strong style={{ fontSize: '13px' }}>Do this:</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Install the ntfy app on your phone.</strong> Search for &ldquo;ntfy&rdquo; (spelled
            N-T-F-Y) in the App Store or Google Play. The icon is a little speaker. Install it — it&rsquo;s
            free.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Open the app and tap &ldquo;Subscribe to topic.&rdquo;</strong> Now pick a secret
            name. This is like a password — if someone guesses it, they can send you notifications too,
            so make it weird. Good examples:{' '}
            <code className="code">reso-nancy-x9k2-dinner</code> or{' '}
            <code className="code">mise-nyc-secret-2026</code>. Bad examples:{' '}
            <code className="code">pizza</code> (too guessable).
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Tap &ldquo;Subscribe.&rdquo;</strong> The app is now listening for any messages sent
            to that name.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Copy your topic name.</strong> You&rsquo;ll paste it into Mise en Place in a moment.
            Write it down so you don&rsquo;t forget.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Test it!</strong> Come back to this page when you&rsquo;re ready. We&rsquo;ll send a
            test notification in a few steps.
          </li>
        </ol>
      </Step>

      {/* Step 2 */}
      <Step number={2} eyebrow="About 5 minutes" title="Get your Resy API key">
        <p style={descStyle}>
          Resy has a public API — basically, a &ldquo;phone line&rdquo; that their own website uses to
          check availability. We&rsquo;re going to borrow that same phone line. You need a small key
          that lets you make calls on it. It&rsquo;s free and Resy gives the same key to everyone who
          uses their site.
        </p>

        <Callout variant="info">
          <strong>Heads up:</strong> This part sounds scary but it&rsquo;s not. You&rsquo;re just
          copying one line of text from your browser&rsquo;s &ldquo;DevTools.&rdquo; Think of it like
          viewing the source code of a website — totally safe, nothing breaks.
        </Callout>

        <strong style={{ fontSize: '13px' }}>Do this:</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Open Google Chrome</strong> on your computer (not your phone). If you don&rsquo;t
            have Chrome, Safari or Firefox works too.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Go to resy.com</strong> and click on any restaurant — for example, search for
            &ldquo;Don Angie.&rdquo;
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Open DevTools.</strong> Right-click anywhere on the page and choose{' '}
            <em>&ldquo;Inspect.&rdquo;</em> A panel will pop up on the right or bottom of your browser.
            Don&rsquo;t worry — nothing is broken.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Click the &ldquo;Network&rdquo; tab</strong> at the top of the panel.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Refresh the page</strong> (Cmd+R on Mac, Ctrl+R on Windows). You&rsquo;ll see a
            waterfall of tiny rows appear.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>
              Type &ldquo;find&rdquo; in the Filter box
            </strong>{' '}
            (usually at the top of the Network panel). You should see rows that start with{' '}
            <code className="code">find?</code>.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Click on one of those rows.</strong> A new sub-panel opens. Scroll down until you
            see <em>&ldquo;Request Headers.&rdquo;</em>
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>
              Find the line that starts with <code className="code">Authorization:</code>
            </strong>{' '}
            It looks like:{' '}
            <code className="code">ResyAPI api_key=&ldquo;AIcdK2rLXG6TYwJseSbmrBAy3RP81ocd&rdquo;</code>
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Copy everything inside the quotation marks</strong> — that&rsquo;s your API key.
            It&rsquo;s about 30 characters long.
          </li>
        </ol>

        <Callout variant="warn">
          <strong>Can&rsquo;t find it?</strong> Try a different restaurant page or refresh and look
          again. Sometimes Safari hides things — Chrome is most reliable for this step.
        </Callout>
      </Step>

      {/* Step 3 */}
      <Step number={3} eyebrow="About 2 minutes" title="Paste your keys into your Account">
        <p style={descStyle}>
          Now we&rsquo;ll store the two things you just got — your ntfy topic name and your Resy API
          key — so Mise en Place can use them.
        </p>

        <strong style={{ fontSize: '13px' }}>Do this:</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>
              Click the{' '}
              <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>
                Account
              </Link>{' '}
              tab
            </strong>{' '}
            at the top of this page.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Paste your Resy API key</strong> into the Resy API Key field.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Paste your ntfy topic</strong> into the Notifications field. It should be just the
            name, like <code className="code">reso-nancy-x9k2-dinner</code> — no https:// in front.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Click &ldquo;Save Changes.&rdquo;</strong>
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Click &ldquo;Send Test Notification.&rdquo;</strong> Your phone should buzz within
            5 seconds with a test message. If it does — you&rsquo;re all set!
          </li>
        </ol>
      </Step>

      {/* Step 4 */}
      <Step number={4} eyebrow="About 3 minutes" title="Add your first restaurant">
        <p style={descStyle}>
          Time for the fun part. Let&rsquo;s add a restaurant to your watchlist so Mise en Place knows
          what to watch.
        </p>

        <strong style={{ fontSize: '13px' }}>Do this:</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Go back to resy.com</strong> and find a restaurant you want to watch.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Copy the URL</strong> from your browser&rsquo;s address bar. It&rsquo;ll look
            like: <code className="code">resy.com/cities/ny/venues/don-angie</code>
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Come back to Mise en Place</strong> and click the{' '}
            <Link href="/dashboard" style={{ textDecoration: 'underline' }}>
              Watchlist
            </Link>{' '}
            tab, then &ldquo;+ Add Restaurant.&rdquo;
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Paste the URL</strong> into the &ldquo;Venue ID or URL&rdquo; field. Don&rsquo;t
            worry about the venue ID number — we&rsquo;ll figure it out from the URL.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Type the restaurant name, pick your party size, click Save.</strong>
          </li>
          <li style={{ marginBottom: '8px' }}>Repeat for each restaurant you want to watch!</li>
        </ol>

        <Callout variant="tip">
          <strong>Pro tip:</strong> Hit the{' '}
          <Link href="/dashboard/preferences" style={{ textDecoration: 'underline' }}>
            Preferences
          </Link>{' '}
          tab next to set your time window (e.g. 6–8 PM), how many days ahead to check, and how often.
        </Callout>
      </Step>

      {/* Step 5 */}
      <Step number={5} eyebrow="About 2 minutes" title="Turn it on">
        <p style={descStyle}>
          Your watchlist is set up — now let&rsquo;s actually start the monitoring. You have two
          options, from easiest to nerdiest.
        </p>

        <strong style={{ fontSize: '13px' }}>Option A — Easy (hosted, recommended):</strong>
        <ol style={{ margin: '16px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
          <li style={{ marginBottom: '8px' }}>
            On your{' '}
            <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>
              Account
            </Link>{' '}
            page, flip the &ldquo;Monitoring&rdquo; switch to ON.
          </li>
          <li style={{ marginBottom: '8px' }}>
            That&rsquo;s it. Our hosted service runs your checks on a schedule. You can close this
            browser tab and your phone will still buzz when a slot opens.
          </li>
        </ol>

        <strong style={{ fontSize: '13px' }}>Option B — Nerdy (run it yourself):</strong>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          If you&rsquo;d rather run the checker on your own laptop (e.g., for full control), clone
          the repo and run it locally:
        </p>
        <pre className="code-block">{`git clone https://github.com/mise-en-place/checker
cd checker
npm install
cp .env.example .env
# paste your keys into .env
npm start`}</pre>

        <Callout variant="tip">
          <strong>You&rsquo;re done!</strong> Go cook something, or go for a walk. Your phone will
          buzz when Don Angie has a 7 PM table.
        </Callout>
      </Step>
    </div>
  );
}

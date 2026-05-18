import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function handler() {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 });
  }

  const workflows = ['resy-checker.yml', 'opentable-checker.yml'];
  const results: Record<string, number> = {};

  await Promise.all(
    workflows.map(async (workflow) => {
      const res = await fetch(
        `https://api.github.com/repos/nancyychen-bot/mise-en-place/actions/workflows/${workflow}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      results[workflow] = res.status;
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => '');
        console.error(`[dispatch-checkers] ${workflow} failed: ${res.status} ${text}`);
      }
    })
  );

  return NextResponse.json({ dispatched: results });
}

export { handler as GET, handler as POST, handler as HEAD };

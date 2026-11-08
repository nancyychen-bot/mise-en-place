import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { ResolvedVenue, SearchRequest, RawEntry } from '@/lib/search/types';
import { classifyInput } from '@/lib/search/classify';
import { scrapeListicle } from '@/lib/search/scrape-listicle';
import { resolveVenue } from '@/lib/search/resolve-venue';
import { checkAvailability } from '@/lib/search/check-availability';
import { runPool } from '@/lib/search/concurrency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENCY = 5;

function sseEncode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: SearchRequest;
  try {
    body = await req.json() as SearchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.input?.trim()) return NextResponse.json({ error: 'input is required' }, { status: 400 });
  if (!body.date) return NextResponse.json({ error: 'date is required' }, { status: 400 });
  if (!body.windowStart || !body.windowEnd) return NextResponse.json({ error: 'windowStart and windowEnd are required' }, { status: 400 });
  if (!body.partySize || body.partySize < 1 || body.partySize > 20) {
    return NextResponse.json({ error: 'partySize must be 1..20' }, { status: 400 });
  }

  const { data: settings } = await db
    .from('user_settings')
    .select('resy_api_key')
    .eq('user_id', user.id)
    .single();
  const resyApiKey = (settings?.resy_api_key as string | null) ?? '';

  const classified = classifyInput(body.input);
  let rawEntries: RawEntry[] = classified.entries;

  if (classified.kind === 'article-url' && rawEntries[0]?.hintUrl) {
    try {
      const scraped = await scrapeListicle(rawEntries[0].hintUrl);
      if (scraped.length === 0) {
        return NextResponse.json({ error: "Couldn't find restaurants in that URL — try pasting names directly." }, { status: 400 });
      }
      rawEntries = scraped;
    } catch (err) {
      return NextResponse.json({ error: `Article fetch failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const venues: ResolvedVenue[] = await runPool(rawEntries, CONCURRENCY, (e) =>
          resolveVenue(e, { city: body.city, resyApiKey })
        );

        controller.enqueue(sseEncode('resolved', { venues }));

        await runPool(venues, CONCURRENCY, async (venue) => {
          const result = await checkAvailability(venue, {
            date: body.date,
            windowStart: body.windowStart,
            windowEnd: body.windowEnd,
            partySize: body.partySize,
            resyApiKey,
          });
          controller.enqueue(sseEncode('result', { id: venue.id, result }));
          return result;
        });

        controller.enqueue(sseEncode('done', {}));
      } catch (err) {
        controller.enqueue(
          sseEncode('error', { message: err instanceof Error ? err.message : String(err) })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

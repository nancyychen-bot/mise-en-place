'use client';

import { useState, useRef } from 'react';
import type { ResolvedVenue, AvailabilityResult, SseEvent } from '@/lib/search/types';

type RowState = {
  venue: ResolvedVenue;
  result?: AvailabilityResult;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SearchClient() {
  const [input, setInput] = useState('');
  const [date, setDate] = useState(todayIso());
  const [windowStart, setWindowStart] = useState('19:00');
  const [windowEnd, setWindowEnd] = useState('21:00');
  const [partySize, setPartySize] = useState(2);
  const [city, setCity] = useState('New York');
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRows([]);
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, date, windowStart, windowEnd, partySize, city }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        let message = text || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j?.error) message = j.error;
        } catch { /* keep text as-is */ }
        throw new Error(message);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = raw.split('\n');
          let eventName = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            if (line.startsWith('data: ')) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine);
          const evt = { event: eventName, data: parsed } as SseEvent;
          if (evt.event === 'resolved') {
            setRows(evt.data.venues.map((v) => ({ venue: v })));
          } else if (evt.event === 'result') {
            setRows((prev) =>
              prev.map((r) => r.venue.id === evt.data.id ? { ...r, result: evt.data.result } : r)
            );
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }

  const checked = rows.filter((r) => r.result).length;
  const available = rows.filter((r) => r.result?.status === 'available').length;

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-4 mb-8">
        <label className="block">
          <span className="text-sm font-medium">URL, article, or list</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            required
            className="mt-1 w-full border rounded p-2 font-mono text-sm"
            placeholder="https://www.theinfatuation.com/new-york/guides/..."
          />
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">From</span>
            <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">To</span>
            <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Party</span>
            <input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 2)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">City</span>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">{error}</div>}

      {rows.length > 0 && (
        <>
          <div className="text-sm text-neutral-600 mb-2">
            Checked {checked}/{rows.length} — {available} available.
          </div>
          <table className="w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2">Restaurant</th>
                <th className="py-2">Provider</th>
                <th className="py-2">Status</th>
                <th className="py-2">Slots</th>
                <th className="py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ResultRow key={r.venue.id} row={r} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ResultRow({ row }: { row: RowState }) {
  const { venue } = row;
  return (
    <tr className="border-b align-top">
      <td className="py-2 pr-2">{venue.displayName}</td>
      <td className="py-2 pr-2 text-neutral-500">{venue.provider ?? '—'}</td>
      <td className="py-2 pr-2">{renderStatus(row)}</td>
      <td className="py-2 pr-2">{renderSlots(row)}</td>
      <td className="py-2">{renderLink(row)}</td>
    </tr>
  );
}

function renderStatus(row: RowState) {
  if (!row.result) return <span className="text-neutral-500">checking…</span>;
  switch (row.result.status) {
    case 'available': return <span className="text-green-700 font-medium">Available</span>;
    case 'unavailable': return <span className="text-neutral-500">No tables</span>;
    case 'error': return <span className="text-yellow-700" title={row.result.message}>Check failed</span>;
    case 'unsupported': return <span className="text-neutral-500">Couldn&apos;t resolve</span>;
  }
}

function renderSlots(row: RowState) {
  if (row.result?.status !== 'available') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {row.result.slots.map((s) => (
        <a key={s.time} href={s.bookingUrl} target="_blank" rel="noopener noreferrer"
           className="px-2 py-0.5 bg-green-50 border border-green-200 rounded text-green-800 hover:bg-green-100">
          {s.time}
        </a>
      ))}
    </div>
  );
}

function renderLink(row: RowState) {
  const { venue, result } = row;
  if (venue.bookingUrl) {
    return <a href={venue.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open</a>;
  }
  if (result?.status === 'unsupported' || !venue.provider) {
    const q = encodeURIComponent(`${venue.displayName} reservations`);
    return <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Search</a>;
  }
  return null;
}

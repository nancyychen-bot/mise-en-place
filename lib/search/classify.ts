import type { RawEntry } from './types';

const PROVIDER_HOSTS = ['resy.com', 'opentable.com', 'sevenrooms.com'];

function isUrl(line: string): boolean {
  try {
    const u = new URL(line);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function isProviderUrl(url: string): boolean {
  const h = hostOf(url);
  return PROVIDER_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
    return seg.replace(/[-_]+/g, ' ');
  } catch {
    return url;
  }
}

export interface ClassifyResult {
  kind: 'single-url' | 'article-url' | 'list';
  entries: RawEntry[];
}

export function classifyInput(raw: string): ClassifyResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length === 1) {
    const only = lines[0];
    if (isUrl(only)) {
      if (isProviderUrl(only)) {
        return { kind: 'single-url', entries: [{ displayName: nameFromUrl(only), hintUrl: only }] };
      }
      return { kind: 'article-url', entries: [{ displayName: hostOf(only), hintUrl: only }] };
    }
    return { kind: 'list', entries: [{ displayName: only }] };
  }

  const entries: RawEntry[] = lines.map((line) =>
    isUrl(line)
      ? { displayName: nameFromUrl(line), hintUrl: line }
      : { displayName: line }
  );
  return { kind: 'list', entries };
}

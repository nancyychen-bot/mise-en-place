function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Token-set ratio inspired by rapidfuzz/fuzzywuzzy.
 *
 * Builds three virtual token groups — the intersection, the intersection
 * plus a's extras, and the intersection plus b's extras — and returns
 * the best pairwise similarity among them. A string that is a strict
 * subset of another (e.g. "Via Carota" vs "Via Carota NYC") scores 1.
 *
 * Returns 0..1. Order-, case-, and punctuation-insensitive.
 */
export function tokenSetRatio(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersectSize = 0;
  for (const t of ta) if (tb.has(t)) intersectSize++;

  const sizeInter = intersectSize;
  const sizeT1 = ta.size; // intersection + a-only
  const sizeT2 = tb.size; // intersection + b-only

  // Pairwise similarity: shared / max(size_x, size_y). The three groups
  // share `sizeInter` tokens with each other (and t1/t2 share exactly
  // `sizeInter` because the a-only and b-only sets are disjoint).
  const candidates = [
    similarity(sizeInter, sizeInter, sizeInter), // inter vs inter -> 1 when inter>0
    similarity(sizeInter, sizeInter, sizeT1), // inter vs t1
    similarity(sizeInter, sizeInter, sizeT2), // inter vs t2
    similarity(sizeInter, sizeT1, sizeT2), // t1 vs t2
  ];
  return Math.max(...candidates);
}

function similarity(shared: number, xSize: number, ySize: number): number {
  const denom = Math.max(xSize, ySize);
  if (denom === 0) return 0;
  return shared / denom;
}

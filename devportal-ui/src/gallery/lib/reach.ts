export type ReachBucket = 'poc' | 'lt10' | '10' | '100' | '1000';

/** Chart/display order. */
export const REACH_BUCKETS: readonly ReachBucket[] = ['poc', 'lt10', '10', '100', '1000'];

const LABELS: Record<ReachBucket, string> = {
  poc: 'Proof of concept',
  lt10: 'Fewer than 10 users',
  '10': 'About 10 users',
  '100': 'About 100 users',
  '1000': '1,000+ users',
};

/** Short labels for chart axes. */
export const REACH_SHORT_LABELS: Record<ReachBucket, string> = {
  poc: 'Proof of concept',
  lt10: 'Under 10',
  '10': 'About 10',
  '100': 'About 100',
  '1000': '1,000+',
};

function bucketForCount(n: number): ReachBucket {
  if (n < 10) return 'lt10';
  if (n < 100) return '10';
  if (n < 1000) return '100';
  return '1000';
}

/** Free-text self-reported reach to a bucket. Blank, "None" and unparseable give null. */
export function parseReach(raw: string | null | undefined): ReachBucket | null {
  const text = raw?.trim();
  if (!text) return null;
  if (/proof of concept/i.test(text)) return 'poc';
  const match = /(\d[\d,]*)/.exec(text);
  if (!match?.[1]) return null;
  const n = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(n)) return null;
  // "<10" means strictly fewer than 10, so judge it by the largest possible value.
  return bucketForCount(/^\s*</.test(text) ? n - 1 : n);
}

export function formatReach(bucket: ReachBucket): string {
  return LABELS[bucket];
}

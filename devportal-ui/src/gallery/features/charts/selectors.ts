import { EXPERIENCE_LEVELS, type ExperienceLevel } from '../../lib/experience';
import { resourceGroup, type ResourceGroup } from '../../lib/endpoints';
import type { Project } from '../../lib/project';
import { REACH_BUCKETS, type ReachBucket } from '../../lib/reach';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Month {
  year: number;
  /** 0-11 */
  monthIndex: number;
}

export interface CountRow {
  label: string;
  count: number;
}

const monthKey = ({ year, monthIndex }: Month) => year * 12 + monthIndex;
const fromKey = (key: number): Month => ({ year: Math.floor(key / 12), monthIndex: key % 12 });

export function monthLabel({ year, monthIndex }: Month): string {
  return `${MONTH_ABBR[monthIndex]} ${year}`;
}

function submissionMonth(p: Project): Month | null {
  return p.submittedAt ? { year: p.submittedAt.getUTCFullYear(), monthIndex: p.submittedAt.getUTCMonth() } : null;
}

/** The month before today (UTC): the most recent month that is fully over. */
export function mostRecentCompletedMonth(now: Date): Month {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

function monthRange(start: Month, end: Month): Month[] {
  const out: Month[] = [];
  for (let k = monthKey(start); k <= monthKey(end); k++) out.push(fromKey(k));
  return out;
}

function topCounts(counts: Map<string, number>, limit: number): CountRow[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// 1. Submissions by year ----------------------------------------------------

export interface YearRow {
  year: number;
  count: number;
}
export interface SubmissionsByYear {
  rows: YearRow[];
  /** All visible projects, dated or not. */
  total: number;
  undated: number;
}

export function submissionsByYear(projects: readonly Project[], now: Date): SubmissionsByYear {
  const counts = new Map<number, number>();
  let undated = 0;
  for (const p of projects) {
    if (!p.submittedAt) {
      undated++;
      continue;
    }
    const year = p.submittedAt.getUTCFullYear();
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const last = now.getUTCFullYear();
  const first = counts.size > 0 ? Math.min(...counts.keys()) : last;
  const rows: YearRow[] = [];
  for (let year = first; year <= last; year++) rows.push({ year, count: counts.get(year) ?? 0 });
  return { rows, total: projects.length, undated };
}

// 2. Projects over time -----------------------------------------------------

export interface CumulativeRow {
  year: number;
  total: number;
}

export function cumulativeByYear(projects: readonly Project[], now: Date): CumulativeRow[] {
  let running = 0;
  return submissionsByYear(projects, now).rows.map(({ year, count }) => {
    running += count;
    return { year, total: running };
  });
}

// 3. Experience by month ----------------------------------------------------

export type ExperienceRow = { month: string } & Record<ExperienceLevel, number> & { total: number };

export interface ExperienceTrend {
  rows: ExperienceRow[];
  /** Dated projects with a known experience level. */
  n: number;
}

export function experienceByMonth(projects: readonly Project[], now: Date): ExperienceTrend {
  const entries = projects.flatMap((p) => {
    const month = submissionMonth(p);
    return month && p.experience ? [{ month, level: p.experience }] : [];
  });
  if (entries.length === 0) return { rows: [], n: 0 };
  const start = Math.min(...entries.map((e) => monthKey(e.month)));
  const end = monthKey(mostRecentCompletedMonth(now));
  const rows = new Map<number, ExperienceRow>();
  for (let k = start; k <= end; k++) {
    const row = { month: monthLabel(fromKey(k)), total: 0 } as ExperienceRow;
    for (const level of EXPERIENCE_LEVELS) row[level] = 0;
    rows.set(k, row);
  }
  let n = 0;
  for (const { month, level } of entries) {
    const row = rows.get(monthKey(month));
    if (!row) continue; // after the last completed month
    row[level]++;
    row.total++;
    n++;
  }
  return { rows: [...rows.values()], n };
}

// 4. Vibe-coded by month ----------------------------------------------------

export interface VibeRow {
  month: string;
  vibe: number;
  notVibe: number;
  total: number;
}

export function vibeCodedByMonth(projects: readonly Project[], now: Date): VibeRow[] {
  const end = monthKey(mostRecentCompletedMonth(now));
  const rows = new Map<number, VibeRow>();
  for (const month of monthRange(fromKey(end - 11), fromKey(end))) {
    rows.set(monthKey(month), { month: monthLabel(month), vibe: 0, notVibe: 0, total: 0 });
  }
  for (const p of projects) {
    const month = submissionMonth(p);
    const row = month ? rows.get(monthKey(month)) : undefined;
    if (!row) continue;
    if (p.vibeCoded) row.vibe++;
    else row.notVibe++;
    row.total++;
  }
  return [...rows.values()];
}

// 5. Projects by tag --------------------------------------------------------

export interface TagCounts {
  rows: CountRow[];
  /** Projects tagged with the language tag that is hidden from the chart. */
  englishCount: number;
}

const ENGLISH = 'English';

export function topTags(projects: readonly Project[], limit = 10): TagCounts {
  const counts = new Map<string, number>();
  let englishCount = 0;
  for (const p of projects) {
    // Language tags are separate on a Project but were always tags on this chart.
    for (const tag of [...p.languages, ...p.topics]) {
      if (tag === ENGLISH) englishCount++;
      else increment(counts, tag);
    }
  }
  return { rows: topCounts(counts, limit), englishCount };
}

// 6. Sefaria resources used -------------------------------------------------

export function resourcesUsed(projects: readonly Project[]): CountRow[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const groups = new Set<ResourceGroup>();
    for (const resource of p.resources) {
      const group = resourceGroup(resource);
      if (group) groups.add(group);
    }
    for (const group of groups) increment(counts, group);
  }
  return topCounts(counts, Number.POSITIVE_INFINITY);
}

// 7. Built with -------------------------------------------------------------

export interface TechCounts {
  rows: CountRow[];
  /** Projects that described their stack at all. */
  n: number;
}

export function builtWith(projects: readonly Project[], limit = 8): TechCounts {
  const counts = new Map<string, number>();
  let n = 0;
  for (const p of projects) {
    if (!p.builtWith) continue;
    n++;
    for (const tech of new Set(p.techMentions)) increment(counts, tech);
  }
  return { rows: topCounts(counts, limit), n };
}

// 8. Reported reach ---------------------------------------------------------

export interface ReachCounts {
  rows: Array<{ bucket: ReachBucket; count: number }>;
  reported: number;
  total: number;
}

export function reachBuckets(projects: readonly Project[]): ReachCounts {
  const counts = new Map<ReachBucket, number>();
  let reported = 0;
  for (const p of projects) {
    if (!p.reach) continue;
    reported++;
    counts.set(p.reach, (counts.get(p.reach) ?? 0) + 1);
  }
  return {
    rows: REACH_BUCKETS.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 })),
    reported,
    total: projects.length,
  };
}

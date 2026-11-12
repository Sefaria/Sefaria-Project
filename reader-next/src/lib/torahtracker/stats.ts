/**
 * Torah Tracker (`/torahtracker`, the old UserStats.jsx; reader/views.py user_stats, `@login_required`): what the reader read in the
 * last year and of all time, beside the average reader.
 *
 *  - `GET /api/user_stats/<uid>` (user_stats_api: the reader themself, or anyone for a moderator): `{name, …, currently: {…},
 *    alltime: {…}}`, each period with `textsRead`, `categoriesRead` (top category → count) and `mostViewedRefs`.
 *  - `GET /api/site_stats` (site_stats_api, `@login_required`): `{currently: {categoriesRead}, alltime: {categoriesRead}}`.
 *
 * The charts were drawn with d3 5; the geometry is ported here (d3's pie and arc, a band and a "nice" linear scale) so the shapes and
 * label positions are the old ones without the library.
 *
 * @feature PRO-010 Torah Tracker user stats
 */
import { queryOptions } from "@tanstack/react-query";
import { sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";

export type StatsMode = "currently" | "alltime";
/** The old mode buttons, in order: "Previous Year" is the API's `currently`. */
export const STATS_MODES: readonly { key: StatsMode; en: string; he: string }[] = [
  { key: "currently", en: "Previous Year", he: "לשנה האחרונה" },
  { key: "alltime", en: "All Time", he: "כל הזמן" },
];

export interface ViewedRef {
  en: string;
  he: string;
  book: string;
}

export interface UserPeriodStats {
  textsRead: number;
  sheetsRead?: number;
  categoriesRead: Record<string, number>;
  mostViewedRefs: ViewedRef[];
}

export interface UserStats {
  uid?: number;
  name?: string;
  currently?: UserPeriodStats;
  alltime?: UserPeriodStats;
}

export interface SiteStats {
  currently?: { categoriesRead: Record<string, number> };
  alltime?: { categoriesRead: Record<string, number> };
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const r = await fetch(sameOrigin(path), { credentials: "same-origin", signal, headers: { accept: "application/json" } });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

export const userStatsQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "torahtracker", uid] as const,
    queryFn: ({ signal }) => getJson<UserStats>(`/api/user_stats/${uid}`, signal),
    enabled: uid !== null,
    staleTime: 0,
    gcTime: POLICIES.user.gcTime,
  });

export const siteStatsQuery = () =>
  queryOptions({
    queryKey: ["user", "site-stats"] as const,
    queryFn: ({ signal }) => getJson<SiteStats>("/api/site_stats", signal),
    staleTime: 0,
    gcTime: POLICIES.user.gcTime,
  });

/**
 * Both answers are in (the old `all_ready`): the reader's record has its uid and the site's its all-time numbers. Then a period's
 * data and whether the reader was active in it (more than two texts read); an inactive reader sees the site's numbers instead.
 */
export function statsView(user: UserStats | null | undefined, site: SiteStats | null | undefined, mode: StatsMode) {
  if (!user?.uid || !site?.alltime) return null;
  const mine = user[mode];
  const theirs = site[mode];
  if (!mine || !theirs) return null;
  return { user: mine, site: theirs, active: mine.textsRead > 2 };
}

/** Each category's share of the whole. */
export function toShares(data: Record<string, number>): Record<string, number> {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v / total]));
}

/** Categories under 4% of the total gathered into "Etc" (always added, even when empty), as the old donut did. */
export function withOther(data: readonly { name: string; value: number }[]): { name: string; value: number }[] {
  const total = data.reduce((a, e) => a + e.value, 0);
  const bar = total * 0.04;
  const rest = data.filter((e) => e.value < bar).reduce((a, e) => a + e.value, 0);
  return [...data.filter((e) => e.value >= bar), { name: "Etc", value: rest }];
}

export interface DonutSlice {
  name: string;
  value: number;
  startAngle: number;
  endAngle: number;
}

/**
 * d3.pie() with the old comparator (largest first, "Etc" last), from 12 o'clock clockwise, no padding. Like d3, a slice keeps the
 * data's order in the result; only the angles follow the sort.
 */
export function donutSlices(cats: Record<string, number>): DonutSlice[] {
  const raw = Object.entries(cats).map(([name, value]) => ({ name, value }));
  const data = raw.length > 2 ? withOther(raw) : raw;
  const total = data.reduce((a, e) => a + e.value, 0);
  const order = data.map((_, i) => i).sort((a, b) => (data[a]!.name === "Etc" ? 1 : data[b]!.name === "Etc" ? -1 : data[b]!.value - data[a]!.value));
  const k = total ? (2 * Math.PI) / total : 0;
  const out: DonutSlice[] = data.map((d) => ({ ...d, startAngle: 0, endAngle: 0 }));
  let a = 0;
  for (const i of order) {
    const end = a + data[i]!.value * k;
    out[i] = { ...data[i]!, startAngle: a, endAngle: end };
    a = end;
  }
  return out;
}

const fmt = (n: number) => Number(n.toFixed(6)).toString();
/** d3.arc() for an annulus sector: the path from the outer start clockwise, back along the inner edge. */
export function arcPath(inner: number, outer: number, start: number, end: number): string {
  const span = end - start;
  const pt = (r: number, a: number) => `${fmt(r * Math.sin(a))},${fmt(-r * Math.cos(a))}`;
  // an empty slice: d3 draws a line across the ring (its white stroke shows as a hairline)
  if (span <= 1e-12) return `M${pt(outer, start)}L${pt(inner, start)}Z`;
  if (span >= 2 * Math.PI - 1e-6) {
    // a whole ring: two half circles out, two back in
    const mid = start + Math.PI;
    return `M${pt(outer, start)}A${outer},${outer},0,1,1,${pt(outer, mid)}A${outer},${outer},0,1,1,${pt(outer, start)}M${pt(inner, start)}A${inner},${inner},0,1,0,${pt(inner, mid)}A${inner},${inner},0,1,0,${pt(inner, start)}Z`;
  }
  const large = span >= Math.PI ? 1 : 0;
  return `M${pt(outer, start)}A${outer},${outer},0,${large},1,${pt(outer, end)}L${pt(inner, end)}A${inner},${inner},0,${large},0,${pt(inner, start)}Z`;
}

/** d3.arc().centroid(): the middle of the sector, at the middle radius. */
export function arcCentroid(inner: number, outer: number, start: number, end: number): [number, number] {
  const r = (inner + outer) / 2;
  const a = (start + end) / 2 - Math.PI / 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** d3's tickIncrement (count 10), used by linear.nice(). */
function tickIncrement(start: number, stop: number, count: number): number {
  const e10 = Math.sqrt(50), e5 = Math.sqrt(10), e2 = Math.sqrt(2);
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log(step) / Math.LN10);
  const error = step / Math.pow(10, power);
  return power >= 0
    ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
    : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
}

/** d3.scaleLinear().domain([0, max]).nice(): the domain's end pushed out to a round step (d3 5's nice, ten ticks). */
export function niceMax(max: number, count = 10): number {
  let start = 0, stop = max, step: number;
  step = tickIncrement(start, stop, count);
  if (step > 0) {
    start = Math.floor(start / step) * step;
    stop = Math.ceil(stop / step) * step;
    step = tickIncrement(start, stop, count);
  } else if (step < 0) {
    start = Math.ceil(start * step) / step;
    stop = Math.floor(stop * step) / step;
    step = tickIncrement(start, stop, count);
  }
  if (step > 0) stop = Math.ceil(stop / step) * step;
  else if (step < 0) stop = Math.floor(stop * step) / step;
  return stop;
}

export interface CategoryBar {
  cat: string;
  /** Top of the bar group (d3.scaleBand().rangeRound, inner padding 0.1). */
  y: number;
  /** Widths of the reader's thin bar and the site's thick one (d3 rangeRound to [0, width]). */
  user: number;
  site: number;
}

/** The old CategoryBars' geometry: the reader's five most-read categories, their share and the average reader's share. */
export const BARS = { width: 660, perBar: 75, maxCats: 5, top: 20, belowText: 10, userBar: 5, siteBar: 34, gap: 0.05 } as const;

export function categoryBars(userCats: Record<string, number>, siteCats: Record<string, number>): { height: number; bars: CategoryBar[] } {
  const height = BARS.top + BARS.perBar * Math.min(Object.keys(userCats).length, BARS.maxCats);
  const mine = toShares(userCats);
  const theirs = toShares(siteCats);
  const cats = Object.entries(userCats)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, BARS.maxCats);
  const rows = cats.map((cat) => ({ cat, user: mine[cat] ?? 0, site: theirs[cat] ?? 0 }));
  const max = Math.max(...rows.flatMap((r) => [r.site, r.user]));
  const domainEnd = niceMax(max + 0.1);
  const x = (v: number) => Math.round((v / domainEnd) * BARS.width);
  // d3.scaleBand().domain(cats).rangeRound([top, height]).paddingInner(0.1), align 0.5, paddingOuter 0
  const n = rows.length;
  const step = Math.floor((height - BARS.top) / Math.max(1, n - 0.1));
  const start = Math.round(BARS.top + (height - BARS.top - step * (n - 0.1)) * 0.5);
  return { height, bars: rows.map((r, i) => ({ cat: r.cat, y: start + step * i, user: x(r.user), site: x(r.site) })) };
}

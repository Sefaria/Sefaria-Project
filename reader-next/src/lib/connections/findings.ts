/**
 * Findings: what learners saved after running a skill (a packaged method of study) in the Library Assistant, each anchored to the
 * passages it is about. Read from the assistant's server, `GET <assistant apiBaseUrl>/findings/ref/<section ref>` (public, no
 * credentials), one request per section; the selected segments' findings are picked out here by their anchor refs, as the web pages'
 * are by anchorRefExpanded. Memory only (the connections class).
 *
 * The chat service is another team's server: a slow, failed or malformed answer must never break the sidebar, so the request has a
 * short timeout, is not retried, and the reader treats a failure as "no findings". Every field is checked before it is shown, and a
 * link is kept only when it is http(s).
 *
 * @feature CON-073 Findings anchored to this text
 * @feature CON-074 Finding list items
 */
import { queryOptions } from "@tanstack/react-query";
import { withPolicy } from "~/lib/cache/query-options";
import { PUBLIC_CONFIG } from "~/lib/config";

export type FindingRole = "anchor" | "position" | "support";

export interface FindingMethod {
  slug: string;
  title: { en: string; he: string };
}

export interface Finding {
  id: string;
  /** The finding's own page on the assistant's site. */
  url: string | null;
  method: FindingMethod;
  skill: { name: string; title: string } | null;
  title: string;
  conclusion: string;
  /** The attribution shown with every finding ("AI-assisted reading in the approach of …"). */
  label: string;
  /** The segments of the requested ref the finding is anchored to (its anchor and position refs). */
  anchorRefs: string[];
  refs: { ref: string; role: FindingRole }[];
  /** The source sheet saved with the finding. */
  sheetUrl: string | null;
  /** ISO 8601. */
  created: string;
}

/** How long the sidebar waits for the chat service before it shows no findings. */
export const FINDINGS_TIMEOUT_MS = 4000;

/** `<apiBaseUrl>/findings/ref/<ref>`, the ref URL-encoded ("Genesis 1" → "Genesis%201"). */
export const findingsUrl = (apiBaseUrl: string, ref: string): string => `${apiBaseUrl.replace(/\/+$/, "")}/findings/ref/${encodeURIComponent(ref)}`;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const httpUrl = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};
const ROLES: readonly string[] = ["anchor", "position", "support"];

/** One finding from the answer, or null when a field the sidebar needs is missing or the wrong type. */
export function parseFinding(raw: unknown): Finding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const m = (r.method ?? {}) as Record<string, unknown>;
  const mt = (m.title ?? {}) as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.title);
  const conclusion = str(r.conclusion);
  const label = str(r.label);
  const slug = str(m.slug);
  const methodEn = str(mt.en) ?? str(mt.he);
  if (!id || !title || !conclusion || !label || !slug || !methodEn || !Array.isArray(r.anchorRefs)) return null;
  const skill = (r.skill ?? {}) as Record<string, unknown>;
  const skillName = str(skill.name);
  return {
    id,
    url: httpUrl(r.url),
    method: { slug, title: { en: methodEn, he: str(mt.he) ?? methodEn } },
    skill: skillName ? { name: skillName, title: str(skill.title) ?? skillName } : null,
    title,
    conclusion,
    label,
    anchorRefs: r.anchorRefs.filter((a): a is string => typeof a === "string"),
    refs: (Array.isArray(r.refs) ? r.refs : []).flatMap((x) => {
      const ref = str((x as Record<string, unknown> | null)?.ref);
      const role = (x as Record<string, unknown> | null)?.role;
      return ref && typeof role === "string" && ROLES.includes(role) ? [{ ref, role: role as FindingRole }] : [];
    }),
    sheetUrl: httpUrl(r.sheetUrl),
    created: str(r.created) ?? "",
  };
}

/** The findings of an answer (`{ref, findings: [...]}`); malformed entries are left out. */
export function parseFindings(body: unknown): Finding[] {
  const list = (body as { findings?: unknown } | null)?.findings;
  return Array.isArray(list) ? list.map(parseFinding).filter((f): f is Finding => f !== null) : [];
}

/** Fetch a section's findings; throws on a non-200, a timeout or an abort (the caller shows none). */
export async function fetchFindings(ref: string, opts: { apiBaseUrl: string; signal?: AbortSignal; timeoutMs?: number }): Promise<Finding[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? FINDINGS_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    // cross-origin and public: no cookies go to the chat service
    const r = await fetch(findingsUrl(opts.apiBaseUrl, ref), { credentials: "omit", signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Findings for ${ref}: HTTP ${r.status}`);
    return parseFindings(await r.json());
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export const findingsQueryOptions = (sectionRef: string, apiBaseUrl: string = PUBLIC_CONFIG.assistant.apiBaseUrl) =>
  queryOptions<Finding[]>({
    ...withPolicy("connections", {
      queryKey: ["findings", sectionRef] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchFindings(sectionRef, { apiBaseUrl, signal }),
    }),
    // a down service answers no faster the second time; a failure is not kept, so the next visit asks again
    retry: false,
  });

/** The findings anchored to any of the selected segments, each once. */
export function findingsForRefs(findings: readonly Finding[] | undefined, refs: readonly string[]): Finding[] {
  if (!findings?.length || !refs.length) return [];
  const wanted = new Set(refs);
  return findings.filter((f) => f.anchorRefs.some((r) => wanted.has(r)));
}

export interface FindingGroup {
  method: FindingMethod;
  findings: Finding[];
}

const time = (f: Finding) => {
  const t = Date.parse(f.created);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Findings grouped by method: methods with more findings first, then by title (in the interface language); within a method the newest
 * first. Ties keep the answer's order, so the list does not reshuffle between renders.
 */
export function groupByMethod(findings: readonly Finding[], interfaceLang: "english" | "hebrew" = "english"): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of findings) {
    const g = groups.get(f.method.slug);
    if (g) g.findings.push(f);
    else groups.set(f.method.slug, { method: f.method, findings: [f] });
  }
  const name = (g: FindingGroup) => (interfaceLang === "hebrew" ? g.method.title.he : g.method.title.en);
  return [...groups.values()]
    .map((g) => ({ ...g, findings: [...g.findings].sort((a, b) => time(b) - time(a)) }))
    .sort((a, b) => b.findings.length - a.findings.length || name(a).localeCompare(name(b), interfaceLang === "hebrew" ? "he" : "en"));
}

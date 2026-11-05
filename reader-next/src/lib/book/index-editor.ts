/**
 * Moderators editing a book's text information (the "Index Editor"), as the old EditTextInfo (static/js/BookPage.jsx) does:
 * validation, the payload for `POST /api/v2/raw/index/<title>` (`json=`, index_api, staff only), a title change that runs as
 * a background task (HTTP 202 + task_id, polled at /api/async/<id>), and Delete (`DELETE /api/v2/index/<title>`). After a
 * save the old editor sent the browser to Django's /admin/reset/<title>, which refreshes the caches and comes back to the book.
 *
 * @feature BOK-030 Moderator edits a book's text information
 */
import { deleteRequest, postForm, sameOrigin } from "~/lib/auth/http";
import { encodeTitle } from "~/lib/ref/url";
import type { TocNode } from "~/lib/catalog/toc";

export const DEPENDENCE = ["", "Commentary", "Targum", "Midrash", "Guides"] as const;

/** The index fields the editor reads (the v2 index, as getIndexDetails gives it). */
export interface EditableIndex {
  title: string;
  heTitle?: string;
  titleVariants?: string[];
  heTitleVariants?: string[];
  categories: string[];
  sectionNames?: string[];
  enDesc?: string | null;
  heDesc?: string | null;
  enShortDesc?: string | null;
  heShortDesc?: string | null;
  authors?: { en: string; he?: string; slug: string }[];
  dependence?: string;
  pubDate?: number[];
  compDate?: number[];
  pubPlaceString?: { en?: string; he?: string };
  compPlaceString?: { en?: string; he?: string };
  collective_title?: { en?: string; he?: string };
  base_text_titles?: ({ en: string; slug?: string } | string)[];
}

export interface IndexDraft {
  title: string;
  heTitle: string;
  titleVariants: string[];
  heTitleVariants: string[];
  categories: string[];
  enDesc: string;
  heDesc: string;
  enShortDesc: string;
  heShortDesc: string;
  /** Author topic slugs with their names. */
  authors: { name: string; slug: string }[];
  dependence: string;
  /** As typed: "1797-1800", "-900--200", "1040", or "". */
  compDate: string;
  pubDate: string;
  compPlace: string;
  heCompPlace: string;
  pubPlace: string;
  hePubPlace: string;
  collectiveTitle: string;
  heCollectiveTitle: string;
  /** True when the collective title is new (a Term is created for it, in both languages). */
  creatingCollectiveTitle: boolean;
  baseTextTitles: string[];
  sectionNames?: string[];
}

/** getYearAsStr: [a, b] → "a-b", [a] → "a". */
export const yearString = (y: number[] | undefined): string => (!y || !y.length ? "" : y.length === 2 ? `${y[0]}-${y[1]}` : `${y[0]}`);

/** validateCompDate: "" → [], "1040" → [1040], "1797-1800" → [1797, 1800], "-900--200" → [-900, -200]; else an error. */
export function parseYears(s: string): number[] | string {
  const m = s.trim().match(/^(-?\d+)(?:-(-?\d+))?$/);
  if (!s.trim()) return [];
  if (!m) return "Year must be an integer or range of integers.";
  const start = Number.parseInt(m[1]!, 10);
  if (m[2] === undefined) return [start];
  const end = Number.parseInt(m[2], 10);
  if (end <= start) return `Invalid date format ${start} to ${end}`;
  return [start, end];
}

export function indexDraft(i: EditableIndex): IndexDraft {
  return {
    title: i.title,
    heTitle: i.heTitle ?? "",
    titleVariants: [...(i.titleVariants ?? [])],
    heTitleVariants: [...(i.heTitleVariants ?? [])],
    categories: [...i.categories],
    enDesc: i.enDesc ?? "",
    heDesc: i.heDesc ?? "",
    enShortDesc: i.enShortDesc ?? "",
    heShortDesc: i.heShortDesc ?? "",
    authors: (i.authors ?? []).map((a) => ({ name: a.en, slug: a.slug })),
    dependence: i.dependence ?? "",
    compDate: yearString(i.compDate),
    pubDate: yearString(i.pubDate),
    compPlace: i.compPlaceString?.en ?? "",
    heCompPlace: i.compPlaceString?.he ?? "",
    pubPlace: i.pubPlaceString?.en ?? "",
    hePubPlace: i.pubPlaceString?.he ?? "",
    collectiveTitle: i.collective_title?.en ?? "",
    heCollectiveTitle: i.collective_title?.he ?? "",
    creatingCollectiveTitle: false,
    baseTextTitles: (i.base_text_titles ?? []).map((b) => (typeof b === "string" ? b : b.en)),
    sectionNames: i.sectionNames ? [...i.sectionNames] : undefined,
  };
}

const HEBREW = /[֐-׿]/;

/** The old validate's synchronous rules (Torah-specific site: a Hebrew title is required). The message to alert, or null. */
export function validateIndexDraft(d: IndexDraft): string | null {
  if (!d.title) return "Please give a text title or commentator name.";
  if (!d.heTitle) return "Please give a Hebrew text title.";
  if (/[.\-\\/]/.test(d.title)) return "Text titles may not contain periods, hyphens or slashes.";
  if (/[0-9]/.test(d.title)) return "Text titles may not contain numbers. This form is for general information about a text as a whole, not specific citations.";
  if (!d.categories.length) return "Please choose a text category.";
  if (d.categories.some((c) => /[.\-\\/]/.test(c))) return "Categories may not contain periods, hyphens or slashes.";
  if (HEBREW.test(d.title)) return "Please enter a primary title in English. Use the Hebrew Title field to specify a title in Hebrew.";
  for (const [label, s] of [["Completion Year", d.compDate], ["Publication Year", d.pubDate]] as const) {
    const y = parseYears(s);
    if (typeof y === "string") return `${label}: ${y}`;
  }
  return null;
}

/** The old save()'s postIndex. Dates go only when changed; oldTitle only when the title changed. */
export function indexPayload(original: EditableIndex, d: IndexDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: d.title,
    authors: d.authors.map((a) => a.slug),
    titleVariants: d.titleVariants,
    heTitleVariants: d.heTitleVariants,
    heTitle: d.heTitle,
    categories: d.categories,
    enDesc: d.enDesc,
    enShortDesc: d.enShortDesc,
    heDesc: d.heDesc,
    heShortDesc: d.heShortDesc,
    pubPlace: d.pubPlace,
    compPlace: d.compPlace,
    hePubPlace: d.hePubPlace,
    heCompPlace: d.heCompPlace,
    dependence: d.dependence,
    collective_title: d.collectiveTitle,
    base_text_titles: d.baseTextTitles,
  };
  if (d.sectionNames?.length) payload.sectionNames = d.sectionNames;
  if (d.title !== original.title) payload.oldTitle = original.title;
  if (d.pubDate.trim() !== yearString(original.pubDate)) payload.pubDate = parseYears(d.pubDate);
  if (d.compDate.trim() !== yearString(original.compDate)) payload.compDate = parseYears(d.compDate);
  return payload;
}

/** Links in a description ("[x](/Genesis.1.1)", "[y](/topics/shabbat)") whose targets the name API doesn't know. */
export function markdownLinkTargets(md: string): string[] {
  return Array.from(new Set([...md.matchAll(/\[.*?\]\((.*?)\)/g)].map((m) => m[1]!)));
}

export type SaveResult = { kind: "saved" } | { kind: "task"; taskId: string };

export async function saveIndex(original: EditableIndex, d: IndexDraft): Promise<SaveResult> {
  const res = await postForm(`/api/v2/raw/index/${d.title.replace(/ /g, "_")}`, new URLSearchParams({ json: JSON.stringify(indexPayload(original, d)) }));
  const data = res.data as { error?: string; task_id?: string };
  if (data.error) throw new Error(data.error);
  if (res.status === 202 && data.task_id) return { kind: "task", taskId: data.task_id };
  if (!res.ok) throw new Error("Unfortunately, there may have been an error saving this text information.");
  return { kind: "saved" };
}

/** Sefaria.pollTask: the task's state until it is ready; `onProgress` gets each step's message. */
export async function pollTask(taskId: string, onProgress: (step: string) => void, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<{ title?: string }> {
  for (;;) {
    const r = await fetch(sameOrigin(`/api/async/${encodeURIComponent(taskId)}`), { credentials: "same-origin" });
    const d = (await r.json()) as { state?: string; ready?: boolean; result?: { title?: string }; meta?: { step?: string }; error?: string };
    if (d.ready) {
      if (d.state === "SUCCESS") return d.result ?? {};
      throw new Error(d.error ?? d.state ?? "failed");
    }
    onProgress(d.meta?.step ?? "Processing...");
    await wait(2000);
  }
}

export async function deleteIndex(title: string): Promise<void> {
  const res = await deleteRequest(`/api/v2/index/${encodeTitle(title)}`);
  const data = res.data as { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "Something went wrong. Sorry!");
}

/** The collective title's Term: checked to exist, or created with both titles (POST /api/terms/<name>). Answers an error or null. */
export async function ensureCollectiveTerm(d: IndexDraft): Promise<string | null> {
  if (!d.collectiveTitle) return null;
  const path = `/api/terms/${encodeURIComponent(d.collectiveTitle)}`;
  if (!d.creatingCollectiveTitle) {
    const r = await fetch(sameOrigin(path), { credentials: "same-origin" });
    const t = (await r.json().catch(() => ({}))) as { error?: string };
    return t.error ?? null;
  }
  const term = { name: d.collectiveTitle, titles: [{ primary: true, lang: "en", text: d.collectiveTitle }, { primary: true, lang: "he", text: d.heCollectiveTitle }] };
  const res = await postForm(path, new URLSearchParams({ json: JSON.stringify(term) }));
  return (res.data as { error?: string }).error ?? null;
}

/** The categories under a path (Sefaria.tocObjectByCategories(...).contents, categories only). */
export function subcategories(tree: readonly TocNode[], path: readonly string[]): string[] {
  let level: readonly TocNode[] = tree;
  for (const name of path) {
    const next = level.find((n) => "category" in n && n.category === name);
    if (!next || !("category" in next)) return [];
    level = next.contents ?? [];
  }
  return level.filter((n) => "category" in n).map((n) => (n as { category: string }).category);
}

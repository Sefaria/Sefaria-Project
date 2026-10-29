/**
 * A moderator creating a topic, as the old TopicEditor (static/js/TopicEditor.jsx) does for a new topic: titles with their
 * "(disambiguation)", a parent topic ("Main Menu" for a top-level one), descriptions, alternate titles and, under Authors, places,
 * years and era. `POST /api/topic/new` (`json=`), staff only (@staff_member_required), answers the topic (its `slug`).
 * Pictures are not uploaded from here: they are edited on the topic's page.
 *
 * @feature CON-047 Add topic to ref (moderator)
 */
import { postForm } from "~/lib/auth/http";
import type { TopicTocNode } from "./topic-toc";

/** Topic.ROOT: the parent of a top-level topic (not a real slug). */
export const MAIN_MENU = "Main Menu";
/** Sefaria._eras: Gaonim, Rishonim, Achronim, Contemporary. */
export const ERAS = ["GN", "RI", "AH", "CO"] as const;
export const AUTHOR_FIELDS = ["birthPlace", "heBirthPlace", "birthYear", "deathPlace", "heDeathPlace", "deathYear", "era"] as const;
export type AuthorField = (typeof AUTHOR_FIELDS)[number];

export interface NewTopic {
  enTitle: string;
  heTitle: string;
  /** A parent topic's slug, or MAIN_MENU. */
  category: string;
  enDescription: string;
  heDescription: string;
  enAltTitles: string[];
  heAltTitles: string[];
  author?: Partial<Record<AuthorField, string>>;
}

export interface TopicTitle {
  text: string;
  lang: "en" | "he";
  primary?: true;
  disambiguation?: string;
}

const DISAMBIGUATION = /\((.+)\)$/;

/** createPrimaryTitleObj / createNonPrimaryTitleObjArray: "Moses (prophet)" → {text: "Moses", disambiguation: "prophet"}. */
export function titleObject(raw: string, lang: "en" | "he", primary = false): TopicTitle {
  const disambiguation = raw.match(DISAMBIGUATION)?.[1];
  return {
    text: raw.replace(DISAMBIGUATION, "").trimEnd(),
    lang,
    ...(primary ? { primary: true as const } : {}),
    ...(disambiguation ? { disambiguation } : {}),
  };
}

/** The old prepData for a new topic. */
export function newTopicPayload(t: NewTopic): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    category: t.category,
    titles: [
      titleObject(t.enTitle, "en", true),
      titleObject(t.heTitle, "he", true),
      ...t.enAltTitles.map((x) => titleObject(x, "en")),
      ...t.heAltTitles.map((x) => titleObject(x, "he")),
    ],
    secondary_image_uri: "",
  };
  if (t.enDescription || t.heDescription) payload.description = { en: t.enDescription, he: t.heDescription };
  if (t.category === "authors") for (const k of AUTHOR_FIELDS) if (t.author?.[k]) payload[k] = t.author[k];
  return payload;
}

/** The old validate (before save): a parent and an English title. Answers the message to alert, or null. */
export function validateNewTopic(t: NewTopic): string | null {
  if (!t.category) return "Please choose a category.";
  if (!t.enTitle.trim()) return "Title must be provided.";
  return null;
}

export async function createTopic(t: NewTopic): Promise<string> {
  const res = await postForm("/api/topic/new", new URLSearchParams({ json: JSON.stringify(newTopicPayload(t)) }));
  const data = res.data as { slug?: string; error?: string };
  if (!res.ok || data.error || !data.slug) throw new Error(data.error ?? `Unfortunately, there may have been an error saving this topic information (HTTP ${res.status}).`);
  return data.slug;
}

/** Sefaria.slugsToTitles: every topic that has children (the parents a topic can go under), in TOC order. */
export function parentTopicOptions(toc: readonly TopicTocNode[]): { slug: string; en: string; he: string }[] {
  const out: { slug: string; en: string; he: string }[] = [];
  const walk = (n: TopicTocNode) => {
    if (!n.children) return;
    out.push({ slug: n.slug, en: n.primaryTitle.en, he: n.primaryTitle.he });
    n.children.forEach(walk);
  };
  toc.forEach(walk);
  return out;
}

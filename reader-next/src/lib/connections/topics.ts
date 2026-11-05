/**
 * Topics for the selected passage. Ported from Sefaria.topicsByRef and the old TopicList, VERIFIED on
 * sefaria.org (2026-10-05): Genesis 1:1 lists Creation, "In the Beginning of", Heavens, Creation of Heavens and
 * Earth, Parashat Bereshit, Earth, Ai — seven, as the Resources row counts — most prominent first.
 *
 * @feature CON-046 Topics for this ref
 */
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import type { ByRef, RelatedTopic as RelatedTopicLink } from "./related";

export interface Bilingual {
  en: string;
  he: string;
}

export interface TopicItem {
  slug: string;
  title: Bilingual;
  /** Markdown, when the topic has one. */
  description?: { en?: string; he?: string };
  /** Who connected it to this text ("Curation of the Sefaria Learning Team"), each once. */
  sources: Bilingual[];
}

/** The topics anchored to any of these refs: each once, with every source that connected it, most prominent first. */
export function topicsForRefs(byRef: ByRef<RelatedTopicLink> | undefined, refs: readonly string[]): TopicItem[] {
  const out = new Map<string, TopicItem & { pr: number }>();
  for (const ref of refs) {
    for (const t of byRef?.[ref] ?? []) {
      const link = t as RelatedTopicLink & { description?: TopicItem["description"]; dataSource?: { slug: string } & Bilingual; order?: { pr?: number } };
      const item = out.get(link.topic) ?? { slug: link.topic, title: link.title as Bilingual, description: link.description, sources: [], pr: link.order?.pr ?? 0 };
      const ds = link.dataSource;
      if (ds && !item.sources.some((s) => s.en === ds.en)) item.sources.push({ en: ds.en, he: ds.he });
      out.set(link.topic, item);
    }
  }
  return [...out.values()].sort((a, b) => b.pr - a.pr).map(({ pr: _pr, ...item }) => item);
}

/** 'This topic is connected to "Genesis 1:1" by A & B.' — the old tooltip, in the interface language. */
export function topicSourceNote(sources: readonly Bilingual[], refLabel: string, lang: "en" | "he"): string {
  if (!sources.length) return "";
  const names = sources.map((s) => s[lang]).join(" & ");
  return lang === "he" ? `נושא הזה קשור ל-"${refLabel}" על ידי ${names}.` : `This topic is connected to "${refLabel}" by ${names}.`;
}

/** A segment ref in the interface language: Hebrew when it is a numbered verse or line of the section ("בראשית א׳:ב׳"). */
export function localizedRef(ref: string, section: { sectionRef: string; heSectionRef: string } | undefined, lang: "en" | "he"): string {
  if (lang === "en" || !section) return ref;
  const m = new RegExp(`^${section.sectionRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\d+)$`).exec(ref);
  return m ? `${section.heSectionRef}:${encodeHebrewNumeral(Number(m[1]))}` : ref;
}

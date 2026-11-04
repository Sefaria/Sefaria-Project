import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import type { BilingualText, MaybeBilingual } from "./TopicPage";
import styles from "./TopicPage.module.css";

export type CardLanguage = "english" | "hebrew" | "bilingual";
export type ReviewState = "reviewed" | "not reviewed" | "edited";

export interface SourceCardProps {
  /** The analytics batch the old page put on each source's wrapper (position, ai/human, the ref, its book and categories). */
  analytics: Record<string, unknown>;
  /** False: a source missing the chosen language on Notable Sources and Sources (its wrapper stays, empty, as on sefaria.org). */
  visible: boolean;
  /** The curated title and prompt, folded into a <details> (Notable Sources, Admin). */
  intro?: { title: MaybeBilingual; prompt: MaybeBilingual; categoryLabel: string; open: boolean };
  /** The category colour of the bar at the start of each block. */
  color: string;
  href: string;
  citation: BilingualText;
  /** Already-sanitised HTML of each side. */
  text: { en?: string; he?: string };
  language: CardLanguage;
  /** Moderators on the Admin tab: one button per language with a review state. */
  review?: { en?: ReviewState; he?: ReviewState; onMark: (lang: "en" | "he") => void };
  /** Moderators on the Admin tab: the pencil that edits the source. */
  edit?: ReactNode;
}

const REVIEW_LABEL: Record<ReviewState, { text: string; cls: string }> = {
  reviewed: { text: "Reviewed", cls: styles.reviewed! },
  "not reviewed": { text: "Not Reviewed", cls: styles.notReviewed! },
  edited: { text: "Edited", cls: styles.edited! },
};

function Body({ text, language }: Pick<SourceCardProps, "text" | "language">) {
  // ContentText with bilingualOrder he, en: the Hebrew first
  const sides: ("he" | "en")[] = language === "bilingual" ? ["he", "en"] : [language === "hebrew" ? "he" : "en"];
  return (
    <>
      {sides.map((l) => (text[l] ? <LangText key={l} lang={l} className={styles.text} html={text[l]} /> : null))}
    </>
  );
}

/**
 * A source on a topic page (the old TopicTextPassage in its StoryFrame, or SummarizedStoryFrame for a curated one): the curated title
 * and its book's primary category over the learning prompt, then the text (a link to it) and its citation, each block with the
 * category's colour bar.
 *
 * @feature TOP-023 Topic source cards
 * @feature TOP-028 AI-generated topic text disclosure and admin prompt tools
 */
export function SourceCard({ analytics, visible, intro, color, href, citation, text, language, review, edit }: SourceCardProps) {
  const bar = { borderInlineStartColor: color };
  const inner = (
    <>
      {intro ? (
        <div className={styles.colorBar} style={bar}>
          <div className={styles.prompt}>
            <InterfaceText en={intro.prompt.en} he={intro.prompt.he} />
          </div>
        </div>
      ) : null}
      <div className={styles.colorBar} style={bar}>
        <div className={`${styles.body} ${language === "bilingual" ? styles.bilingual : ""}`}>
          <Link href={href} data-anl-event="clickto_reader:click">
            <Body text={text} language={language} />
          </Link>
        </div>
        <div className={styles.footer}>
          <div className={styles.citation} data-anl-event="clickto_reader:click">
            <Link href={href} data-target-module="library">
              <InterfaceText en={citation.en} he={citation.he} />
            </Link>
          </div>
          {review
            ? (["he", "en"] as const).map((l) =>
                review[l] ? (
                  <button key={l} type="button" lang={l} className={`${styles.reviewState} ${REVIEW_LABEL[review[l]!].cls}`} onClick={() => review.onMark(l)}>
                    {REVIEW_LABEL[review[l]!].text}
                  </button>
                ) : null,
              )
            : null}
          {edit}
        </div>
      </div>
    </>
  );
  return (
    <div data-anl-batch={JSON.stringify(analytics)}>
      {visible ? (
        <div className={styles.story} data-source-card="">
          {intro ? (
            <details open={intro.open} data-anl-event="package_toggle:toggle|package_viewed:scrollIntoView" data-anl-feature_name="prompt" data-anl-text={intro.title.en}>
              <summary>
                <div className={styles.colorBar} style={bar}>
                  <div className={styles.descBlock}>
                    <div className={styles.storyTitle}>
                      <div className={styles.storyTitleText}>
                        <InterfaceText en={intro.title.en} he={intro.title.he} />
                      </div>
                    </div>
                    <div className={styles.primaryCategory}>{intro.categoryLabel}</div>
                  </div>
                </div>
              </summary>
              {inner}
            </details>
          ) : (
            inner
          )}
        </div>
      ) : null}
    </div>
  );
}

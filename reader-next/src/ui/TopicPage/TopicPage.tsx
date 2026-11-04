import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { inlineMarkdownToHtml } from "~/lib/html/markdown";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { AdminButtons, type PageAdmin } from "../AdminButtons/AdminButtons";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import { InterfaceMarkdown, type MaybeBilingual } from "../TopicsNav/TopicCard";
import styles from "./TopicPage.module.css";

export type { MaybeBilingual };
export interface BilingualText {
  en: string;
  he: string;
}

const anlAttrs = (anl: Record<string, string | number | undefined>) =>
  Object.fromEntries(
    Object.entries(anl)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`data-anl-${k}`, String(v)]),
  );

/**
 * The topic page's frame (the old .topicPanel): the analytics batch on its root, the page's column and the side column beside it
 * (under it on a phone).
 *
 * @feature TOP-029 Topic page analytics batch
 */
export function TopicPageLayout({
  batch,
  main,
  side,
  sideKind = "topic",
}: {
  batch: Record<string, unknown>;
  main: ReactNode;
  side: ReactNode;
  sideKind?: "topic" | "portal";
}) {
  return (
    <div className={styles.panel} data-anl-batch={JSON.stringify(batch)}>
      <div className={styles.columns}>
        <div className={styles.main}>{main}</div>
        {side ? (
          sideKind === "portal" ? (
            <aside className={`${styles.side} ${styles.sideNav}`}>{side}</aside>
          ) : (
            <aside
              className={styles.side}
              data-anl-panel_type="topics"
              data-anl-panel_number={0}
            >
              {side}
            </aside>
          )
        ) : null}
      </div>
    </div>
  );
}

/** ImageWithCaption: the picture (its alt the caption in the interface language) and the caption under it. */
export function TopicImage({
  uri,
  caption,
  place,
}: {
  uri: string;
  caption: MaybeBilingual;
  place: "side" | "main";
}) {
  const lang = langCode(useInterfaceLang());
  const alt =
    (lang === "he" ? caption.he || caption.en : caption.en || caption.he) ?? "";
  return (
    <div
      className={`${styles.image} ${place === "side" ? styles.sideImage : styles.mainImage}`}
    >
      <img className={styles.photo} src={uri} alt={alt} />
      <div className={styles.caption}>
        <InterfaceText en={caption.en} he={caption.he} />
      </div>
    </div>
  );
}

/**
 * AiInfoTooltip (outline, 24px): the star beside the title when some text on the page was written with AI; hovering opens the
 * notice with "Learn More" (/ai) and the feedback form.
 *
 * @feature TOP-028 AI-generated topic text disclosure and admin prompt tools
 */
export function AiNotice() {
  const [open, setOpen] = useState(false);
  const he = useInterfaceLang() === "hebrew";
  // the old AiInfoTooltip: the message is always in the page (its links and their data-anl-* too), hidden until the icon or the
  // message is hovered; it fades in over 0.5s and out over 2s
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <div className={styles.ai} data-anl-feature_name="ai_marker">
      <img
        className={styles.aiIcon}
        src="/icons/ai-star-outline-24.svg"
        alt={he ? "בסיוע בינה מלאכותית" : "AI assisted"}
        data-anl-event="ai_marker_hover:mouseover"
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      />
      <div className={`${styles.aiMessage} ${open ? styles.aiVisible : ""}`}>
        <div className={styles.aiBox} role="tooltip" onMouseEnter={show} onMouseLeave={hide}>
          <div className={styles.aiFirst}>
            <InterfaceText
              en="Some of the text on this page has been AI generated."
              he="חלק מהטקסט בעמוד זה נוצר על ידי בינה מלאכותית."
            />
            &nbsp;
            <a href="/ai" data-anl-event="learn_more_click:click" data-anl-text="learn_more">
              <InterfaceText en="Learn More" he="לפרטים נוספים" />
            </a>
          </div>
          <hr className={styles.aiHr} />
          <div className={styles.aiLast}>
            <a href="https://sefaria.formstack.com/forms/ai_feedback_form" data-anl-event="feedback_click:click" data-anl-text="feedback">
              {he ? "כתבו לנו" : "Feedback"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface TopicHeaderProps {
  title: BilingualText;
  admin?: PageAdmin;
  aiNotice?: boolean;
  /** The category above the topic (a routed link to its page). */
  category?: { href: string; en: string; he: string };
  dedication?: BilingualText;
  description?: MaybeBilingual;
  /** The picture under the description (a phone shows it here; a wide screen in the side column). */
  image?: { uri: string; caption: MaybeBilingual };
  /** A topic with a ref (a portion, a holiday): the book button; the Study Companion beside it in English. */
  refButton?: { href: string; en: string; he: string; studyCompanion: boolean };
  /** Clicks on links inside the description (the page routes links to its own site). */
  onDescriptionClick?: (e: MouseEvent<HTMLDivElement>) => void;
}

/**
 * TopicHeader: the title (with the moderators' buttons and the AI marker), the category, the dedication, the description, the
 * picture (phone) and the book and Study Companion buttons.
 *
 * @feature TOP-017 Topic page header
 * @feature TOP-018 Parasha topic sponsorship text
 * @feature TOP-019 Read the portion and Study Companion buttons
 */
export function TopicHeader({
  title,
  admin,
  aiNotice,
  category,
  dedication,
  description,
  image,
  refButton,
  onDescriptionClick,
}: TopicHeaderProps) {
  const lang = langCode(useInterfaceLang());
  return (
    <div>
      <div className={styles.navTitle}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            <InterfaceText en={title.en} he={title.he} />
          </h1>
          {admin ? <AdminButtons buttons={admin.buttons} /> : null}
        </div>
        {aiNotice ? <AiNotice /> : null}
      </div>
      {category ? (
        <div className={styles.category}>
          <Link href={category.href}>
            <InterfaceText en={category.en} he={category.he} />
          </Link>
        </div>
      ) : null}
      {dedication ? (
        <div className={styles.dedication}>
          <LangText
            lang={lang}
            html={inlineMarkdownToHtml(dedication[lang] || dedication.en)}
          />
        </div>
      ) : null}
      {description && (description.en || description.he) ? (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates link clicks only
        <div className={styles.description} onClick={onDescriptionClick}>
          <InterfaceMarkdown text={description} />
        </div>
      ) : null}
      {image ? (
        <TopicImage uri={image.uri} caption={image.caption} place="main" />
      ) : null}
      {refButton ? (
        <div className={styles.buttons}>
          <Link
            href={refButton.href}
            className={styles.refButton}
            data-target-module="library"
          >
            <img
              src="/icons/book-icon-black.svg"
              alt={lang === "he" ? "סמל ספר" : "book icon"}
            />
            <InterfaceText en={refButton.en} he={refButton.he} />
          </Link>
          {refButton.studyCompanion ? (
            <a
              className={styles.refButton}
              href="https://learn.sefaria.org/weekly-parashah/"
              target="_blank"
              rel="noopener noreferrer"
              data-anl-event="select_promotion:click|view_promotion:scrollIntoView"
              data-anl-promotion_name="Parashah Email Signup - Parashah Page"
            >
              <img
                src="/icons/email-newsletter.svg"
                alt="Sign up for our weekly parashah study companion"
              />
              <InterfaceText en="Get the Free Study Companion" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface TabSpec {
  id: string;
  title: BilingualText;
}

export interface TopicTabsProps {
  tabs: readonly TabSpec[];
  current: string | undefined;
  onSelect: (id: string) => void;
  /** The funnel (filter and sort); absent on Notable Sources and Works. */
  filter?: { open: boolean; onToggle: () => void; sort: string };
  /** The "A" (Source / Translation / Source with Translation); absent on Works. */
  language?: {
    choice: string;
    choices: readonly { id: string; en: string; he: string }[];
    onChoose: (id: string) => void;
  };
  children: ReactNode;
}

/**
 * The topic page's TabView (largeTabs): the tabs, then the funnel and the "A" pushed to the far end (the first of them takes the
 * space), and the current tab's contents. Arrow keys move between tabs, as the old TabView.
 *
 * @feature TOP-020 Topic page tabs
 */
export function TopicTabs({
  tabs,
  current,
  onSelect,
  filter,
  language,
  children,
}: TopicTabsProps) {
  const [langOpen, setLangOpen] = useState(false);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === current),
  );
  const he = useInterfaceLang() === "hebrew";
  const key = (e: React.KeyboardEvent, i: number) => {
    const next =
      e.key === (he ? "ArrowLeft" : "ArrowRight")
        ? i + 1
        : e.key === (he ? "ArrowRight" : "ArrowLeft")
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : null;
    if (next !== null && next >= 0 && next < tabs.length) {
      e.preventDefault();
      refs.current[next]?.focus();
      onSelect(tabs[next]!.id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(tabs[i]!.id);
    }
  };
  return (
    <div>
      <div className={styles.tabList}>
        {/* the tabs alone in the tablist; the funnel and the "A" are buttons beside them, in the same row */}
        <div className={styles.tabsOnly} role="tablist">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={styles.tabItem}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={i === index}
              tabIndex={i === index ? 0 : -1}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => key(e, i)}
            >
              <div className={styles.tab}>
                <div>
                  <InterfaceText en={t.title.en} he={t.title.he} />
                </div>
              </div>
            </div>
          ))}
        </div>
        {filter ? (
          <div className={styles.justify}>
            <button
              type="button"
              className={`${styles.pseudo} ${styles.tabItem}`}
              aria-expanded={filter.open}
              aria-label={he ? "סינון ומיון" : "Filter and sort"}
              onClick={filter.onToggle}
            >
              <div />
              <img
                className={styles.filterIcon}
                src="/icons/filter.svg"
                alt=" icon"
                data-anl-event="filter:click"
                data-anl-text={filter.sort}
              />
            </button>
          </div>
        ) : null}
        {language ? (
          <div className={filter ? undefined : styles.justify}>
            <LangToggle
              {...language}
              open={langOpen}
              onOpen={() => setLangOpen((o) => !o)}
              onClose={() => setLangOpen(false)}
            />
          </div>
        ) : null}
      </div>
      <div
        role="tabpanel"
        aria-labelledby={tabs[index] ? `tab-${tabs[index]!.id}` : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function LangToggle({
  choice,
  choices,
  onChoose,
  open,
  onOpen,
  onClose,
}: NonNullable<TopicTabsProps["language"]> & {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  return (
    <div className={`${styles.pseudo} ${styles.langToggle}`}>
      <button
        type="button"
        className={styles.tabItem}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onOpen}
        data-anl-event="lang_toggle_click:click"
      >
        <InterfaceText en="A" he="א" />
      </button>
      {open ? (
        <div
          ref={box}
          className={styles.popover}
          tabIndex={0}
          data-anl-batch={JSON.stringify({
            feature_name: "source lang toggled",
            text: choice,
            from: choice,
          })}
          onBlur={() =>
            setTimeout(() => {
              if (!box.current?.contains(document.activeElement)) onClose();
            }, 50)
          }
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          {choices.map((c) => (
            <div
              key={c.id}
              className={`${styles.choice} ${c.id === choice ? styles.active : ""}`}
              data-anl-event="lang_toggle_select:click"
              data-anl-text={c.id}
              data-anl-to={c.id}
            >
              <label htmlFor={`lang-${c.id}`}>
                <InterfaceText en={c.en} he={c.he} />
              </label>
              <input
                type="radio"
                id={`lang-${c.id}`}
                name="topic-lang"
                value={c.id}
                checked={c.id === choice}
                onChange={() => {
                  onChoose(c.id);
                  onClose();
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The filter and sort bar under the tabs (FilterableList's new design): a search box over the sources and "Sort by" with the
 * tab's options.
 *
 * @feature TOP-022 Topic source filter and sort
 */
export function SourceFilterBar({
  filter,
  onFilter,
  options,
  sort,
  onSort,
}: {
  filter: string;
  onFilter: (v: string) => void;
  options: readonly { id: string; en: string; he: string }[];
  sort: string;
  onSort: (id: string) => void;
}) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.filterBar}>
      <div className={styles.filterInput}>
        <img src="/icons/search_mdl.svg" alt={he ? "חיפוש" : "Search"} />
        <input
          type="text"
          placeholder={he ? "חיפוש" : "Search"}
          name="filterableListInput"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          data-anl-event="search:input"
        />
      </div>
      <div className={styles.sortBy}>
        <InterfaceText en="Sort by" he="מיון לפי" />
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={styles.sortOption}
            aria-pressed={sort === o.id}
            onClick={() => o.id !== sort && onSort(o.id)}
            data-anl-event="sort_by:click"
            data-anl-batch={JSON.stringify({
              text: o.id,
              from: sort,
              to: o.id,
            })}
          >
            <InterfaceText en={o.en} he={o.he} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The old LoadingMessage: a grey italic line ("Loading..." / "טוען מידע..."). */
export function TopicPageMessage({
  en = "Loading...",
  he = "טוען מידע...",
}: {
  en?: string;
  he?: string;
}) {
  return (
    <div className={styles.message} aria-live="polite">
      <InterfaceText en={en} he={he} />
    </div>
  );
}

/**
 * Works on Sefaria (an author's tab): each work's title, linking to its book or its category, and its description, two to a row.
 *
 * @feature TOP-020 Topic page tabs
 */
export function AuthorWorks({
  works,
}: {
  works: readonly {
    href: string;
    title: BilingualText;
    description: MaybeBilingual;
  }[];
}) {
  return (
    <div className={styles.works}>
      {works.map((w) => (
        <div key={w.href} className={styles.work}>
          <Link
            href={w.href}
            className={styles.workTitle}
            data-target-module="library"
          >
            <InterfaceText en={w.title.en} he={w.title.he} />
          </Link>
          <div className={styles.workDescription}>
            <InterfaceText en={w.description.en} he={w.description.he} />
          </div>
        </div>
      ))}
    </div>
  );
}

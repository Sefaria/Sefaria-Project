import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { InterfaceMarkdown, TopicCard, type MaybeBilingual } from "./TopicCard";
import styles from "./TopicsNav.module.css";

export interface LandingTopic {
  slug: string;
  primaryTitle: { en: string; he: string };
  description?: MaybeBilingual;
}

/** The old RainbowLine: the ten category colours in a 4px bar, sliding while something loads. */
export function RainbowLine({ animated, position }: { animated?: boolean; position: "upper" | "lower" }) {
  return <div className={`${styles.rainbow} ${animated ? styles.rainbowAnimated : ""} ${position === "upper" ? styles.rainbowUpper : styles.rainbowLower}`} aria-hidden="true" />;
}

/**
 * The old WordSalad: the items in centred lines, clamped to `numLines`, a bullet after every item that has another after it on
 * the same line (the old offsetTop check). sefaria.org measures once, when the random sample arrives — often before the web fonts
 * are in — so after the fonts re-wrap the lines 1–2 of its ~40 bullets can end a line ("Shavuot •"; measured 2026-11-04, 4 loads,
 * timing-dependent). The rule on the final lines is what it shows otherwise, and what is reproducible. The bullets are placed on
 * the laid-out lines and placed again until the lines stop moving (a bullet can push the next item down), once the fonts are in,
 * and on resize.
 */
export function WordSalad({ items, numLines, renderItem }: { items: readonly LandingTopic[]; numLines: number; renderItem: (t: LandingTopic) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const spans = [...el.querySelectorAll<HTMLElement>("[data-salad-item]")];
      for (let pass = 0; pass < 5; pass++) {
        let changed = false;
        spans.forEach((span, i) => {
          const want = i < spans.length - 1 && span.offsetTop === spans[i + 1]!.offsetTop;
          if (want !== span.hasAttribute("data-bullet")) {
            span.toggleAttribute("data-bullet", want);
            changed = true;
          }
        });
        if (!changed) break;
      }
    };
    place();
    void document.fonts?.ready.then(place);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);
  return (
    <div ref={box} className={styles.saladContainer} style={{ ["--num-lines" as string]: numLines }}>
      {items.map((t) => (
        <span key={t.slug}>
          <span className={styles.saladItemBox} data-salad-item="">
            {renderItem(t)}
          </span>{" "}
        </span>
      ))}
    </div>
  );
}

/** The old RowedWordSalad (a phone): one line of blue pills that scrolls sideways. */
export function RowedWordSalad({ items, renderItem }: { items: readonly LandingTopic[]; renderItem: (t: LandingTopic) => ReactNode }) {
  return (
    <div className={styles.rowedSalad}>
      {items.map((t) => (
        <span key={t.slug} className={styles.rowedItem}>
          {renderItem(t)}
        </span>
      ))}
    </div>
  );
}

/**
 * The topic word cloud (TopicSalad): 50 random topics of the interface language's general pool, between two rainbow lines; the
 * upper one slides until they arrive. A wide screen shows five centred lines with bullets, a phone one scrolling row of pills.
 *
 * @feature TOP-005 Topic word cloud (salad)
 */
export function TopicSalad({ items, phone, topicHref }: { items: readonly LandingTopic[] | undefined; phone: boolean; topicHref: (slug: string) => string }) {
  const renderItem = (t: LandingTopic) => (
    <Link href={topicHref(t.slug)} className={styles.saladItem} data-anl-link_type="topic" data-anl-text={t.primaryTitle.en} data-anl-event="navto_topic:click">
      <InterfaceText en={t.primaryTitle.en} he={t.primaryTitle.he} />
    </Link>
  );
  const list = items ?? [];
  return (
    <span data-anl-feature_name="Topic Salad">
      <RainbowLine animated={!items} position="upper" />
      <div className={styles.salad}>{phone ? <RowedWordSalad items={list} renderItem={renderItem} /> : <WordSalad items={list} numLines={5} renderItem={renderItem} />}</div>
      {items ? <RainbowLine position="lower" /> : null}
    </span>
  );
}

export interface FeaturedTopicData extends LandingTopic {
  imageUrl?: string;
  imageCaption?: MaybeBilingual;
}

/**
 * Featured Topic (the topic of the day): its picture, title, description and "Go to Topic ›". Nothing when there is none.
 *
 * @feature TOP-006 Featured topic of the day
 */
export function FeaturedTopic({ topic, topicHref }: { topic: FeaturedTopicData | null | undefined; topicHref: (slug: string) => string }) {
  const he = useInterfaceLang() === "hebrew";
  if (!topic) return null;
  const href = topicHref(topic.slug);
  const prompt = "Go to Topic ›";
  // the old getImgAltText: the caption in the interface language
  const alt = (he ? topic.imageCaption?.he || topic.imageCaption?.en : topic.imageCaption?.en || topic.imageCaption?.he) ?? "";
  return (
    <div className={styles.featured} data-anl-feature_name="Featured Topic">
      <h2 className={styles.featuredHeader}>
        <InterfaceText en="Featured Topic" he="נושא היום" />
      </h2>
      <div className={styles.featuredContent}>
        <div className={styles.featuredImg}>
          <Link href={href}>{topic.imageUrl ? <img className={styles.featuredPhoto} src={topic.imageUrl} alt={alt} /> : null}</Link>
        </div>
        <div className={styles.featuredText}>
          <h3>
            <InterfaceText en={topic.primaryTitle.en} he={topic.primaryTitle.he} />
          </h3>
          <div className={styles.featuredDescription}>
            <InterfaceMarkdown text={topic.description} />
            <div className={styles.featuredGoWrap}>
              <br />
              <span data-anl-link_type="link" data-anl-text={prompt} data-anl-event="navto_topic:click">
                <Link href={href} className={styles.featuredGo}>
                  <InterfaceText en={prompt} he="לפתיחת הנושא ›" />
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type SubscribeState = { kind: "idle" } | { kind: "message"; en: string; he: string } | { kind: "error"; message: { en: string; he: string } };

const MSG = {
  names: { en: "Please enter a valid first and last name.", he: "נא להוסיף שם פרטי ושם משפחה." },
  email: { en: "Please enter a valid email address.", he: 'כתובת הדוא"ל שהוזנה אינה תקינה.' },
  subscribing: { en: "Subscribing...", he: "Subscribing..." },
  done: { en: "Subscribed! Welcome to our list.", he: "הרשמה בוצעה בהצלחה!" },
  error: { en: "Sorry, there was an error.", he: "סליחה, ארעה שגיאה" },
};

/**
 * The topics newsletter form (TopicLandingNewsletter): first name, last name, email, Sign Up (Enter in any field submits). Checks the
 * names and the address first, then "Subscribing...", then the welcome or the error under the box. Reports form_start on the first
 * input and form_submit on the button (its data-anl-batch, as the old form).
 *
 * @feature TOP-007 Topics newsletter sign-up
 */
export function TopicNewsletter({ subscribe, validEmail, analytics }: { subscribe: (first: string, last: string, email: string) => Promise<void>; validEmail: (email: string) => boolean; analytics: Record<string, string> }) {
  const he = useInterfaceLang() === "hebrew";
  const first = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLInputElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ en: string; he: string } | null>(null);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);
  const submit = () => {
    if (!first.current?.value || !last.current?.value) return setMessage(MSG.names);
    if (!validEmail(email.current?.value ?? "")) return setMessage(MSG.email);
    setMessage(MSG.subscribing);
    subscribe(first.current.value, last.current.value, email.current!.value).then(
      () => setMessage(MSG.done),
      (e: unknown) => {
        const m = e instanceof Error && e.message ? e.message : "";
        setError(m ? { en: m, he: m } : MSG.error);
        setMessage(null);
      },
    );
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };
  const ph = (en: string, h: string) => (he ? h : en);
  return (
    <div className={styles.newsletterWrapper} data-anl-batch={JSON.stringify(analytics)}>
      <div className={styles.newsletter}>
        <h3 className={styles.newsletterText}>
          <InterfaceText en="Stay curious. Get the Timeless Topics newsletter every Tuesday." he="הירשמו למיילים של ספריא כדי לקבל עדכונים על מקורות, כותרים וכלים חדשים." />
        </h3>
        <div className={styles.newsletterInputs} data-anl-event="form_start:inputStart">
          <div className={styles.newsletterRow}>
            <input type="text" placeholder={ph("First Name", "שם פרטי")} aria-label={ph("First Name", "שם פרטי")} ref={first} onKeyUp={onKeyUp} />
            <input type="text" placeholder={ph("Last Name", "שם משפחה")} aria-label={ph("Last Name", "שם משפחה")} ref={last} onKeyUp={onKeyUp} />
          </div>
          <div className={styles.newsletterRow}>
            <input type="text" placeholder={ph("Email Address", 'כתובת דוא"ל')} aria-label={ph("Email Address", 'כתובת דוא"ל')} ref={email} onKeyUp={onKeyUp} />
            <button type="submit" onKeyUp={onKeyUp} onClick={submit} data-anl-event="form_submit:click">
              {ph("Sign Up", "להרשמה")}
            </button>
          </div>
          <div className={styles.newsletterRow}>
            {message ? (
              <div className={styles.subscribeMessage} role="status">
                <InterfaceText en={message.en} he={message.he} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div>
        {error ? (
          <div className={styles.subscribeError} role="alert" aria-live="assertive">
            <InterfaceText en={error.en} he={error.he} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The random cards (RandomTopicCardWithDescriptionRow): topics with a description, each card with "Explore <title> ›". Three in a
 * row on a wide screen, ten in a scrolling row on a phone.
 *
 * @feature TOP-008 Random topic cards with descriptions
 */
export function TopicDeck({ topics, topicHref }: { topics: readonly LandingTopic[]; topicHref: (slug: string) => string }) {
  return (
    <div className={styles.deck} data-anl-feature_name="Multi-Cards">
      {topics.map((t) => (
        <div className={styles.deckItem} data-anl-link_type="topic" key={t.slug}>
          <TopicCard
            variant="described"
            routed
            href={topicHref(t.slug)}
            title={t.primaryTitle}
            description={t.description}
            bottomLink={{ href: topicHref(t.slug), en: `Explore ${t.primaryTitle.en} ›`, he: `למדו עוד על ${t.primaryTitle.he} ›` }}
            analyticsEvent="navto_topic"
          />
        </div>
      ))}
    </div>
  );
}

/** The old TopicLandingCalendar: a small header, the topic's card, and what follows it. */
function CalendarCard({ header, title, description, href, children }: { header: ReactNode; title?: { en: string; he: string }; description?: MaybeBilingual; href: string; children?: ReactNode }) {
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>{header}</div>
      <span data-anl-link_type="topic">{title ? <TopicCard href={href} routed title={title} description={description} analyticsEvent="navto_topic" /> : <div className={styles.card} />}</span>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export interface ParashaCardData {
  displayValue?: { en: string; he: string };
  description?: MaybeBilingual;
  /** The portion's topic slug. */
  topic?: string;
  /** Its reading, as Genesis.23.1-25.18. */
  url?: string;
}

/**
 * This Week's Torah Portion: the portion's card, "Learn More about …", the reading (the weekly calendar's), Read the Portion, and
 * Browse All Torah Portions.
 *
 * @feature TOP-009 This week's Torah portion card
 */
export function ParashaCard({ parasha, reading, topicHref }: { parasha: ParashaCardData | null | undefined; reading?: { url: string; ref: { en: string; he: string } }; topicHref: (slug: string) => string }) {
  const he = useInterfaceLang() === "hebrew";
  const p = parasha ?? {};
  // the old page wrote "topics/<slug>" (relative), which /topics resolves to /topics/<slug>
  const href = topicHref(p.topic ?? "undefined");
  const learn = { en: `Learn More about ${p.displayValue?.en} ›`, he: `לקריאה נוספת על ${p.displayValue?.he} ›` };
  return (
    <div className={styles.parasha} data-anl-feature_name="Parashah">
      <CalendarCard header={<InterfaceText en="This Week’s Torah Portion" he="פרשת השבוע" />} title={p.displayValue} description={p.description} href={href}>
        <div className={styles.learnMore}>
          <Link href={href} data-anl-link_type="topic" data-anl-text={learn.en} data-anl-event="navto_topic:click">
            <InterfaceText en={learn.en} he={learn.he} />
          </Link>
        </div>
        <div className={styles.parashahLink}>
          <span data-anl-link_type="open reader" data-anl-event="navto_topic:click">
            {reading ? (
              <div className={styles.readingLink}>
                <img src="/icons/book.svg" className={styles.readingIcon} alt={he ? "סמל ספר" : "book icon"} />
                <Link href={`/${reading.url}`}>
                  <InterfaceText en={reading.ref.en} he={reading.ref.he} />
                </Link>
              </div>
            ) : null}
          </span>
        </div>
        <div className={styles.readPortion}>
          <Link href={`/${p.url}`} className={styles.blueButton} data-anl-link_type="open reader" data-anl-text="Read the Portion" data-anl-event="navto_topic:click">
            <InterfaceText en="Read the Portion" he="קראו את הפרשה" />
          </Link>
        </div>
        <div className={styles.blueLink}>
          <Link href="/topics/category/torah-portions" data-anl-link_type="category" data-anl-text="Browse All Torah Portions" data-anl-event="navto_topic:click">
            <InterfaceText en="Browse All Torah Portions" he="לרשימת כל הפרשות" />
          </Link>
        </div>
      </CalendarCard>
    </div>
  );
}

export interface SeasonalCardData {
  topic?: LandingTopic;
  secondaryTopic?: LandingTopic | null;
  /** YYYY-MM-DD (the server's ISO dates; the time zone is ignored, as the old createTimeZoneAgnosticDate). */
  start?: string | null;
  end?: string | null;
  prefix?: string | null;
  suffix?: string | null;
}

/** "November 8" or "November 8 – 10" in the language (Intl formatRange), from a date-only string read in no time zone. */
export function seasonalDateRange(start: string, end: string, lang: "en" | "he"): string {
  const d = (s: string) => {
    const [y, m, day] = s.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, day!));
  };
  return new Intl.DateTimeFormat(lang, { month: "long", day: "numeric", timeZone: "UTC" }).formatRange(d(start), d(end));
}

/**
 * On the Jewish Calendar: the seasonal topic's card and "Learn more about …"; when it has a secondary topic, the date message
 * ("<prefix> <secondary topic> <suffix>") and its date range; then Explore the Jewish Calendar. Nothing until it arrives, or without one.
 *
 * @feature TOP-010 Seasonal Jewish calendar topic card
 */
export function SeasonalCard({ seasonal, topicHref }: { seasonal: SeasonalCardData | null | undefined; topicHref: (slug: string) => string }) {
  if (!seasonal) return null; // the old card waited for its answer, and a failed one never came
  const s = seasonal;
  const href = topicHref(s.topic?.slug ?? "undefined");
  const title = s.topic?.primaryTitle;
  const learn = { en: `Learn more about ${title?.en} ›`, he: `למדו עוד על ${title?.he} ›` };
  const message = (secondary: string | undefined) => (
    <>
      {s.prefix ?? ""}{" "}
      {secondary ? (
        <Link href={href} data-anl-link_type="topic" data-anl-text={secondary} data-anl-event="navto_topic:click">
          {secondary}
        </Link>
      ) : (
        ""
      )}{" "}
      {s.suffix ?? ""}
    </>
  );
  const dated = !!s.secondaryTopic?.slug && !!s.start && !!s.end;
  const explore = "Explore the Jewish Calendar";
  return (
    <div className={styles.seasonal} data-anl-feature_name="Calendar">
      <CalendarCard header={<InterfaceText en="On the Jewish Calendar" he="מועדים קרובים בלוח השנה העברי" />} title={title} description={s.topic?.description} href={href} />
      <div className={styles.learnMore}>
        <Link href={href} data-anl-link_type="topic" data-anl-text={learn.en} data-anl-event="navto_topic:click">
          <InterfaceText en={learn.en} he={learn.he} />
        </Link>
      </div>
      <div className={styles.seasonalBottom}>
        <div className={styles.dateMessage}>
          <InterfaceText en={message(s.secondaryTopic?.primaryTitle.en)} he={message(s.secondaryTopic?.primaryTitle.he)} />
        </div>
        <div className={styles.date}>{dated ? <InterfaceText en={seasonalDateRange(s.start!, s.end!, "en")} he={seasonalDateRange(s.start!, s.end!, "he")} /> : null}</div>
        <div className={styles.blueLink}>
          <Link href="/topics/category/jewish-calendar2" data-anl-link_type="category" data-anl-text={explore} data-anl-event="navto_topic:click">
            <InterfaceText en={explore} he="לעוד מועדים בלוח השנה העברי" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export interface SearchSuggestion {
  text: string;
  categoryText: string;
  slug: string;
}

/**
 * The landing search (TopicLandingSearch, a Downshift box): "Search 5,768 Topics A-Z", suggestions after two characters with the
 * hashtag icon, the title and its category path; arrows move, Enter opens the highlighted one or the first, a click opens it. On a
 * phone, "Explore all Topics ›" under it scrolls to Browse Topics in the sidebar.
 *
 * @feature TOP-004 Topic search with autocomplete
 */
export function TopicLandingSearch({
  numOfTopics,
  suggestions,
  onInput,
  onChoose,
}: {
  numOfTopics: number | null | undefined;
  suggestions: readonly SearchSuggestion[];
  onInput: (value: string) => void;
  onChoose: (slug: string) => void;
}) {
  const he = useInterfaceLang() === "hebrew";
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  // reset when the topics listed change, not when the same list is filled in (category paths arrive after the names: a reset then
  // dropped the reader's place mid-arrowing)
  const listedSlugs = suggestions.map((s) => s.slug).join("\n");
  useEffect(() => setHighlight(-1), [listedSlugs]);
  // en-US grouping, as the old toLocaleString in an English browser
  const placeholder = he ? "חיפוש לפי נושא" : numOfTopics ? `Search ${numOfTopics.toLocaleString("en-US")} Topics A-Z` : "Search Topics A-Z";
  const shown = open && value.trim().length > 1 ? suggestions : [];
  const choose = (slug: string) => {
    setOpen(false);
    onChoose(slug);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && shown.length) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % shown.length);
    } else if (e.key === "ArrowUp" && shown.length) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? shown.length - 1 : h - 1));
    } else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      if (highlight >= 0 && shown[highlight]) choose(shown[highlight]!.slug);
      else if (shown.length) choose(shown[0]!.slug);
    }
  };
  const scrollToBrowse = () => {
    const target = document.getElementById("browseTopics");
    const header = document.querySelector("header");
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - ((header?.getBoundingClientRect().height ?? 0) + 16);
    window.scrollTo({ top: y, behavior: "smooth" });
  };
  return (
    <>
      <div className={styles.searchWrapper} data-anl-feature_name="Search">
        <div className={styles.searchContainer}>
          <div className={styles.searchInputBox}>
            <span className={styles.searchButton} aria-hidden="true">
              <img src="/icons/search_mdl.svg" alt="" />
            </span>
            <input
              className={styles.searchInput}
              id="searchInput"
              placeholder={placeholder}
              aria-label={placeholder}
              maxLength={75}
              autoComplete="off"
              role="combobox"
              aria-expanded={shown.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={highlight >= 0 && shown[highlight] ? `${listId}-${highlight}` : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setOpen(true);
                onInput(e.target.value);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className={styles.searchDropdown} role="listbox" id={listId} data-empty={shown.length ? undefined : ""}>
            {shown.map((s, i) => (
              <div
                key={s.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                className={styles.suggestion}
                data-highlighted={i === highlight ? "" : undefined}
                data-anl-link_type="topic"
                data-anl-text={s.text}
                data-anl-event="navto_topic:click"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(s.slug)}
              >
                <img alt={he ? "נושא" : "Topic"} className={styles.suggestionIcon} src="/icons/iconmonstr-hashtag-1.svg" />
                <span className={styles.suggestionTitle}>{s.text}</span>{" "}
                <span className={styles.suggestionPath}>&nbsp;{s.categoryText}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.exploreAll} role="button" tabIndex={0} onClick={scrollToBrowse} onKeyDown={(e) => (e.key === "Enter" ? scrollToBrowse() : undefined)}>
        <InterfaceText en="Explore all Topics ›" he="לדפדוף בכל הנושאים ›" />
      </div>
    </>
  );
}

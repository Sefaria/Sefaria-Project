import { Fragment, useState, type ReactNode } from "react";
import { Link } from "~/ui/Link/Link";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import {
  ACTIVITY_FILTERS,
  activityVerb,
  naturalTime,
  parseDiffHtml,
  segmentHistoryHref,
  type ActivityItem,
  type ActivityRef,
  type SegmentHistory,
} from "~/lib/activity/segment-history";
import styles from "./RevisionHistory.module.css";

export interface RevisionHistoryProps {
  history: SegmentHistory;
  lang: "en" | "he";
  /** A new filter chosen in the menu ("" for all). */
  onFilter: (type: string) => void;
  /** For the times ("3 days ago"); defaults to the clock. */
  now?: Date;
}

const RefLink = ({ r, he }: { r: ActivityRef | null | undefined; he: boolean }) =>
  !r ? null : r.url ? <Link href={r.url}>{he ? r.he : r.en}</Link> : <>{he ? r.he : r.en}</>;

const VIA_API = " (via API)";

function Diff({ html, language }: { html: string; language?: string | null }) {
  return (
    <div className={styles.text} lang={language === "he" ? "he" : "en"} dir={language === "he" ? "rtl" : "ltr"}>
      {parseDiffHtml(html).map((p, i) =>
        p.kind === "ins" ? (
          <ins key={i} className={styles.ins}>{p.text}</ins>
        ) : p.kind === "del" ? (
          <del key={i} className={styles.del}>{p.text}</del>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </div>
  );
}

function Details({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.detailsButton} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <InterfaceText en="details »" he="פרטים »" />
      </button>
      {open ? (
        <div className={styles.details}>
          New:
          <pre>{JSON.stringify(item.new, null, 1)}</pre>
          Old:
          <pre>{JSON.stringify(item.old, null, 1)}</pre>
        </div>
      ) : null}
    </>
  );
}

function VersionLine({ item, he }: { item: ActivityItem; he: boolean }) {
  const name = { en: "English", he: "Hebrew", bi: "Bilingual" }[item.language ?? ""];
  const heName = { en: "אנגלית", he: "עברית", bi: "דו לשוני" }[item.language ?? ""];
  return (
    <div className={styles.versionLine}>
      <InterfaceText en="Version" he="גרסה" />: {he ? (item.versionHe ?? item.version) : item.version} ({he ? (heName ?? "Unknown Language") : (name ?? "Unknown Language")})
    </div>
  );
}

/** One entry of the feed, as elements/activity_feed.html wrote it. */
function Entry({ item, he, now }: { item: ActivityItem; he: boolean; now?: Date }) {
  const t = item.rev_type;
  const verb = activityVerb(item);
  const user = item.user ? <Link href={item.user.profileUrl}>{item.user.name}</Link> : <InterfaceText en="Someone" he="מישהו" />;
  const via = item.method === "API" ? VIA_API : "";
  let body: ReactNode;
  if (t === "delete index") {
    body = (
      <span className={styles.topline}>
        {user} <InterfaceText en={verb.en} he={verb.he} /> <i>{he ? item.title?.he : item.title?.en}</i>.
      </span>
    );
  } else if (t === "delete text") {
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> <b><RefLink r={item.title} he={false} /></b>.
        </span>
        <VersionLine item={item} he={he} />
      </>
    );
  } else if (t.endsWith(" text")) {
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> <RefLink r={item.ref} he={he} />
          {via}
          {item.summary && item.history_url ? (
            <>
              {" "}
              <InterfaceText en="and " he="ו" />
              <Link href={item.history_url}>
                {item.updates_count} <InterfaceText en="others »" he="אחרים »" />
              </Link>
            </>
          ) : null}
        </span>
        <VersionLine item={item} he={he} />
        {item.diff_html ? <Diff html={item.diff_html} language={item.language} /> : null}
      </>
    );
  } else if (t.endsWith(" link")) {
    const gen = item.new?.generated_by;
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} />
          {item.new?.type ? ` (${String(item.new.type)})` : ""} <InterfaceText en="between" he="בין" /> <RefLink r={item.linkRefs[0]} he={he} /> <InterfaceText en="and " he="ו" />
          <RefLink r={item.linkRefs[1]} he={he} />
          {via}
        </span>
        <div className={styles.versionLine}>
          {t === "add link" && gen === "add_commentary_links" ? <InterfaceText en="(automatic commentary link)" he="(קישור אוטומטי לפירוש)" /> : null}
          {t === "add link" && gen === "add_links_from_text" ? <InterfaceText en="(automatic citation link)" he="(קישור אוטומטי לציטוט)" /> : null}
        </div>
      </>
    );
  } else if (t.endsWith(" note")) {
    const n = (k: string) => String(item.new?.[k] ?? item.old?.[k] ?? "");
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> <RefLink r={item.noteRef} he={he} />.{via}
        </span>
        <div className={styles.text}>
          {n("title")}: {n("text")}
        </div>
      </>
    );
  } else if (t.endsWith(" index") || t.endsWith(" term")) {
    const name = t.endsWith(" term") ? String(item.new?.name ?? item.old?.name ?? "") : null;
    body = (
      <span className={styles.topline}>
        {user} <InterfaceText en={verb.en} he={verb.he} /> {name ?? <RefLink r={item.title} he={he} />}.{via}
        <Details item={item} />
      </span>
    );
  } else if (t.includes("version_metadata")) {
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> <RefLink r={item.title} he={he} />.{via}
        </span>
        <div className={styles.versionLine}>
          <InterfaceText en="Version" he="גרסה" />: {item.version} ({item.language})
        </div>
      </>
    );
  } else if (t.includes("lexicon_entry")) {
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> {item.ref ? <RefLink r={item.ref} he={he} /> : String(item.new?.headword ?? item.old?.headword ?? "")}
          {via}
        </span>
        {item.diff_html ? <Diff html={item.diff_html} language={item.language} /> : null}
      </>
    );
  } else if (t.includes("review")) {
    body = (
      <>
        <span className={styles.topline}>
          {user} <InterfaceText en={verb.en} he={verb.he} /> <RefLink r={item.ref} he={he} /> .
        </span>
        <VersionLine item={item} he={he} />
        {typeof item.score === "number" ? <div className={styles.versionLine}>{"★".repeat(Math.round(item.score * 5)).padEnd(5, "☆")}</div> : null}
        {item.comment ? <div className={styles.text}>{item.comment}</div> : null}
      </>
    );
  } else if (t === "publish sheet") {
    body = (
      <span className={styles.topline}>
        {user} <InterfaceText en={verb.en} he={verb.he} />, {item.sheet ? <Link href={`/sheets/${item.sheet}`}>{`/sheets/${item.sheet}`}</Link> : null}.
      </span>
    );
  }
  return (
    <li className={styles.item}>
      {body}
      <div className={styles.time}>{naturalTime(item.date, he ? "he" : "en", now)}</div>
      {item.summary && item.history_url ? (
        <Link className={styles.small} href={item.history_url}>
          {item.updates_count} <InterfaceText en="related »" he="נוספים »" />
        </Link>
      ) : null}
    </li>
  );
}

/**
 * A text's revision history: the old templates/activity.html (single) with elements/activity_feed.html.
 *
 * @feature LEG-019 Text edit activity feed (/activity): a text's revision history
 */
export function RevisionHistory({ history, lang, onFilter, now }: RevisionHistoryProps) {
  const he = lang === "he";
  const filter = history.filterType ?? "";
  return (
    <div className={styles.page} lang={lang} dir={he ? "rtl" : "ltr"} data-revision-history="">
      <h1 className={styles.title}>
        <InterfaceText en="Revision History of " he="היסטורית עריכה " />
        <Link href={history.url}>{he ? history.heRef : history.ref}</Link>
      </h1>
      <h2 className={styles.version}>{he ? history.versionTitleInHebrew : history.version}</h2>
      <div className={styles.filter}>
        <select aria-label={he ? "סינון" : "Filter"} value={filter} onChange={(e) => onFilter(e.target.value)}>
          {ACTIVITY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {he ? f.he : f.en}
            </option>
          ))}
        </select>
      </div>
      <ul className={styles.list}>
        {history.items.length ? (
          history.items.map((item, i) => <Entry key={`${item.date}|${i}`} item={item} he={he} now={now} />)
        ) : (
          <li className={styles.empty}>
            {filter ? (
              <InterfaceText en="No matching public history items." he="לא נמצאו פרטי הסטוריה גלויה תואמים" />
            ) : (
              <InterfaceText en="No public history items." he="לא נמצאו פרטי הסטוריה גלויה" />
            )}
          </li>
        )}
      </ul>
      {history.hasMore ? (
        <Link className={styles.older} href={segmentHistoryHref(history, history.page + 1, history.filterType)}>
          <InterfaceText en="Older Activity »" he="פעילות ישנה »" />
        </Link>
      ) : null}
    </div>
  );
}

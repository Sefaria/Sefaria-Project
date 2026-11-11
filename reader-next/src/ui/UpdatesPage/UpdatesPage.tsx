import { useState, type FormEvent, type ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./UpdatesPage.module.css";

/** The About pages' list (sites/sefaria/site_settings.py ABOUT_SIDEBAR_PAGES), in its order. */
export const ABOUT_PAGES: readonly { path: string; en: string; he: string }[] = [
  { path: "about", en: "What is Sefaria?", he: "מהי ספריא" },
  { path: "team", en: "Team", he: "צוות ספריא" },
  { path: "jobs", en: "Jobs at Sefaria", he: "משרות פנויות בספריא" },
  { path: "products", en: "Sefaria's Products", he: "המוצרים של ספריא" },
  { path: "ai", en: "AI on Sefaria", he: "השימוש ב-AI בספריא" },
  { path: "supporters", en: "Our Supporters", he: "התומכים שלנו" },
  { path: "testimonials", en: "Testimonials", he: "המלצות על ספריא" },
  { path: "metrics", en: "Metrics", he: "מדדים" },
  { path: "updates", en: "New Additions", he: "עדכונים" },
  { path: "link-to-annual-report", en: "Annual Report", he: 'דו"ח שנתי' },
  { path: "terms", en: "Terms of Use", he: "תנאי שימוש" },
  { path: "privacy-policy", en: "Privacy Policy", he: "מדיניות פרטיות" },
];

/**
 * The About pages' sidebar (templates/_sidebar.html): the list of About pages, the current one on a grey chip. `href` gives each
 * page's address (the static pages are the old site's until they are ported).
 *
 * @feature STA-005 Static page serving and About sidebar
 */
export function AboutSidebar({ current, href }: { current: string; href: (path: string) => string }) {
  return (
    <nav className={styles.aboutSidebar} aria-label="About Sefaria">
      <ul>
        {ABOUT_PAGES.map((p) => (
          <li key={p.path}>
            {/* plain links: the About pages are the old site's, loaded in full */}
            <a id={p.path} href={href(`/${p.path}`)} className={p.path === current ? styles.selected : undefined} aria-current={p.path === current ? "page" : undefined}>
              <InterfaceText en={p.en} he={p.he} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface UpdatesPageProps {
  he: boolean;
  /** The About sidebar (wide screens only; a phone shows the list alone, as the old page did for a phone). */
  sidebar: ReactNode;
  /** The moderators' form, when the reader is one. */
  form?: ReactNode;
  children: ReactNode;
}

/**
 * New Additions (templates/static/updates.html with the old UpdatesPanel): the About sidebar beside the page, titled "Updates", then
 * the site's announcements.
 *
 * @feature LIB-022 New Additions to the Library page
 */
export function UpdatesPage({ he, sidebar, form, children }: UpdatesPageProps) {
  return (
    <div className={styles.page} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
      <div className={styles.sidebar}>{sidebar}</div>
      {/* not a second <main>: the shell's is the page's one */}
      <div id="updatesPage" className={styles.main}>
        <div className={styles.inner}>
          <h1 className={styles.title}>
            <InterfaceText en="Updates" he="עדכונים" />
          </h1>
          {form}
          <div className={form ? `${styles.list} ${styles.afterForm}` : styles.list}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** One announcement on the list, with the moderators' delete button (the old SingleUpdate). */
export function UpdateItem({ children, onDelete, deleteLabel }: { children: ReactNode; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <div className={styles.update}>
      {onDelete ? (
        <button type="button" className={styles.deleteButton} onClick={onDelete} aria-label={deleteLabel ?? "Delete"} title={deleteLabel ?? "Delete"}>
          <svg viewBox="0 0 1536 1536" width="14" height="14" aria-hidden="true" focusable="false">
            {/* Font Awesome 4's fa-times-circle */}
            <path fill="currentColor" d="M1097 1079q0-26-19-45l-181-181 181-181q19-19 19-45 0-27-19-46l-90-90q-19-19-46-19-26 0-45 19L716 672 535 491q-19-19-45-19-27 0-46 19l-90 90q-19 19-19 46 0 26 19 45l181 181-181 181q-19 19-19 45 0 27 19 46l90 90q19 19 46 19 26 0 45-19l181-181 181 181q19 19 45 19 27 0 46-19l90-90q19-19 19-46zm439-311q0 209-103 385.5T1153 1433t-385 103-385.5-103T103 1153.5 0 768t103-385.5T382.5 103 768 0t385 103 280 280 103 385z" />
          </svg>
        </button>
      ) : null}
      {children}
    </div>
  );
}

export type UpdateFormType = "index" | "version" | "general";
export interface UpdateFormValues {
  type: UpdateFormType;
  index: string;
  version: string;
  language: "en" | "he";
  en: string;
  he: string;
}

/**
 * The moderators' form (the old NewUpdateForm, English only as it was): the kind of update, the book (and version), and the English
 * and Hebrew descriptions. `onSubmit` answers an error line, or null when sent (the form then clears, as the old one remounted).
 */
export function UpdateForm({ onSubmit, validate, submitting }: { onSubmit: (v: UpdateFormValues) => Promise<string | null>; validate: (v: UpdateFormValues) => string | null; submitting?: boolean }) {
  const empty: UpdateFormValues = { type: "index", index: "", version: "", language: "en", en: "", he: "" };
  const [v, setV] = useState<UpdateFormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const set = <K extends keyof UpdateFormValues>(k: K, value: UpdateFormValues[K]) => {
    setV((o) => ({ ...o, [k]: value }));
    setError(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(v);
    if (problem) return setError(problem);
    const failed = await onSubmit(v);
    if (failed) return setError(failed);
    setV(empty);
    setKey((k) => k + 1);
  };
  return (
    <form key={key} className={styles.form} onSubmit={submit} lang="en" dir="ltr">
      <div role="group" aria-label="Update type">
        {(["index", "version", "general"] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="type" value={t} checked={v.type === t} onChange={() => set("type", t)} />
            {t === "index" ? "Index" : t === "version" ? "Version" : "General"}
          </label>
        ))}
      </div>
      <div>
        {v.type !== "general" ? <input type="text" placeholder="Index Title" aria-label="Index Title" onChange={(e) => set("index", e.target.value)} /> : null}
        {v.type === "version" ? <input type="text" placeholder="Version Title" aria-label="Version Title" onChange={(e) => set("version", e.target.value)} /> : null}
        {v.type === "version" ? (
          <select aria-label="Version Language" onChange={(e) => set("language", e.target.value as "en" | "he")}>
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>
        ) : null}
      </div>
      <div>
        <textarea className={styles.textarea} placeholder="English Description (optional for Index and Version)" rows={3} cols={80} onChange={(e) => set("en", e.target.value)} />
      </div>
      <div>
        <textarea className={styles.textarea} placeholder="Hebrew Description (optional for Index and Version)" rows={3} cols={80} onChange={(e) => set("he", e.target.value)} />
      </div>
      <input type="submit" value="Submit" disabled={submitting} />
      <span className={styles.error} role={error ? "alert" : undefined}>{error}</span>
    </form>
  );
}

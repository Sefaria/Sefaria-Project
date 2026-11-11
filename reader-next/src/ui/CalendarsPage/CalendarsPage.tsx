import type { ReactNode } from "react";
import type { CalendarListing } from "~/lib/library/calendars";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import { categoryColor } from "../tokens/category-color";
import styles from "./CalendarsPage.module.css";

export interface CalendarsPageProps {
  /** The cards of each section, in order (empty sections keep their heading, as the old page). */
  weeklyPortion: readonly CalendarListing[];
  daily: readonly CalendarListing[];
  weekly: readonly CalendarListing[];
  /** Shown at the top of the page on a phone (the About module), before the first heading. */
  intro?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
}

/**
 * The Learning Schedules page (/calendars): Weekly Torah Portion, Daily Learning and Weekly Learning, each a grid of schedule cards —
 * two columns where the page column is wider than 500px, one below (the old ResponsiveNBox) — beside the sidebar.
 *
 * @feature CAL-001 Learning Schedules page
 * @feature CAL-002 Calendar listing cards
 */
export function CalendarsPage({ weeklyPortion, daily, weekly, intro, sidebar, footer }: CalendarsPageProps) {
  // the old panel's analytics batch: panel 1, content language "bilingual" in the English interface and "hebrew" in the Hebrew one
  // (ReaderPanel.getContentLanguageOverride for menuOpen "calendars"; panel_type and panel_name are undefined there, so not written)
  const he = useInterfaceLang() === "hebrew";
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }} anlBatch={{ panel_number: 1, content_lang: he ? "hebrew" : "bilingual" }}>
      {/* the page's name for assistive technology: sefaria.org has an empty h1 here and nothing on screen, so neither do we */}
      <VisuallyHidden as="h1"><InterfaceText en="Learning Schedules" he="לוח לימוד יומי" /></VisuallyHidden>
      {intro}
      <Section heading={<InterfaceText en="Weekly Torah Portion" he="פרשת השבוע" />} listings={weeklyPortion} />
      <Section heading={<InterfaceText en="Daily Learning" he="לימוד יומי" />} listings={daily} />
      <Section heading={<InterfaceText en="Weekly Learning" he="לימוד שבועי" />} listings={weekly} />
    </NavPage>
  );
}

function Section({ heading, listings }: { heading: ReactNode; listings: readonly CalendarListing[] }) {
  return (
    <>
      <h2 className={styles.heading}>{heading}</h2>
      <div className={styles.grid}>
        {listings.map((l) => (
          <CalendarCard key={l.key} listing={l} />
        ))}
      </div>
    </>
  );
}

/**
 * One schedule (the old CalendarListing): a line in its category's colour, the title linking to the first reading (with "(Talmud)" /
 * "(Tanakh)" after it in the English interface), each reading with a book icon, then the description.
 */
export function CalendarCard({ listing }: { listing: CalendarListing }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <div className={styles.card} style={{ ["--_line" as string]: categoryColor(listing.category) } as React.CSSProperties} data-calendar={listing.key}>
      <Link href={listing.href} className={styles.title}>
        <InterfaceText en={listing.title.en} he={listing.title.he} />
        {/* the Hebrew strings for the subtitle are empty: the Hebrew interface shows none */}
        {listing.subtitle && !he ? <InterfaceText en={<span className={styles.subtitle}>{listing.subtitle}</span>} /> : null}
      </Link>
      <div className={styles.readings}>
        {listing.readings.map((r, i) => (
          <div className={styles.reading} key={`${i}:${r.href}`}>
            <img src="/icons/book.svg" className={styles.icon} alt={he ? "סמל ספר" : "book icon"} />
            <Link href={r.href}>
              <InterfaceText en={r.text.en} he={r.text.he} />
            </Link>
          </div>
        ))}
      </div>
      {listing.description ? (
        <div className={styles.description}>
          <InterfaceText en={listing.description.en} he={listing.description.he} />
        </div>
      ) : null}
    </div>
  );
}

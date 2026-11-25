import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import { Spinner } from "../Spinner/Spinner";
import styles from "./TorahTracker.module.css";

/** A donut's slice, its path and label already worked out (lib/torahtracker/stats.ts). */
export interface DonutSliceView {
  key: string;
  path: string;
  color: string;
  /** The hover text. */
  title: string;
  label: string;
  /** Shown under the label for a slice wide enough (the old > 0.25 radians). */
  percent?: string;
  at: [number, number];
}

export interface BarView {
  key: string;
  label: string;
  y: number;
  user: number;
  site: number;
  color: string;
}

export interface FavoriteView {
  href: string;
  en: string;
  he: string;
  color: string;
}

const DONUT = 280;
const BAR_WIDTH = 660;

/** The old CategoriesDonut: a 280px ring of the categories, each named (and its share) inside, and the chart's name under it. */
export function Donut({ slices, title }: { slices: readonly DonutSliceView[]; title: { en: string; he: string } }) {
  return (
    <div className={styles.chartWrapper}>
      <svg width={DONUT} height={DONUT} textAnchor="middle" role="img" aria-label={`${title.en}`}>
        <g transform={`translate(${DONUT / 2},${DONUT / 2})`}>
          {slices.map((s) => (
            <path key={s.key} className={styles.slice} fill={s.color} d={s.path}>
              <title>{s.title}</title>
            </path>
          ))}
          {slices.map((s) => (
            <text key={s.key} transform={`translate(${s.at[0]},${s.at[1]})`} dy="0.35em">
              <tspan x={0} y="-0.7em">{s.label}</tspan>
              {s.percent ? <tspan x={0} y="0.7em" className={styles.percent}>{s.percent}</tspan> : null}
            </text>
          ))}
        </g>
      </svg>
      <div className={styles.chartLabel}>
        <InterfaceText en={title.en} he={title.he} />
      </div>
    </div>
  );
}

/**
 * The old CategoryBars: per category, its name in capitals over a thin bar of the reader's share in the category's colour and a thick
 * grey bar of the average reader's; "Average Sefaria User" beside the first grey bar. Right to left in the Hebrew interface.
 */
export function CategoryBars({ bars, height, he, averageLabel }: { bars: readonly BarView[]; height: number; he: boolean; averageLabel: string }) {
  const at = (w: number) => (he ? BAR_WIDTH - w : 0);
  const first = bars[0];
  return (
    <div className={styles.chartWrapper}>
      <svg width={BAR_WIDTH} height={height} textAnchor="middle" role="img" aria-label={averageLabel}>
        <g>
          {bars.map((b) => (
            <g key={b.key} transform={`translate(0, ${b.y})`}>
              <text className={he ? styles.barLabelHe : styles.barLabel} textAnchor="start" x={he ? BAR_WIDTH : undefined} letterSpacing={he ? undefined : 1.5} fontSize={16}>
                {b.label}
              </text>
              <rect className={styles.userBar} x={at(b.user)} y={10} width={b.user} height={5} fill={b.color} />
              <rect className={styles.siteBar} x={at(b.site)} y={15.05} width={b.site} height={34} />
              {b === first ? (
                <text y={38.05} x={he ? BAR_WIDTH - (b.site > 250 ? b.site - 20 : b.site + 20) : b.site > 250 ? b.site - 20 : b.site + 20} fontSize={16} className={styles.percent} textAnchor={b.site > 250 ? "end" : "start"}>
                  {averageLabel}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function StatsHeading({ en, he }: { en: string; he: string }) {
  return (
    <h2 className={styles.h2}>
      <InterfaceText en={en} he={he} />
    </h2>
  );
}

/** The old StatCard: an icon, the number and its name. */
export function StatCard({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className={styles.statcardRow}>
      <div className={styles.statcard}>
        <img src={icon} alt={label} />
        <div className={styles.statcardValue}>{value}</div>
        <div className={styles.statcardLabel}>{label}</div>
      </div>
    </div>
  );
}

export function ChartRow({ children, centered }: { children: ReactNode; centered?: boolean }) {
  return <div className={centered ? `${styles.chartRow} ${styles.centered}` : styles.chartRow}>{children}</div>;
}

/** The old "we haven't seen you in a while" line over the site's numbers. */
export function SiteHeader() {
  return (
    <ChartRow centered>
      <div className={styles.statHeader}>
        <InterfaceText
          en={<>Looks like we haven’t seen you in a while!<br />Discover what other people are doing on Sefaria...</>}
          he={<>מזמן לא התראינו!<br />בואו ונראה מה משתמשים אחרים בספריא לומדים</>}
        />
      </div>
    </ChartRow>
  );
}

/** The old "Your Favorite Texts": the reader's most-read passages, three to a row, each a card topped in its book's colour. */
export function Favorites({ items }: { items: readonly FavoriteView[] }) {
  const rows: (FavoriteView | null)[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    const row: (FavoriteView | null)[] = items.slice(i, i + 3);
    while (row.length < 3) row.push(null);
    rows.push(row);
  }
  return (
    <div>
      <StatsHeading en="Your Favorite Texts" he="טקסטים מועדפים" />
      <div className={styles.gridBox}>
        {rows.map((row, i) => (
          <div key={i} className={styles.gridBoxRow}>
            {row.map((f, j) => (
              <div key={j} className={f ? styles.gridBoxItem : `${styles.gridBoxItem} ${styles.placeholder}`}>
                {f ? (
                  <Link href={f.href} className={styles.blockLink} style={{ borderColor: f.color }}>
                    <InterfaceText en={f.en} he={f.he} />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface TorahTrackerPageProps {
  he: boolean;
  /** The reader's name, or undefined while the numbers load (the old spinner in its place). */
  name?: string;
  modes: readonly { key: string; en: string; he: string }[];
  mode: string;
  onMode: (key: string) => void;
  /** Moderators: look at another reader's numbers. */
  chooser?: ReactNode;
  children?: ReactNode;
}

/**
 * Torah Tracker (the old UserStats): the reader's name, Previous Year / All Time, then their activity, reading by category against the
 * average reader's, their top categories and favourite texts — or, for a reader who has read little in the period, the site's.
 *
 * @feature PRO-010 Torah Tracker user stats
 */
export function TorahTrackerPage({ he, name, modes, mode, onMode, chooser, children }: TorahTrackerPageProps) {
  return (
    <div className={styles.page} lang={he ? "he" : "en"} dir={he ? "rtl" : "ltr"}>
      <div className={styles.content}>
        <div className={styles.inner}>
          <h1 className={styles.h1}>{name !== undefined ? <LangText lang={/[֐-׿]/.test(name) ? "he" : "en"}>{name}</LangText> : <Spinner />}</h1>
          {chooser}
          <div className={styles.modeChooser} role="group">
            {modes.map((m) => (
              <button key={m.key} type="button" className={m.key === mode ? `${styles.modeButton} ${styles.active}` : styles.modeButton} aria-pressed={m.key === mode} aria-label={`Switch to ${m.en} mode`} onClick={() => onMode(m.key)}>
                <span>
                  <InterfaceText en={m.en} he={m.he} />
                </span>
              </button>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The moderators' "User ID:" box (the old UserChooser). */
export function UserChooser({ onChange }: { onChange: (uid: number | null) => void }) {
  return (
    <div className={styles.userChooser}>
      <label>
        <InterfaceText en=" User ID: " he=" מספר משתמש: " />
        <input type="text" onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? n : null);
        }} />
      </label>
    </div>
  );
}

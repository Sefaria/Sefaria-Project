import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useViewer } from "~/features/auth/viewer";
import { tocQueryOptions, isCategory, type TocNode } from "~/lib/catalog/toc";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { refToUrl } from "~/lib/ref/url";
import { STATS_MODES, arcCentroid, arcPath, categoryBars, donutSlices, siteStatsQuery, statsView, userStatsQuery, type StatsMode } from "~/lib/torahtracker/stats";
import { bookColor, categoryColor } from "~/ui/tokens/category-color";
import { CategoryBars, ChartRow, Donut, Favorites, SiteHeader, StatCard, StatsHeading, TorahTrackerPage, UserChooser, type DonutSliceView } from "~/ui/TorahTracker/TorahTracker";

/** The page's head (reader/views.py user_stats: get_page_title("User Stats", module=library)). */
export const TORAH_TRACKER_HEAD = { title: "User Stats | Sefaria Library" };
/** The tab title the old app set once it had loaded (ReaderApp: getPageTitle("user_stats.torah_tracker")). */
const CLIENT_TITLE = { english: "Torah Tracker | Sefaria Library", hebrew: "לימוד במספרים | ספריית ספריא" } as const;

const DONUT_SIZE = 280;
const RING = { inner: DONUT_SIZE / 2 - 10, outer: DONUT_SIZE / 2 - 1, label: (DONUT_SIZE / 2) * 0.75 };

/** Top category → its Hebrew name (the old Sefaria._(category)). */
function hebrewCategories(tree: readonly TocNode[] | undefined): Map<string, string> {
  return new Map((tree ?? []).filter(isCategory).map((c) => [c.category, c.heCategory]));
}

/**
 * `/torahtracker`: the signed-in reader's Torah Tracker (account menu), so the reader stays in this client. The numbers come from
 * Django's user_stats and site_stats APIs; the charts are drawn here as the old d3 code drew them.
 *
 * @feature PRO-010 Torah Tracker user stats
 */
export function TorahTrackerRoute() {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const viewer = useViewer();
  const [mode, setMode] = useState<StatsMode>("currently");
  // a moderator may look at another reader (the old UserChooser, half a second after typing)
  const [typed, setTyped] = useState<number | null>(null);
  const [other, setOther] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setOther(typed), 500);
    return () => clearTimeout(t);
  }, [typed]);
  const uid = other ?? viewer?.id ?? null;
  const user = useQuery(userStatsQuery(uid)).data;
  const site = useQuery(siteStatsQuery()).data;
  const catalog = useQuery(tocQueryOptions()).data;
  const heCats = useMemo(() => hebrewCategories(catalog?.tree), [catalog]);

  useEffect(() => {
    document.title = CLIENT_TITLE[he ? "hebrew" : "english"];
  }, [he]);

  const view = statsView(user, site, mode);
  const catName = (c: string) => (c === "Etc" ? (he ? "שאר" : "Etc") : he ? heCats.get(c) ?? c : c);
  const donut = (cats: Record<string, number>): DonutSliceView[] => {
    const slices = donutSlices(cats);
    const total = slices.reduce((a, s) => a + s.value, 0);
    return slices.map((s) => ({
      key: s.name,
      path: arcPath(RING.inner, RING.outer, s.startAngle, s.endAngle),
      color: categoryColor(s.name),
      // the old hover text gave the count as a percentage (4500 → "450,000.00%"): the share here
      title: `${s.name}: ${(total ? s.value / total : 0).toLocaleString(undefined, { style: "percent", minimumFractionDigits: 2 })}`,
      label: catName(s.name),
      percent: s.endAngle - s.startAngle > 0.25 ? (s.value / total).toLocaleString(undefined, { style: "percent" }) : undefined,
      at: arcCentroid(RING.label, RING.label, s.startAngle, s.endAngle),
    }));
  };
  const bars = (userCats: Record<string, number>, siteCats: Record<string, number>) => {
    const { height, bars: b } = categoryBars(userCats, siteCats);
    return (
      <CategoryBars
        he={he}
        height={height}
        averageLabel={he ? "משתמש ממוצע בספריא" : "Average Sefaria User"}
        bars={b.map((x) => ({ key: x.cat, label: he ? catName(x.cat) : x.cat.toUpperCase(), y: x.y, user: x.user, site: x.site, color: categoryColor(x.cat) }))}
      />
    );
  };
  const average = { en: "Average Sefaria User", he: "משתמש ממוצע בספריא" };

  let body = null;
  if (view && view.active) {
    body = (
      <div>
        <div>
          <StatsHeading en="Your Overall Activity" he="הפעילות שלך במבט" />
          <StatCard icon="/icons/book-icon-black.svg" value={view.user.textsRead} label={he ? "ספרים שנקראו" : "Texts Read"} />
        </div>
        <div>
          <StatsHeading en="Your Reading by Category" he="לימוד לפי סוגה" />
          <ChartRow>
            <Donut slices={donut(view.user.categoriesRead)} title={{ en: "Your Reading", he: "הלימוד שלך" }} />
            <Donut slices={donut(view.site.categoriesRead)} title={average} />
          </ChartRow>
        </div>
        <div>
          <StatsHeading en="Your Top Categories" he="מצעד סוגות הלימוד" />
          <ChartRow>{bars(view.user.categoriesRead, view.site.categoriesRead)}</ChartRow>
        </div>
        {view.user.mostViewedRefs.length ? (
          <Favorites
            items={view.user.mostViewedRefs.map((r) => ({ href: `/${refToUrl(r.en)}`, en: r.en, he: r.he, color: bookColor(catalog?.books.get(r.book)) }))}
          />
        ) : null}
      </div>
    );
  } else if (view) {
    body = (
      <div>
        <SiteHeader />
        <div>
          <StatsHeading en="What People are Reading" he="מה אנשים קוראים" />
          <ChartRow centered>
            <Donut slices={donut(view.site.categoriesRead)} title={average} />
          </ChartRow>
        </div>
        <div>
          <StatsHeading en="Top Categories" he="קטגוריות פופולריות" />
          <ChartRow>{bars(view.site.categoriesRead, view.site.categoriesRead)}</ChartRow>
        </div>
      </div>
    );
  }

  return (
    <TorahTrackerPage
      he={he}
      name={view ? user?.name ?? "" : undefined}
      modes={STATS_MODES}
      mode={mode}
      onMode={(m) => setMode(m as StatsMode)}
      chooser={viewer?.isStaff ? <UserChooser onChange={setTyped} /> : undefined}
    >
      {body}
    </TorahTrackerPage>
  );
}

import { useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { hebrewCategoryNames, tocItemsByCategories, tocObjectByCategories, withDefaultCorpus } from "~/lib/library/category-model";
import { CategoryPage } from "~/ui/CategoryPage/CategoryPage";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { LibraryHome } from "~/ui/LibraryHome/LibraryHome";
import { AboutSefaria, AboutTextCategory, DafYomi, LearningSchedules, Resources, SidebarFooter, SupportSefaria, Translations, Visualizations, WeeklyTorahPortion } from "~/ui/NavSidebar/NavSidebar";
import { useReaderSettings } from "../reader/settings-context";

/**
 * `/texts` and `/texts/<category>/…`: the library's home and category pages, from the catalog the loader filled. An unknown
 * path shows the home page, as the old server did.
 *
 * @feature LIB-001 Browse the Library category grid
 * @feature LIB-008 Category page contents list
 * @feature LIB-069 Library category URL handling (server)
 */
export function LibraryRoute({ path }: { path: string[] }) {
  // the page's slice of the catalog, not all of it (R-14): what the server put in the page, or what the loader derived here
  const queryClient = useQueryClient();
  const tree = useQuery(catalogSliceQueryOptions(queryClient, path)).data;
  const catalog = useMemo(() => (tree ? { tree } : undefined), [tree]);
  // the whole catalog, once the page is idle: the next library page then needs no 3.5 MB download (and it is kept on disk)
  useEffect(() => {
    const idle = "requestIdleCallback" in window ? window.requestIdleCallback : (f: () => void) => setTimeout(f, 2000);
    idle(() => void queryClient.prefetchQuery(tocQueryOptions()));
  }, [queryClient]);
  const { diaspora } = useRouteContext({ from: "__root__" });
  const calendars = useQuery(calendarsQueryOptions(diaspora)).data;
  const { settings } = useReaderSettings();
  const names = useMemo(() => (catalog ? hebrewCategoryNames(catalog.tree) : new Map<string, string>()), [catalog]);
  if (!catalog) return <LoadingState />;
  const he = (c: string) => names.get(c) ?? c;
  const cats = withDefaultCorpus(path);
  const obj = path.length ? tocObjectByCategories(catalog.tree, cats) : undefined;
  const footer = <SidebarFooter />;

  if (!path.length || !obj) {
    return (
      <LibraryHome
        tree={catalog.tree}
        footer={footer}
        sidebar={
          <>
            <AboutSefaria />
            <Translations />
            <LearningSchedules items={calendars} />
            <Resources />
          </>
        }
      />
    );
  }
  // For Talmud/Bavli the About module is Talmud's (the toggle makes Bavli a view of it)
  const aboutCats = cats[0] === "Talmud" && cats.length === 2 ? ["Talmud"] : path; // as the old page: the original path, so /texts/Tosefta is "About Tosefta" and its Lieberman edition its own
  const about = tocObjectByCategories(catalog.tree, aboutCats) ?? obj;
  const key = cats.join("|");
  return (
    <CategoryPage
      cats={cats}
      contents={tocItemsByCategories(catalog.tree, cats)}
      he={he}
      hebrewContent={settings.language === "hebrew"}
      footer={footer}
      sidebar={
        <>
          <AboutTextCategory category={about.category} heCategory={about.heCategory} enDesc={about.enDesc} heDesc={about.heDesc} />
          {key === "Tanakh" ? <WeeklyTorahPortion items={calendars} /> : null}
          {key === "Talmud|Bavli" ? <DafYomi items={calendars} /> : null}
          <Visualizations categories={cats} />
          <SupportSefaria />
        </>
      }
    />
  );
}

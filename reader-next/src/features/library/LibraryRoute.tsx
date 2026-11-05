import { useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useViewer } from "~/features/auth/viewer";
import { childTitle, deleteCategory, saveCategory, saveTopLevelOrder, type CategoryDraft } from "~/lib/catalog/category-editor";
import { CategoryEditor, ReorderEditor } from "~/ui/CategoryEditor/CategoryEditor";
import type { PageAdmin } from "~/ui/AdminButtons/AdminButtons";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { catalogSliceQueryOptions } from "~/lib/library/catalog-slice";
import { calendarsQueryOptions } from "~/lib/library/calendars";
import { hebrewCategoryNames, tocItemsByCategories, tocObjectByCategories, withDefaultCorpus } from "~/lib/library/category-model";
import { CategoryPage } from "~/ui/CategoryPage/CategoryPage";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { LibraryHome } from "~/ui/LibraryHome/LibraryHome";
import { AboutSefaria, AboutTextCategory, DafYomi, LearningSchedules, PromoSlot, Resources, SidebarFooter, SupportSefaria, Translations, Visualizations, WeeklyTorahPortion } from "~/ui/NavSidebar/NavSidebar";
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
  // moderators: the old CategoryHeader tools (Add Category / Reorder at /texts; Add sub-category / Edit on a category page)
  const viewer = useViewer();
  const staff = !!viewer?.isStaff;
  const [editor, setEditor] = useState<null | "add" | "edit" | "reorder">(null);
  useEffect(() => setEditor(null), [path.join("/")]);
  const fullTree = useQuery({ ...tocQueryOptions(), select: (t) => t, enabled: staff && !!editor }).data;
  if (!catalog) return <LoadingState />;
  // after a change the catalog everyone caches is stale: drop it, then go where the old editors went
  const done = async (to: string) => {
    await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    window.location.assign(to);
  };
  const categoryEditor = (draft: CategoryDraft, isNew: boolean, origTitle: string, origPath: string[]) =>
    fullTree ? (
      <CategoryEditor
        initial={draft}
        isNew={isNew}
        tree={fullTree}
        onClose={() => setEditor(null)}
        onSave={async (d) => {
          await saveCategory({ enTitle: origTitle, path: origPath, children: draft.children }, d);
          await done(`/texts/${[...d.path, d.enTitle].map(encodeURIComponent).join("/")}`);
        }}
        onDelete={async () => {
          await deleteCategory([...origPath, origTitle]);
          await done("/texts");
        }}
      />
    ) : (
      <LoadingState />
    );
  const blank = (parent: string[]): CategoryDraft => ({ enTitle: "", heTitle: "", enDescription: "", heDescription: "", enShortDescription: "", heShortDescription: "", isPrimary: false, path: parent, children: [] });
  const he = (c: string) => names.get(c) ?? c;
  const cats = withDefaultCorpus(path);
  const obj = path.length ? tocObjectByCategories(catalog.tree, cats) : undefined;
  const footer = <SidebarFooter />;

  if (!path.length || !obj) {
    return (
      <LibraryHome
        tree={catalog.tree}
        footer={footer}
        admin={
          staff
            ? ({
                buttons: [
                  { en: "Add Category", he: "הוספת קטגוריה", onClick: () => setEditor("add") },
                  { en: "Reorder", he: "סידור מחדש", onClick: () => setEditor("reorder") },
                ],
                editor:
                  editor === "add" ? categoryEditor(blank([]), true, "", []) :
                  editor === "reorder" ? (fullTree ? (
                    <ReorderEditor
                      initial={fullTree.map(childTitle)}
                      onClose={() => setEditor(null)}
                      onSave={async (order) => {
                        await saveTopLevelOrder(order);
                        await done("/texts");
                      }}
                    />
                  ) : <LoadingState />) : undefined,
              } satisfies PageAdmin)
            : undefined
        }
        sidebar={
          <>
            <AboutSefaria wideOnly />
            <PromoSlot />
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
      admin={
        staff
          ? ({
              buttons: [
                { en: "Add sub-category", he: "הוספת תת-קטגוריה", onClick: () => setEditor("add") },
                { en: "Edit", he: "עריכה", onClick: () => setEditor("edit") },
              ],
              editor:
                editor === "add" ? categoryEditor(blank(cats), true, "", cats) :
                editor === "edit"
                  ? categoryEditor(
                      {
                        enTitle: obj.category,
                        heTitle: obj.heCategory,
                        enDescription: obj.enDesc ?? "",
                        heDescription: obj.heDesc ?? "",
                        enShortDescription: obj.enShortDesc ?? "",
                        heShortDescription: obj.heShortDesc ?? "",
                        isPrimary: !!obj.isPrimary,
                        path: cats.slice(0, -1),
                        children: tocItemsByCategories(catalog.tree, cats).map(childTitle),
                      },
                      false,
                      obj.category,
                      cats.slice(0, -1),
                    )
                  : undefined,
            } satisfies PageAdmin)
          : undefined
      }
      contents={tocItemsByCategories(catalog.tree, cats)}
      he={he}
      hebrewContent={settings.language === "hebrew"}
      footer={footer}
      description={{ en: obj.enDesc ?? "", he: obj.heDesc ?? "" }} // the old page: tocObjectByCategories(cats), Talmud already its Bavli
      sidebar={
        <>
          <AboutTextCategory wideOnly category={about.category} heCategory={about.heCategory} enDesc={about.enDesc} heDesc={about.heDesc} />
          {key === "Tanakh" ? <WeeklyTorahPortion items={calendars} /> : null}
          {key === "Talmud|Bavli" ? <DafYomi items={calendars} /> : null}
          <PromoSlot />
          <Visualizations categories={cats} />
          <SupportSefaria />
        </>
      }
    />
  );
}

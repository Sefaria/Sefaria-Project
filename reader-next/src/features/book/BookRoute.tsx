import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { categoryAttribution, categoryHref, primaryCategory } from "~/lib/book/book-page";
import { indexDetailsQueryOptions } from "~/lib/catalog/index-details";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { categoryLabel } from "~/lib/connections/terms";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { lastPlace } from "~/lib/reader/last-place";
import { encodeVtitle } from "~/lib/reader/url-state";
import { useViewer } from "~/features/auth/viewer";
import { refToUrl } from "~/lib/ref/url";
import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import { bookVersionsQueryOptions } from "~/lib/versions/book-versions";
import type { VersionMeta } from "~/lib/text/model";
import { BookPage, type BookTab } from "~/ui/BookPage/BookPage";
import { DownloadVersions } from "~/ui/DownloadVersions/DownloadVersions";
import { RelatedTopics } from "~/ui/RelatedTopics/RelatedTopics";
import { aboutTextMeta } from "~/lib/book/about-text";
import { TocView } from "~/ui/TocView/TocView";
import { DictionarySearch } from "~/ui/DictionarySearch/DictionarySearch";
import { useDictionarySearch } from "../shared/useDictionarySearch";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SITE_ORIGIN } from "~/lib/config";
import { deleteVersion, saveVersionFlags, versionDraft, versionFlagsPayload } from "~/lib/versions/admin";
import { LICENSE_NAMES } from "~/lib/versions/translations";
import { VersionEditForm } from "~/ui/VersionEditForm/VersionEditForm";
import { IndexEditor } from "~/ui/IndexEditor/IndexEditor";
import { deleteIndex, ensureCollectiveTerm, indexDraft, markdownLinkTargets, pollTask, saveIndex, type EditableIndex } from "~/lib/book/index-editor";
import { nameQueryOptions } from "~/lib/search/autocomplete";

type Details = NonNullable<ReturnType<typeof indexDetailsQueryOptions>["queryFn"]> extends never ? never : Awaited<ReturnType<NonNullable<ReturnType<typeof indexDetailsQueryOptions>["queryFn"]>>>;

/**
 * The route for `/<Book>`: the book's page, from the library cache the loader filled.
 *
 * @feature BOK-001 Book page (text table of contents)
 */
export function BookRoute({ title }: { title: string }) {
  const lang = useInterfaceLang();
  const search = useSearch({ strict: false }) as { tab?: BookTab };
  const navigate = useNavigate();
  const details = useQuery(indexDetailsQueryOptions(title)).data as (Details & { schema?: unknown; firstSectionRef?: string; dedication?: { en?: string; he?: string }; dependence?: string; lexiconName?: string; heTitle?: string }) | undefined;
  const versions = useQuery(bookVersionsQueryOptions(title)).data as VersionMeta[] | undefined;
  const catalog = useQuery(tocQueryOptions()).data;
  // "Continue Reading" is known only in the browser, after mount: the server renders "Start Reading"
  const [resume, setResume] = useState<string>();
  const viewer = useViewer();
  const viewerId = viewer?.id ?? null;
  const qc = useQueryClient();
  const [editingIndex, setEditingIndex] = useState(false);
  const catalogTree = useQuery({ ...tocQueryOptions(), select: (tree) => tree }).data;
  useEffect(() => setResume(lastPlace(title, viewerId)), [title, viewerId]);
  const structures = useMemo(() => (details?.schema ? tocStructures({ ...(details as unknown as TocIndexRecord), title: details.title }) : []), [details]);
  const dict = useDictionarySearch({ lexiconName: details?.lexiconName, title: details?.title, open: (ref) => void navigate({ to: `/${refToUrl(ref)}` as never }) });
  if (!details) return <LoadingState />;

  const first = details.firstSectionRef ?? details.title;
  const cat = primaryCategory(details.categories, details.dependence);
  const label = categoryLabel(cat, catalog);
  const tab: BookTab = search.tab === "versions" ? "versions" : "contents";
  const bookUrl = `/${refToUrl(details.title)}`;
  return (
    <BookPage
      title={{ en: details.title, he: details.heTitle ?? details.title }}
      category={{ ...label, href: categoryHref(details.categories, details.dependence) }}
      attribution={categoryAttribution(details.categories)}
      dedication={details.dedication}
      colorCategory={details.categories[0]}
      readHref={`/${refToUrl(resume ?? first)}`}
      continueReading={Boolean(resume)}
      tab={tab}
      tabHref={(t) => `${bookUrl}?tab=${t}`}
      onTab={(t) => void navigate({ to: `/${refToUrl(details.title)}` as never, search: { tab: t } as never, replace: true })}
      contents={
        <>
          {details.lexiconName ? <div style={{ marginBlockEnd: 24 }}><DictionarySearch getCompletions={dict.getCompletions} onSubmit={dict.openEntry} /></div> : null}
          <TocView structures={structures} variant="page" />
        </>
      }
      versions={versions}
      versionHref={(v) => `/${refToUrl(first)}?${v.isPrimary ? "vhe" : "ven"}=${v.languageFamilyName}|${encodeVtitle(v.versionTitle)}`}
      // moderators: the pencil on each version (the old VersionBlock editor, book page only)
      editVersion={
        viewer?.isStaff
          ? (v, close) => (
              <VersionEditForm
                initial={versionDraft(v)}
                licenses={LICENSE_NAMES}
                onClose={close}
                onSave={async (draft) => {
                  await saveVersionFlags(details.title, v, versionFlagsPayload(v, draft));
                  // the old editor reloaded the page; the versions list is read again instead
                  await qc.invalidateQueries({ queryKey: bookVersionsQueryOptions(details.title).queryKey });
                  close();
                }}
                onDelete={async () => {
                  await deleteVersion(details.title, v);
                  window.alert("Text Version Deleted.");
                  await qc.invalidateQueries({ queryKey: bookVersionsQueryOptions(details.title).queryKey });
                  close();
                }}
              />
            )
          : undefined
      }
      admin={
        viewer?.isStaff
          ? {
              addSectionHref: `${SITE_ORIGIN}/add/${refToUrl(details.title)}`,
              onEdit: () => setEditingIndex(true),
              editor:
                editingIndex && catalogTree ? (
                  <IndexEditor
                    initial={indexDraft(details as unknown as EditableIndex)}
                    tree={catalogTree}
                    isBook={(t) => !!catalog?.books.has(t)}
                    findAuthor={async (name) => {
                      // addAuthor: an AuthorTopic whose title matches exactly
                      const d = await qc.fetchQuery(nameQueryOptions(name, ["AuthorTopic"], null));
                      const matches = (d.completion_objects ?? []).filter((c) => c.type === "AuthorTopic");
                      const exact = matches.find((c) => c.title.toLowerCase() === name.toLowerCase());
                      if (exact) return { name: exact.title, slug: String(exact.key) };
                      const closest = matches.length ? ` The closest match(es) found were: ${matches.map((c) => c.title).join(", ")}` : "";
                      return `Invalid author.  Make sure it is listed under the 'Authors' category in the Topic Table of Contents.${closest}`;
                    }}
                    confirmLinks={async (md) => {
                      // validateMarkdownLinks: a link the name API doesn't know is kept only if the moderator says so
                      for (const url of markdownLinkTargets(md)) {
                        const name = url.split("/").slice(-1)[0] ?? "";
                        const d = await qc.fetchQuery(nameQueryOptions(name, url.startsWith("/topics") ? ["Topic"] : undefined, null)).catch(() => null);
                        if (d?.is_ref) continue;
                        const keys = (d?.completion_objects ?? []).flatMap((c) => (Array.isArray(c.key) ? c.key : [c.key]));
                        if (!keys.includes(name) && !window.confirm(`${name} not found in Sefaria database.  Please confirm that you meant to write '${url}' in the description.`)) return false;
                      }
                      return true;
                    }}
                    onClose={() => setEditingIndex(false)}
                    onSave={async (draft, progress) => {
                      const termError = await ensureCollectiveTerm(draft);
                      if (termError) throw new Error(termError);
                      const result = await saveIndex(details as unknown as EditableIndex, draft);
                      let finalTitle = draft.title;
                      if (result.kind === "task") {
                        const suffix = " (Page will automatically refresh when complete. It will still complete even if you navigate away from this page although you won't be able to track progress.)";
                        progress("Title change queued — processing in background..." + suffix);
                        const done = await pollTask(result.taskId, (step) => progress(step + suffix)).catch((e: Error) => {
                          throw new Error("Title change failed: " + e.message);
                        });
                        finalTitle = done.title ?? finalTitle;
                        window.alert("Title change complete.");
                      } else {
                        window.alert("Text information saved.");
                      }
                      // Django's reset refreshes the caches, then comes back to the book
                      window.location.assign(`${SITE_ORIGIN}/admin/reset/${encodeURIComponent(finalTitle)}`);
                    }}
                    onDelete={async () => {
                      await deleteIndex(details.title);
                      window.location.assign("/texts");
                    }}
                  />
                ) : undefined,
            }
          : undefined
      }
      meta={aboutTextMeta(details)}
      description={{ en: details.enDesc, he: details.heDesc }}
      sidebar={
        <>
          <RelatedTopics topics={details.relatedTopics ?? []} topicHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`} />
          {details.lexiconName ? null : <DownloadVersions title={details.title} versions={(versions ?? []) as never} />}
        </>
      }
    />
  );
  void lang;
}

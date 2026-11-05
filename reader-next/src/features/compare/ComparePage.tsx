/**
 * The version-diff page (/compare/<ref>/<he|en>/<v1>/<v2>), sefaria.org's diffPage bundle (static/js/diff_page.jsx) on this client:
 * the same bare page, form, tables and moderator "Apply Change", with the address read and written byte for byte as the old page.
 * The old page reloaded itself on every change of the form; here the router moves to the new address.
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 * @feature RTE-019 Version compare tool URL
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { viewerQuery } from "~/features/auth/viewer";
import { applyChange, diffSegments } from "~/lib/compare/diff";
import { compareSetupQueryOptions, postSegmentText, sectionTextQueryOptions, versionTitlesFor } from "~/lib/compare/queries";
import { comparePath, type CompareAddress, type CompareLang } from "~/lib/compare/url";
import { versionsQueryOptions } from "~/lib/versions/book-versions";
import { CompareForm, DiffTable, NextChapterButton, VersionDiffPage, type CompareFormValues, type DiffRowModel } from "~/ui/VersionDiff/VersionDiff";

const NOT_SIGNED_IN = "Not signed in. You must be signed in as a Sefaria Moderator to use this feature.";
const NOT_MODERATOR = "Only Sefaria Moderators Can Edit Texts";

export function ComparePage({ address }: { address: CompareAddress }) {
  const router = useRouter();
  const setup = useQuery(compareSetupQueryOptions(address.compRef)).data ?? { secRef: "", refArray: null, nextChapter: null };

  // the filter checkboxes act on "Update" (compare.html's add_filter)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());

  const go = useCallback((s: { secRef: string | null; lang: string | null; v1: string | null; v2: string | null }) => void router.navigate({ href: comparePath(s) }), [router]);

  const showTables = !!(address.lang && address.v1 && address.v2);
  const refs = setup.refArray ?? [setup.secRef];

  return (
    <VersionDiffPage
      checked={checked}
      onFilterToggle={(v, on) =>
        setChecked((c) => {
          const n = new Set(c);
          if (on) n.add(v);
          else n.delete(v);
          return n;
        })
      }
      onFilterUpdate={() => setApplied(new Set(checked))}
    >
      <CompareFormContainer key={`${setup.secRef}|${address.lang}|${address.v1}|${address.v2}`} setup={setup} address={address} go={go} />
      {showTables ? refs.map((ref, i) => <CompareTable key={`${i}:${ref}`} secRef={ref} lang={address.lang!} v1={address.v1!} v2={address.v2!} filters={applied} />) : null}
      {setup.nextChapter ? <NextChapterButton onClick={() => go({ secRef: setup.nextChapter, lang: address.lang, v1: address.v1, v2: address.v2 })} /> : null}
    </VersionDiffPage>
  );
}

/** The old DataForm: its own state, the versions of the ref typed in the language chosen, and a new address on "Load Diff". */
function CompareFormContainer({ setup, address, go }: { setup: { secRef: string }; address: CompareAddress; go: (s: { secRef: string; lang: string; v1: string; v2: string }) => void }) {
  const [values, setValues] = useState<CompareFormValues>({ secRef: setup.secRef, lang: address.lang ?? "he", v1: address.v1 ?? "", v2: address.v2 ?? "" });
  // the versions follow what is typed (asked once typing pauses)
  const [lookupRef, setLookupRef] = useState(values.secRef);
  useEffect(() => {
    if (values.secRef === lookupRef) return;
    const t = setTimeout(() => setLookupRef(values.secRef), 300);
    return () => clearTimeout(t);
  }, [values.secRef, lookupRef]);
  const versions = useQuery({ ...versionsQueryOptions(lookupRef.trim()), enabled: !!lookupRef.trim(), retry: false, placeholderData: keepPreviousData });
  const options = lookupRef.trim() && versions.data && !versions.isError ? versionTitlesFor(versions.data, values.lang) : null;
  return (
    <CompareForm
      values={values}
      versionOptions={options}
      onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
      onSubmit={() => {
        // PageLoader.componentDidUpdate: a new address only when something differs from the page's own
        if (values.secRef !== setup.secRef || values.lang !== address.lang || values.v1 !== address.v1 || values.v2 !== address.v2) go(values);
      }}
    />
  );
}

/** One section's table: both versions' texts, diffed segment by segment; moderators apply a change through the old API. */
function CompareTable({ secRef, lang, v1, v2, filters }: { secRef: string; lang: CompareLang; v1: string; v2: string; filters: ReadonlySet<string> }) {
  const queryClient = useQueryClient();
  const [t1, t2] = useQueries({ queries: [v1, v2].map((v) => ({ ...sectionTextQueryOptions(secRef, lang, v), enabled: !!secRef })) });
  const [reloading, setReloading] = useState<ReadonlySet<string>>(new Set());
  const posting = useRef(new Set<string>());

  const diffs = useMemo(() => {
    if (!t1?.data || !t2?.data) return null;
    const n = Math.max(t1.data.length, t2.data.length);
    return Array.from({ length: n }, (_, i) => ({ segRef: `${secRef}:${i + 1}`, ...diffSegments(t1.data[i] ?? "", t2.data[i] ?? "") }));
  }, [t1?.data, t2?.data, secRef]);

  const rows: DiffRowModel[] | null = diffs ? diffs.map((d) => (reloading.has(d.segRef) ? { segRef: d.segRef, v1: null, v2: null } : { segRef: d.segRef, v1: d.v1, v2: d.v2 })) : null;

  const canEdit = useCallback(async () => {
    // asked at the click, as the old page read its globals then (a session may have ended since the page loaded)
    const viewer = await queryClient.fetchQuery({ ...viewerQuery, staleTime: 0 }).catch(() => null);
    if (viewer?.isStaff) return true;
    window.alert(viewer ? NOT_MODERATOR : NOT_SIGNED_IN);
    return false;
  }, [queryClient]);

  const apply = useCallback(
    async (segRef: string, side: "v1" | "v2", index: number, replacement: string) => {
      const d = diffs?.find((x) => x.segRef === segRef);
      if (!d) return;
      const viewer = queryClient.getQueryData(viewerQuery.queryKey);
      if (!viewer) {
        window.alert("Please sign in before making a change");
        return;
      }
      if (posting.current.has(segRef)) {
        window.alert("Another Change in Progress, Please Wait");
        return;
      }
      posting.current.add(segRef);
      const text = applyChange(side === "v1" ? d.f1 : d.f2, side === "v1" ? d.v1 : d.v2, index, replacement);
      const result = await postSegmentText(segRef, side === "v1" ? v1 : v2, lang, text);
      if (result.status === "ok") {
        setReloading((r) => new Set(r).add(segRef));
        await Promise.all([v1, v2].map((v) => queryClient.refetchQueries({ queryKey: sectionTextQueryOptions(secRef, lang, v).queryKey, exact: true })));
        setReloading((r) => {
          const n = new Set(r);
          n.delete(segRef);
          return n;
        });
      } else if (result.status === "error") window.alert(result.error);
      // the old page stayed blocked after a failure ("Another Change in Progress" until a reload); here another try is allowed
      if (result.status !== "skipped") posting.current.delete(segRef);
    },
    [diffs, queryClient, secRef, lang, v1, v2],
  );

  return <DiffTable secRef={secRef} v1={v1} v2={v2} lang={lang} rows={rows} filters={filters} editing={{ canEdit, apply: (s, side, i, t) => void apply(s, side, i, t) }} />;
}

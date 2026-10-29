import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { uaEvent } from "~/lib/analytics";
import type { Viewer } from "~/lib/auth/session";
import { findSaved, saveAnonHistory, savedItemsQuery, setSaved, syncHistory, type HistoryItem, type LegacyVersions, type SavedRecord } from "~/lib/user/history";

/** What a panel is on, as the old getHistoryObject: the chosen verse while the sidebar is open, else the section being read. */
export interface PanelPlace {
  ref: string;
  heRef?: string;
  versions: LegacyVersions;
  book: string;
  language: "bilingual" | "english" | "hebrew";
}

const INTENT_MS = 3000;
const key = (p: PanelPlace) => `${p.ref}|${JSON.stringify(p.versions)}`;

function record(viewer: Viewer | null, place: PanelPlace) {
  const item: HistoryItem = { ref: place.ref, versions: place.versions, book: place.book, language: place.language };
  if (viewer) void syncHistory([item]).catch(() => undefined);
  else saveAnonHistory([{ ...item, ...(place.heRef ? { he_ref: place.heRef } : {}) }]);
}

/**
 * Reading history for one panel, as the old ReaderApp.saveLastPlace (ReaderApp.jsx:236, 1549-1556, 1805, 1849, 2161):
 * recorded at once when the panel opens and when its sidebar opens (the chosen verse), and after 3 s on the same place when the
 * place or the version changes (checkPanelScrollIntentAndSaveRecent). Signed in it goes to the server, signed out to the
 * `user_history` cookie. The server skips it when the reader turned reading history off (user_profile.py:657).
 *
 * @feature USL-010
 */
export function useReaderHistory(viewer: Viewer | null, place: PanelPlace | null, hasSidebar: boolean) {
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const last = useRef<string | null>(null);
  const hadSidebar = useRef(hasSidebar);
  useEffect(() => {
    if (!place) return;
    const k = key(place);
    const openedSidebar = hasSidebar && !hadSidebar.current;
    hadSidebar.current = hasSidebar;
    if (last.current === null || openedSidebar) {
      // the panel just opened, or its sidebar did: recorded at once
      last.current = k;
      record(viewerRef.current, place);
      return;
    }
    if (last.current === k) return;
    const t = setTimeout(() => {
      last.current = k;
      record(viewerRef.current, place);
    }, INTENT_MS);
    return () => clearTimeout(t);
  }, [place?.ref, place && JSON.stringify(place.versions), hasSidebar]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The Save button's state and action (the old SaveButton + Sefaria.toggleSavedItem): saved when the reader's saved items hold
 * this ref in these versions; a click saves or removes it on the server and updates the list. Signed out → `onSignedOut`.
 *
 * @feature USL-011
 */
export function useSaved(viewer: Viewer | null, place: PanelPlace | null, onSignedOut: () => void) {
  const qc = useQueryClient();
  const uid = viewer?.id ?? null;
  const saved = useQuery(savedItemsQuery(uid));
  const record = place && saved.data ? findSaved(saved.data, place) : undefined;
  const toggle = useMutation({
    mutationFn: async (vars: { place: PanelPlace; save: boolean }) => setSaved(vars.place, vars.save),
    onSuccess: (created, { place: p, save }) => {
      qc.setQueryData<SavedRecord[]>(savedItemsQuery(uid).queryKey, (list = []) =>
        save
          ? [created ?? { ref: p.ref, versions: p.versions, saved: true }, ...list]
          : list.filter((s) => !(s.ref === p.ref && findSaved([s], p))),
      );
    },
  });
  return {
    isSaved: !!record,
    pending: toggle.isPending,
    error: toggle.error,
    click: () => {
      if (!place) return;
      if (!viewer) return onSignedOut();
      if (toggle.isPending) return; // the old isPosting guard
      uaEvent("Saved", "saving", place.ref);
      toggle.mutate({ place, save: !record });
    },
  };
}

/**
 * An asset panel: an interactive page beside the text it is linked to, in a sandboxed frame (LINKED_PANELS_AND_ASSETS_PLAN.md §5).
 *
 * The frame gets `sandbox="allow-scripts"` and nothing else: an opaque origin, so the page cannot reach the reader's cookies, storage
 * or DOM, submit forms, open windows or navigate the reader. It talks to the reader only through the port the channel hands it, and can
 * only move the text panel it is linked to.
 *
 * @feature SHL-093 Asset panel
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { readManifest, htmlTitle } from "~/lib/assets/manifest";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { firstSegment } from "~/lib/text/link-map";
import { close } from "~/lib/workspace/ops";
import type { AssetPanelState } from "~/lib/workspace/types";
import { ErrorState, LoadingState } from "~/ui/Feedback/Feedback";
import { PanelHeader } from "~/ui/PanelHeader/PanelHeader";
import { CloseTextButton } from "~/ui/ReaderControls/ReaderControls";
import { useReaderState } from "~/features/reader-state/context";
import { useLinkEndpoint, usePanelLinks } from "../workspace/links";
import { useWorkspaceNav } from "../workspace/navigation";
import { PanelLinkToggle } from "../workspace/PanelLinkToggle";
import { loadAssetSource, withPolicy } from "./source";
import { useAssetChannel } from "./use-asset-channel";
import styles from "./AssetPanel.module.css";

export function AssetPanel({ panel }: { panel: AssetPanelState }) {
  const nav = useWorkspaceNav();
  const links = usePanelLinks();
  const readerState = useReaderState();
  const he = useInterfaceLang() === "hebrew";
  const id = panel.id;
  const frame = useRef<HTMLIFrameElement>(null);
  const source = useQuery({ queryKey: ["asset-source", panel.asset], queryFn: ({ signal }) => loadAssetSource(panel.asset, signal), staleTime: Infinity, retry: 1 });

  const page = source.data;
  const manifest = useMemo(() => (page?.kind === "html" ? readManifest(page.html) : null), [page]);
  const title = (manifest?.ok ? manifest.manifest.title : undefined) ?? (page?.kind === "html" ? htmlTitle(page.html) : page?.title) ?? (he ? "דף אינטראקטיבי" : "Interactive page");
  const srcDoc = useMemo(() => (page?.kind === "html" ? withPolicy(page.html) : undefined), [page]);

  /** The text panel this asset follows. */
  const leader = () => {
    const l = nav.current().panels[id]?.link;
    return l && !l.away ? l.to : undefined;
  };
  /** The last place the asset itself reported (as a segment): the text panel's echo of it is not sent back. */
  const reported = useRef<string | undefined>(undefined);
  const channel = useAssetChannel({
    frame,
    init: () => {
      const to = leader();
      const at = to ? links.placeOf(to) : undefined;
      return {
        theme: "light",
        interfaceLang: he ? "hebrew" : "english",
        dir: he ? "rtl" : "ltr",
        context: "panel",
        ...(at ? { place: { ref: at, segments: [at] } } : {}),
      };
    },
    onPlace: (ref) => {
      reported.current = firstSegment(ref);
      links.moved(id, ref);
    },
    onOpen: (ref) => links.open(id, ref),
    driven: () => !!readerState?.api.applying,
  });

  useLinkEndpoint(id, {
    kind: "asset",
    indexTitle: () => `asset:${panel.asset}`,
    place: () => reported.current,
    scrollTo: (segment) => {
      if (segment === reported.current) return true; // the text caught up with the asset: nothing to tell it
      return channel.sendPlace(segment, readerState?.api.applying ? "replay" : "link");
    },
  });

  // another asset in this panel connects afresh (the load event comes after the page's hello, so it is no moment to reset)
  useEffect(() => channel.reset(), [panel.asset, channel]);

  const closePanel = () => void nav.go(close(nav.current(), id));
  const label = he ? "סגירת הדף" : "Close this page";

  return (
    <section className={styles.panel} data-panel-id={id} data-panel-kind="asset" aria-label={he ? `דף אינטראקטיבי: ${title}` : `Interactive page: ${title}`}>
      <PanelLinkToggle id={id} link={panel.link} />
      <PanelHeader
        sticky
        title={<span>{title}</span>}
        subtitle={<span>{he ? "דף אינטראקטיבי · מקושר לטקסט" : "Interactive page · linked to the text"}</span>}
        start={<CloseTextButton label={label} onClick={closePanel} />}
      />
      <div className={styles.body}>
        {source.isPending ? (
          <LoadingState />
        ) : source.isError ? (
          <ErrorState title={he ? "לא ניתן להציג את הדף" : "This page cannot be shown"}>{(source.error as Error).message}</ErrorState>
        ) : (
          <>
            {manifest && !manifest.ok ? <p className={styles.warning} role="note">{manifest.error}</p> : null}
            <iframe
              ref={frame}
              className={styles.frame}
              title={title}
              // scripts only: an opaque origin, no forms, popups, top navigation, downloads or device features
              sandbox="allow-scripts"
              allow=""
              referrerPolicy="no-referrer"
              loading="eager"
              {...(srcDoc !== undefined ? { srcDoc } : { src: page?.kind === "url" ? page.url : undefined })}
            />
          </>
        )}
      </div>
    </section>
  );
}

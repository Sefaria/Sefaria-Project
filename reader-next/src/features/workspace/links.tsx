/**
 * Linked panels: two panels that follow each other segment by segment (docs/WORKSPACE.md, "Linked panels"; plan
 * LINKED_PANELS_AND_ASSETS_PLAN.md §4). The link itself is workspace state (PanelState.link, in the address as `link=`); this is the
 * runtime that moves the other panel when the reader moves one.
 *
 * Rules:
 *  1. Only the reader's own movement is passed on: a scroll that settled, a verse chosen, a navigation inside the panel. A panel moved by
 *     the link (or by a replay, a followed leader, history) reports nothing, so the two never chase each other.
 *  2. The other panel goes to the mapped segment (lib/text/link-map.ts): scrolled there when the segment is loaded, else navigated there
 *     (one replaced entry). No mapped segment (a verse with no comment): it holds its place (D3).
 *  3. A move that cannot be mapped (one side went to an unrelated book) pauses the link (P1): the symbol turns grey; a click links them
 *     again and the panel the reader touched last leads.
 *  4. Anchored to segments, never to scroll fractions.
 *
 * @feature SHL-090 Linked panels
 * @feature SHL-091 Link symbol (pause and link again)
 * @feature SHL-092 Opening a commentary, targum or version links it
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { linksQueryOptions } from "~/lib/connections/queries";
import { indexMetaQueryOptions, type CommentaryMeta } from "~/lib/text/commentary";
import { baseToDependent, dependentToBase, isDependentOn, relationOf, sectionOf, type LinkRelation } from "~/lib/text/link-map";
import { parseHumanRef } from "~/lib/ref/url";
import { linkedTo, linkPanels, setLinkAway, updatePanel } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { useLab } from "~/features/reader-state/labs";
import { useWorkspaceNav, type NavState } from "./navigation";

/** What a panel offers its links. */
export interface LinkEndpoint {
  /** The book the panel shows now ("Genesis", "Rashi on Genesis"); undefined while it has none. */
  indexTitle: () => string | undefined;
  /** The segment the reader is on. */
  place: () => string | undefined;
  /** Bring a segment to the reading line without counting as the reader's movement; false when that segment is not loaded. */
  scrollTo: (segmentRef: string) => boolean;
}

/** Why a panel moved, as the bus is told. */
export interface PanelLinks {
  enabled: boolean;
  register: (id: PanelId, endpoint: LinkEndpoint) => () => void;
  /**
   * The reader moved this panel themself. `written`: the panel's own address update, if it made one; the other panel's update waits
   * for it, so the two replaces never read the same old address.
   */
  moved: (id: PanelId, segmentRef: string, written?: Promise<unknown>) => void;
  /** The link symbol: pause a link, or link again (the panel the reader touched last leads). */
  toggle: (follower: PanelId) => void;
  /** A panel was just opened from `leader` (a sidebar's Open): link the two if the texts can be linked. */
  autoLink: (leader: PanelId, opened: PanelId, openedRef: string) => void;
}

const DISABLED: PanelLinks = { enabled: false, register: () => () => {}, moved: () => {}, toggle: () => {}, autoLink: () => {} };
const Ctx = createContext<PanelLinks>(DISABLED);

/** The bus's dependencies, so it can be tested without React or a router. */
export interface LinkBusDeps {
  current: () => Workspace;
  go: (ws: Workspace, opts: { replace?: boolean; state?: NavState }) => Promise<void>;
  meta: (title: string) => Promise<CommentaryMeta | undefined>;
  links: (sectionRef: string) => Promise<Parameters<typeof baseToDependent>[2]>;
}

export function createLinkBus(deps: LinkBusDeps): Omit<PanelLinks, "enabled"> & { endpoints: Map<PanelId, LinkEndpoint>; idle: () => Promise<void> } {
  const endpoints = new Map<PanelId, LinkEndpoint>();
  /** Per link (by follower): the panel the reader moved last. */
  const lastTouched = new Map<PanelId, PanelId>();
  /** Per target panel: a counter, so a move overtaken by a newer one is dropped. */
  const generation = new Map<PanelId, number>();
  let pending: Promise<void> = Promise.resolve();
  const track = (p: Promise<void>) => {
    pending = pending.then(() => p).catch(() => undefined);
  };

  const titleOf = (id: PanelId, ws: Workspace): string | undefined => endpoints.get(id)?.indexTitle() ?? refTitle(ws.panels[id]?.ref);

  async function relation(aTitle: string, bTitle: string): Promise<LinkRelation | null> {
    if (aTitle === bTitle) return { mode: "same" };
    const [a, b] = await Promise.all([deps.meta(aTitle), deps.meta(bTitle)]);
    return relationOf({ title: aTitle, meta: a }, { title: bTitle, meta: b });
  }

  /** The segment of `to` that answers segment `ref` of `from`; null: hold; "none": the texts cannot be linked. */
  async function mapPlace(fromTitle: string, ref: string, toTitle: string): Promise<string | null | "none"> {
    const rel = await relation(fromTitle, toTitle);
    if (!rel) return "none";
    if (rel.mode === "same") return ref;
    // relationOf(a=from, b=to): base "a" means the moved panel is the base text
    if (rel.base === "a") return baseToDependent(ref, rel.dependent, await deps.links(sectionOf(ref)));
    return dependentToBase(ref, rel.dependent);
  }

  async function follow(from: PanelId, ref: string, to: PanelId, follower: PanelId, written?: Promise<unknown>): Promise<void> {
    const gen = (generation.get(to) ?? 0) + 1;
    generation.set(to, gen);
    const ws0 = deps.current();
    const fromTitle = titleOf(from, ws0) ?? refTitle(ref);
    const toTitle = titleOf(to, ws0);
    if (!fromTitle || !toTitle) return;
    let target: string | null | "none";
    try {
      target = await mapPlace(fromTitle, ref, toTitle);
    } catch {
      return; // a failed request is not a reason to pause the link
    }
    if (generation.get(to) !== gen) return;
    if (target === "none") {
      await written;
      const ws = deps.current();
      if (ws.panels[follower]?.link && !ws.panels[follower]!.link!.away) await deps.go(setLinkAway(ws, follower, true), { replace: true, state: { nav: "stay", link: true } });
      return;
    }
    if (!target) return; // nothing there: hold (D3)
    const ep = endpoints.get(to);
    if (ep?.place() === target) return;
    const scrolled = ep?.scrollTo(target) ?? false;
    await written;
    if (generation.get(to) !== gen) return;
    const ws = deps.current();
    if (!ws.panels[to]) return;
    // Scrolled: only the address catches up ("scroll": nothing on screen moves). Not loaded: the panel goes there (one replaced entry).
    await deps.go(updatePanel(ws, to, { ref: target }), { replace: true, state: scrolled ? { nav: "scroll", panel: to, link: true } : { nav: "go", panel: to, link: true } });
  }

  const moved: PanelLinks["moved"] = (id, segmentRef, written) => {
    const ws = deps.current();
    for (const l of linkedTo(ws, id)) {
      lastTouched.set(l.follower, id);
      if (l.away) continue;
      track(follow(id, segmentRef, l.other, l.follower, written));
    }
  };

  const toggle: PanelLinks["toggle"] = (follower) => {
    const ws = deps.current();
    const link = ws.panels[follower]?.link;
    if (!link) return;
    if (!link.away) {
      track(deps.go(setLinkAway(ws, follower, true), { replace: true, state: { nav: "stay", link: true } }));
      return;
    }
    // Link again: the panel the reader moved last leads; the other comes to it (P1).
    const leader = lastTouched.get(follower) ?? link.to;
    const other = leader === follower ? link.to : follower;
    track(
      (async () => {
        const place = endpoints.get(leader)?.place() ?? ws.panels[leader]?.ref;
        const leaderTitle = titleOf(leader, ws);
        const otherTitle = titleOf(other, ws);
        if (!place || !leaderTitle || !otherTitle) return;
        const rel = await relation(leaderTitle, otherTitle).catch(() => null);
        if (rel) {
          await deps.go(setLinkAway(deps.current(), follower, false), { replace: true, state: { nav: "stay", link: true } });
          await follow(leader, place, other, follower);
          return;
        }
        // The two went apart (a commentary panel moved to another book of the commentary, or the text to another book): bring the
        // other panel to the matching book, so they can follow each other again.
        const target = await realign(leaderTitle, place, otherTitle);
        if (!target) return;
        const next = setLinkAway(updatePanel(deps.current(), other, { ref: target }), follower, false);
        await deps.go(next, { replace: true, state: { nav: "go", panel: other, link: true } });
      })(),
    );
  };

  /**
   * The ref the other panel should go to so that the two can be linked again, when they show texts that do not relate:
   *  - the leader is a commentary or targum: the other goes to its base text, at the base segment;
   *  - the other is a commentary on another book ("Rashi on Exodus" beside Genesis): the same commentator on the leader's book.
   */
  async function realign(leaderTitle: string, place: string, otherTitle: string): Promise<string | null> {
    const [lm, om] = await Promise.all([deps.meta(leaderTitle), deps.meta(otherTitle)]).catch(() => [undefined, undefined]);
    const leaderBase = lm?.base_text_titles?.length === 1 ? lm.base_text_titles[0]! : undefined;
    if (leaderBase && isDependentOn(lm, leaderBase)) return dependentToBase(place, lm);
    const otherBase = om?.base_text_titles?.length === 1 ? om.base_text_titles[0]! : undefined;
    if (otherBase && otherTitle.includes(otherBase)) {
      const sibling = otherTitle.replace(otherBase, leaderTitle);
      const sm = await deps.meta(sibling).catch(() => undefined);
      if (isDependentOn(sm, leaderTitle)) return baseToDependent(place, sm, await deps.links(sectionOf(place))) ?? sibling;
    }
    return null;
  }

  const autoLink: PanelLinks["autoLink"] = (leader, opened, openedRef) => {
    track(
      (async () => {
        const ws0 = deps.current();
        const leaderTitle = titleOf(leader, ws0);
        const openedTitle = refTitle(openedRef);
        if (!leaderTitle || !openedTitle) return;
        const rel = await relation(leaderTitle, openedTitle).catch(() => null);
        if (!rel) return;
        const ws = deps.current();
        // still the panels it was asked about (the reader may have closed or moved one meanwhile)
        if (ws.panels[opened]?.ref !== openedRef || !ws.panels[leader] || ws.panels[opened]!.link) return;
        await deps.go(linkPanels(ws, opened, leader), { replace: true, state: { nav: "stay", link: true } });
      })(),
    );
  };

  const register: PanelLinks["register"] = (id, endpoint) => {
    endpoints.set(id, endpoint);
    return () => {
      if (endpoints.get(id) === endpoint) endpoints.delete(id);
    };
  };

  return { register, moved, toggle, autoLink, endpoints, idle: () => pending };
}

/** The book a ref names ("Rashi on Genesis 1:3:1" → "Rashi on Genesis"). */
function refTitle(ref: string | undefined): string | undefined {
  return ref ? parseHumanRef(ref).title || undefined : undefined;
}

export function PanelLinksProvider({ children }: { children: ReactNode }) {
  const enabled = useLab("linked_panels");
  const nav = useWorkspaceNav();
  const qc = useQueryClient();
  const navRef = useRef(nav);
  navRef.current = nav;
  const bus = useMemo(
    () =>
      createLinkBus({
        current: () => navRef.current.current(),
        go: (ws, opts) => navRef.current.go(ws, opts),
        meta: (title) => fetchMeta(qc, title),
        links: (section) => qc.fetchQuery(linksQueryOptions(section)),
      }),
    [qc],
  );
  const value = useMemo<PanelLinks>(() => (enabled ? { enabled, register: bus.register, moved: bus.moved, toggle: bus.toggle, autoLink: bus.autoLink } : DISABLED), [enabled, bus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const fetchMeta = (qc: QueryClient, title: string) => qc.fetchQuery(indexMetaQueryOptions(title)).catch(() => undefined);

export const usePanelLinks = () => useContext(Ctx);

/** A panel offers its endpoint to its links while it is mounted. */
export function useLinkEndpoint(id: PanelId, endpoint: LinkEndpoint) {
  const links = usePanelLinks();
  const ref = useRef(endpoint);
  ref.current = endpoint;
  const stable = useMemo<LinkEndpoint>(() => ({ indexTitle: () => ref.current.indexTitle(), place: () => ref.current.place(), scrollTo: (r) => ref.current.scrollTo(r) }), []);
  useEffect(() => (links.enabled ? links.register(id, stable) : undefined), [links, id, stable]);
}

/** The panel's links as the link symbol shows them. */
export function usePanelLinkState(ws: Workspace, id: PanelId): { follower: PanelId; other: PanelId; away: boolean } | null {
  const l = ws.panels[id]?.link;
  return l && ws.panels[l.to] ? { follower: id, other: l.to, away: !!l.away } : null;
}

/** The handler a link symbol calls. */
export function useToggleLink(follower: PanelId) {
  const links = usePanelLinks();
  return useCallback(() => links.toggle(follower), [links, follower]);
}

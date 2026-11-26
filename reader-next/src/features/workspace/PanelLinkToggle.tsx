/**
 * The link symbol between two linked panels (owner decision D2): Sefaria blue while they follow each other, grey once the link is
 * paused; a click pauses it, or links them again. It sits on the line between the panels, on the side facing the panel it is linked
 * to (in a right-to-left interface the row runs right to left, so "facing" is the inline start or end, never left or right). State is
 * not told by colour alone: the icon is a joined chain or a broken one, and the button is aria-pressed.
 *
 * @feature SHL-091 Link symbol (pause and link again)
 */
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { parseHumanRef } from "~/lib/ref/url";
import { panelOrder } from "~/lib/workspace/ops";
import type { PanelId, PanelLink } from "~/lib/workspace/types";
import { usePanelLinks } from "./links";
import { useWorkspaceNav } from "./navigation";
import styles from "./PanelLinkToggle.module.css";

export function PanelLinkToggle({ id, link }: { id: PanelId; link: PanelLink | undefined }) {
  const links = usePanelLinks();
  const nav = useWorkspaceNav();
  const he = useInterfaceLang() === "hebrew";
  if (!links.enabled || !link) return null;
  const ws = nav.current();
  const other = ws.panels[link.to];
  if (!other) return null;
  const order = panelOrder(ws);
  const side = order.indexOf(link.to) < order.indexOf(id) ? "start" : "end";
  const adjacent = Math.abs(order.indexOf(link.to) - order.indexOf(id)) === 1;
  const title = parseHumanRef(other.ref).title;
  const linked = !link.away;
  const label = he ? (linked ? `ביטול הקישור אל ${title}` : `קישור מחדש אל ${title}`) : linked ? `Unlink from ${title}` : `Link to ${title} again`;
  return (
    <button
      type="button"
      className={styles.toggle}
      data-side={side}
      data-adjacent={adjacent || undefined}
      data-linked={linked ? "true" : "false"}
      data-reader-state-ui=""
      aria-pressed={linked}
      aria-label={label}
      title={label}
      onClick={() => links.toggle(id)}
    >
      {linked ? <LinkedIcon /> : <UnlinkedIcon />}
    </button>
  );
}

const LinkedIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.6l-1.2 1.2M14 10.5a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.6l1.2-1.2" />
  </svg>
);
const UnlinkedIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M15.7 13.8l3-3a4 4 0 0 0-5.7-5.6l-1.2 1.2M8.3 10.2l-3 3a4 4 0 0 0 5.7 5.6l1.2-1.2M4 4l3 3M17 17l3 3" />
  </svg>
);

/**
 * Declarative tracking — a port of the old static/js/analyticsEventTracker.js. Elements declare
 * `data-anl-event="<name>:<type>|<name>:<type>…"`; the event's parameters are every `data-anl-<field>` (and `data-anl-batch`
 * JSON) on the element and its ancestors, the closest winning, limited to the old whitelist; then `gtag("event", name, params)`.
 * Types: click, mouseover, input (adds `text`), inputStart (first input only), toggle (on <details>, adds from/to),
 * scrollIntoView (first time fully on screen).
 *
 * @feature ANL-015 Declarative data-anl event tracking
 */
import { gtagEvent, type AnalyticsParams } from "./core";

export const VALID_ANALYTICS_FIELDS = new Set([
  "project", "panel_type", "panel_number", "item_id", "version", "content_lang", "content_id", "content_type", "panel_name",
  "panel_category", "position", "ai", "text", "experiment", "feature_name", "from", "to", "action", "engagement_value",
  "engagement_type", "logged_in", "site_lang", "traffic_type", "promotion_name", "link_type", "form_name", "form_destination",
]);
const EVENT_ATTR = "data-anl-event";
const PREFIX = "data-anl-";
const BATCH_ATTR = "data-anl-batch";
const BUBBLING_TOGGLE = "bubblingToggle";
export const DEFAULT_EVENT_TYPES = ["click", "scrollIntoView", "toggle", "mouseover", "input", "inputStart"] as const;

interface AnlEvent {
  name: string;
  type: string;
}

export function parseEventAttr(value: string | null): AnlEvent[] {
  if (!value) return [{ name: "", type: "" }];
  return value.split("|").map((v) => {
    const [name = "", type = ""] = v.split(":");
    return { name, type };
  });
}

/** The data-anl-* fields declared on one element (data-anl-event excluded; data-anl-batch expanded). */
export function anlDataFromElement(el: Element | null): Record<string, string> {
  if (!el) return {};
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === EVENT_ATTR || !attr.name.startsWith(PREFIX)) continue;
    if (attr.name === BATCH_ATTR) {
      try {
        Object.assign(out, JSON.parse(attr.value));
      } catch {
        /* malformed batch: ignored, as a parse error would have stopped the old handler */
      }
    } else out[attr.name.slice(PREFIX.length)] = attr.value;
  }
  return out;
}

const originalType = (t: string) => (t === BUBBLING_TOGGLE ? "toggle" : t);

/** From `start` up to (not including) `root`, the first element meeting `test`. */
function closestUntil(start: Element | null, root: Element, test: (el: Element) => boolean): Element | null {
  for (let el = start; el && el !== root; el = el.parentElement) if (test(el)) return el;
  return null;
}

function derived(event: Event): Record<string, string> {
  const type = originalType(event.type);
  const t = event.target as HTMLElement & { open?: boolean; value?: string };
  if (type === "toggle") return t.open ? { from: "closed", to: "open" } : { from: "open", to: "closed" };
  if (t.tagName === "DETAILS") return { from: t.open ? "open" : "closed" };
  if (type === "input") return { text: String(t.value ?? "") };
  return {};
}

/** The analytics events (and their parameters) one DOM event produces under `root`. */
export function collectAnalytics(event: Event, root: Element): { name: string; params: AnalyticsParams }[] {
  const type = originalType(event.type);
  const target = event.target instanceof Element ? event.target : null;
  const el = closestUntil(target, root, (e) => parseEventAttr(e.getAttribute(EVENT_ATTR)).some((x) => x.type === type));
  if (!el) return [];
  const events = parseEventAttr(el.getAttribute(EVENT_ATTR)).filter((x) => x.type === type);
  // fields from the target up: the closest declaration of a field wins
  const data: Record<string, string> = {};
  for (let e: Element | null = target; e && e !== root; e = e.parentElement) {
    for (const [k, v] of Object.entries(anlDataFromElement(e))) if (!(k in data)) data[k] = v;
  }
  Object.assign(data, derived(event));
  const params: AnalyticsParams = {};
  for (const [k, v] of Object.entries(data)) {
    if (VALID_ANALYTICS_FIELDS.has(k)) params[k] = v;
    else if (import.meta.env?.DEV) console.warn("Invalid analytics key:", k);
  }
  return events.map((x) => ({ name: x.name, params }));
}

/** Listen under `root` (the old attach("#s2, #staticContentWrapper", …)). Returns a detach function. */
export function attachDeclarativeAnalytics(root: Element, types: readonly string[] = DEFAULT_EVENT_TYPES): () => void {
  const cleanups: (() => void)[] = [];
  const handler = (event: Event) => {
    for (const { name, params } of collectAnalytics(event, root)) gtagEvent(name, params);
  };
  const listen = (type: string) => {
    root.addEventListener(type, handler);
    cleanups.push(() => root.removeEventListener(type, handler));
  };

  const prepare: ((node: Element) => void)[] = [];
  const each = (node: Element, selector: string, fn: (el: Element) => void) => {
    if (node.matches(selector)) fn(node);
    node.querySelectorAll(selector).forEach(fn);
  };
  const seen = new WeakSet<Element>();
  let io: IntersectionObserver | null = null;

  for (const type of types) {
    if (type === "toggle") {
      // <details> toggle does not bubble: re-dispatch it as a bubbling event
      prepare.push((n) =>
        each(n, "details", (d) => {
          if (seen.has(d)) return;
          seen.add(d);
          d.addEventListener("toggle", () => d.dispatchEvent(new CustomEvent(BUBBLING_TOGGLE, { bubbles: true })));
        }),
      );
      listen(BUBBLING_TOGGLE);
    } else if (type === "scrollIntoView") {
      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.dispatchEvent(new CustomEvent("scrollIntoView", { bubbles: true }));
            io!.unobserve(entry.target);
          }
        });
        const obs = io;
        prepare.push((n) => each(n, '[data-anl-event*=":scrollIntoView"]', (el) => obs.observe(el)));
      }
      listen("scrollIntoView");
    } else if (type === "inputStart") {
      prepare.push((n) =>
        each(n, '[data-anl-event*=":inputStart"]', (el) => {
          if (seen.has(el)) return;
          seen.add(el);
          const first = (e: Event) => {
            e.target?.dispatchEvent(new CustomEvent("inputStart", { bubbles: true }));
            el.removeEventListener("input", first);
          };
          el.addEventListener("input", first);
        }),
      );
      listen("inputStart");
    } else listen(type);
  }

  prepare.forEach((fn) => fn(root));
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) m.addedNodes.forEach((n) => n instanceof Element && prepare.forEach((fn) => fn(n)));
  });
  mo.observe(root, { childList: true, subtree: true });
  cleanups.push(() => mo.disconnect(), () => io?.disconnect());
  return () => cleanups.forEach((c) => c());
}

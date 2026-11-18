/**
 * Reads bounding boxes and computed styles from a page. Used by the capture (live side) and by the
 * parity spec (local side), so both sides measure the same way.
 */
import type { Page } from 'playwright';
import { STYLE_PROPS } from '../mapped-elements.ts';

export type Rect = [x: number, y: number, width: number, height: number];

export interface ElementMetrics {
  /** Viewport coordinates at capture time (what the viewport screenshot shows). */
  rect: Rect;
  /** Document coordinates (what a full-page screenshot shows). */
  docRect: Rect;
  style: Record<string, string>;
}

export interface MetricsFile {
  state: string;
  width: number;
  height: number;
  fullPage: boolean;
  scroll: { x: number; y: number };
  /** Size of the screenshot in CSS px. */
  image: { width: number; height: number };
  elements: Record<string, ElementMetrics>;
  /** Comparison regions, in screenshot coordinates. */
  regions: Record<string, Rect>;
  /** Masked rectangles, in screenshot coordinates, by mask id. */
  masks: Record<string, Rect[]>;
  /** Rectangles of registered deviations, in screenshot coordinates, by deviation id. */
  deviations: Record<string, Rect[]>;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Measure every selector (first match with a non-empty box). Missing keys are omitted. */
export async function measureElements(
  page: Page,
  selectors: Record<string, string>
): Promise<Record<string, ElementMetrics>> {
  const props = [...STYLE_PROPS];
  const raw = await page.evaluate(
    ({ selectors, props }) => {
      const out: Record<string, { r: number[]; d: number[]; s: Record<string, string> }> = {};
      // Scroll offset of an element: the window's plus every scrolled ancestor's (ReadMe scrolls
      // an inner container, not the window).
      const offset = (e: Element) => {
        let x = window.scrollX,
          y = window.scrollY;
        for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          x += p.scrollLeft;
          y += p.scrollTop;
        }
        return [x, y];
      };
      for (const [key, sel] of Object.entries(selectors)) {
        let el: Element | null = null;
        try {
          for (const cand of Array.from(document.querySelectorAll(sel))) {
            const b = cand.getBoundingClientRect();
            const cs = getComputedStyle(cand);
            // Mapped elements count when laid out, even at opacity 0 (the sidebar's invisible
            // collapse strip), as the research measurements did. Regions and masks below skip them.
            if (b.width > 0 && b.height > 0 && cs.visibility !== 'hidden') {
              el = cand;
              break;
            }
          }
        } catch {
          el = null;
        }
        if (!el) continue;
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const s: Record<string, string> = {};
        for (const p of props) s[p] = cs.getPropertyValue(p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
        const [ox, oy] = offset(el);
        out[key] = { r: [b.x, b.y, b.width, b.height], d: [b.x + ox, b.y + oy], s };
      }
      return { out };
    },
    { selectors, props }
  );
  const result: Record<string, ElementMetrics> = {};
  for (const [key, v] of Object.entries(raw.out)) {
    const [x, y, w, h] = v.r.map(round);
    result[key] = {
      rect: [x, y, w, h],
      docRect: [round(v.d[0]), round(v.d[1]), w, h],
      style: v.s,
    };
  }
  return result;
}

/** Boxes of every visible match of a selector, in viewport or document coordinates. */
export async function measureAll(page: Page, selector: string, document_: boolean): Promise<Rect[]> {
  const rects = await page.evaluate(
    ({ selector, document_ }) => {
      const out: number[][] = [];
      let nodes: Element[] = [];
      try {
        nodes = Array.from(document.querySelectorAll(selector));
      } catch {
        return out;
      }
      for (const el of nodes) {
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        let opaque = true;
        for (let a: Element | null = el; a; a = a.parentElement)
          if (getComputedStyle(a).opacity === '0') {
            opaque = false;
            break;
          }
        if (!opaque) continue;
        out.push([b.x + (document_ ? window.scrollX : 0), b.y + (document_ ? window.scrollY : 0), b.width, b.height]);
      }
      return out;
    },
    { selector, document_ }
  );
  return rects.map((r) => r.map(round) as Rect);
}

/** Union of rects (bounding box), or null for none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y, w, h] of rects) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  }
  return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)];
}

/**
 * Serialise a metrics file compactly but diff-friendly: one line per element, region, mask and
 * deviation entry.
 */
export function formatMetrics(m: MetricsFile): string {
  const block = (o: Record<string, unknown>) => {
    const entries = Object.entries(o);
    if (!entries.length) return '{}';
    return '{\n' + entries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n  }';
  };
  const { elements, regions, masks, deviations, ...head } = m;
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  lines.push(`  "elements": ${block(elements)}`);
  lines.push(`  "regions": ${block(regions)}`);
  lines.push(`  "masks": ${block(masks)}`);
  lines.push(`  "deviations": ${block(deviations)}`);
  return '{\n' + lines.join(',\n') + '\n}\n';
}

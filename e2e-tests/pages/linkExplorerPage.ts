import { expect, Page, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';

/**
 * Link Explorer POM — `/explore` and `/explore-<Cat>-and-<Cat>`.
 *
 * Source: `static/js/explore.js` (D3 v3, webpack entry `exploreConfig`). The
 * page is one generated `<svg>` with no ARIA roles, so the locators below are
 * anchored on the class/id names the D3 code assigns:
 *   `.link`        book-to-book arcs (explore.js:661)
 *   `#links`       arc group; starts `display:none` and is revealed by a 1s
 *                  transition in `showBookLinks()` (explore.js:721)
 *   `#main-toolip` the shared tooltip group (explore.js:216) — the id is
 *                  misspelled in the source; match it, don't "fix" it here
 *
 * Two constraints shape how this POM drives the mouse:
 *
 * 1. `locator.hover()` cannot reach an arc. The arcs are thin curved strokes,
 *    so the bounding-box centre Playwright would aim at usually falls off the
 *    stroke and hits whatever is behind it. Instead we ask the browser for a
 *    point that lies ON the path (`getPointAtLength` + `getScreenCTM`) and
 *    confirm with `elementFromPoint` before moving.
 * 2. The hover must be a real pointer movement, never a synthetic
 *    `dispatchEvent`. `moveToFront()` branches on `:hover`, which only a real
 *    pointer sets — a synthetic event would silently exercise the wrong path.
 */
export class LinkExplorerPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Locators ---

  private get arcs(): Locator {
    return this.page.locator('.link');
  }

  private get activeArcs(): Locator {
    return this.page.locator('.link.active');
  }

  private get tooltip(): Locator {
    return this.page.locator('#main-toolip');
  }

  // --- Navigation ---

  /** Visit the explorer, dismiss overlays, and wait for the arcs to render. */
  async open(baseUrl: string, path: string = '/explore'): Promise<void> {
    await this.page.goto(`${baseUrl}${path}`);
    await hideAllModalsAndPopups(this.page);
    await this.waitForArcsRendered();
  }

  /**
   * Gate on the arcs actually being on screen — `#links` flips to
   * `display="inline"` only after `showBookLinks()`'s transition, and the arc
   * data arrives from `/api/counts/links/...`.
   */
  async waitForArcsRendered(): Promise<void> {
    try {
      await this.page.waitForFunction(
        () =>
          document.querySelector('#links')?.getAttribute('display') === 'inline' &&
          document.querySelectorAll('.link').length > 0,
        undefined,
        { timeout: t(60000) },
      );
    } catch {
      // The most common cause is an environment whose persistent link-count
      // cache was never warmed, which the API reports rather than the DOM.
      // Keep this diagnostic best-effort: if the wait blew the test budget the
      // page is already closing, and the original failure is the useful one.
      let apiSaid: string;
      try {
        apiSaid = await this.page.evaluate(async () => {
          const r = await fetch('/api/counts/links/Tanakh/Bavli');
          return (await r.text()).slice(0, 200);
        });
      } catch (e) {
        apiSaid = `could not be read (${(e as Error).message})`;
      }
      throw new Error(
        `Link Explorer arcs never rendered.\n` +
          `GET /api/counts/links/Tanakh/Bavli returned: ${apiSaid}\n` +
          `If that reads {"error": "No data available"}, this environment's link-count ` +
          `cache is empty. link_count_api is served only from the persistent cache ` +
          `(reader/views.py, @django_cache(default_on_miss=True)) and is warmed by the ` +
          `weekly {deployEnv}-regenerate CronJob. On a fresh cauldron, run it once:\n` +
          `  kubectl create job --from=cronjob/<deployEnv>-regenerate <deployEnv>-regen-now -n default`,
      );
    }
  }

  // --- Arc geometry ---

  /**
   * Pick an arc the mouse can actually land on and remember it page-side as
   * `window.__lexTarget`, so later assertions can talk about that exact node.
   *
   * Widest arcs first (stroke-width runs 1px–70px, explore.js:1056), sampling a
   * few points along each, and accepting only a point that is inside the
   * viewport AND where `elementFromPoint` returns that same arc — which
   * guarantees the pointer will hit it rather than an overlay or a sibling arc.
   */
  private async selectHoverableArc(): Promise<{ x: number; y: number }> {
    const point = await this.page.evaluate(() => {
      const arcs = Array.from(document.querySelectorAll('.link')) as SVGPathElement[];
      const widestFirst = arcs.sort(
        (a, b) =>
          parseFloat(b.getAttribute('stroke-width') || '0') -
          parseFloat(a.getAttribute('stroke-width') || '0'),
      );

      for (const arc of widestFirst.slice(0, 25)) {
        const matrix = arc.getScreenCTM();
        if (!matrix) continue;
        const total = arc.getTotalLength();

        for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) {
          const p = arc.getPointAtLength(total * fraction);
          const x = matrix.a * p.x + matrix.c * p.y + matrix.e;
          const y = matrix.b * p.x + matrix.d * p.y + matrix.f;
          const onScreen =
            x > 0 && y > 0 && x < window.innerWidth - 1 && y < window.innerHeight - 1;
          if (!onScreen) continue;
          if (document.elementFromPoint(x, y) !== arc) continue;

          (window as any).__lexTarget = arc;
          return { x, y };
        }
      }
      return null;
    });

    expect(
      point,
      'no rendered arc exposed a hoverable point inside the viewport',
    ).not.toBeNull();
    return point as { x: number; y: number };
  }

  /** A point inside the visualization with no arc under it (above the book bars). */
  private async pointClearOfArcs(): Promise<{ x: number; y: number }> {
    const point = await this.page.evaluate(() => {
      const svg = document.querySelector('#linkExplorerPage svg');
      const box = svg?.getBoundingClientRect();
      const candidates: Array<[number, number]> = box
        ? [
            [box.left + box.width / 2, box.top + 6],
            [box.left + 6, box.top + 6],
            [box.right - 6, box.top + 6],
            [4, 4],
          ]
        : [[4, 4]];

      for (const [x, y] of candidates) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.classList.contains('link') && !el.classList.contains('preciseLink')) {
          return { x, y };
        }
      }
      return null;
    });

    expect(point, 'could not find a pointer position clear of the arcs').not.toBeNull();
    return point as { x: number; y: number };
  }

  // --- Actions ---

  /** Move the real mouse onto the widest reachable arc and wait for it to light up. */
  async hoverAnArc(): Promise<void> {
    const point = await this.selectHoverableArc();
    await this.page.mouse.move(point.x, point.y);
    await this.page.waitForFunction(
      () => (window as any).__lexTarget?.classList.contains('active') === true,
      undefined,
      { timeout: t(10000) },
    );
  }

  /** Move the pointer away from every arc (and off the tooltip). */
  async movePointerClearOfArcs(): Promise<void> {
    const point = await this.pointClearOfArcs();
    await this.page.mouse.move(point.x, point.y);
  }

  /** Click the arc currently under the pointer, drilling into the two books it joins. */
  async clickHoveredArc(): Promise<void> {
    const box = await this.page.evaluate(() => {
      const arc = (window as any).__lexTarget as SVGPathElement | undefined;
      if (!arc) return null;
      const m = arc.getScreenCTM();
      if (!m) return null;
      const p = arc.getPointAtLength(arc.getTotalLength() / 2);
      return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
    });
    expect(box, 'hoverAnArc() must run before clickHoveredArc()').not.toBeNull();
    await this.page.mouse.click(box!.x, box!.y);
  }

  // --- Observations ---

  async activeArcCount(): Promise<number> {
    return this.activeArcs.count();
  }

  async tooltipIsShowing(): Promise<boolean> {
    return this.tooltip.evaluate(el => getComputedStyle(el).display !== 'none');
  }

  /**
   * Hover an arc while watching whether the DOM *detaches that same arc*, and
   * return how many times it was removed from `#links`.
   *
   * This is the version-independent statement of the invariant behind the
   * Chrome 144 fix: raising the hovered arc must not take it out of the DOM,
   * because a browser stops delivering mouseout/mousemove/click to a node that
   * was removed while under the pointer. Sibling arcs legitimately move (the
   * fix reorders them), so only the identity of the hovered node is watched.
   */
  async detachmentsWhileHoveringAnArc(): Promise<number> {
    const point = await this.selectHoverableArc();

    await this.page.evaluate(() => {
      (window as any).__lexDetachments = 0;
      const target = (window as any).__lexTarget as Node;
      const group = document.querySelector('#links') as Node;
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const removed of Array.from(record.removedNodes)) {
            if (removed === target) (window as any).__lexDetachments++;
          }
        }
      });
      observer.observe(group, { childList: true });
      (window as any).__lexObserver = observer;
    });

    await this.page.mouse.move(point.x, point.y);
    await this.page.waitForFunction(
      () => (window as any).__lexTarget?.classList.contains('active') === true,
      undefined,
      { timeout: t(10000) },
    );

    return this.page.evaluate(() => {
      (window as any).__lexObserver?.disconnect();
      return (window as any).__lexDetachments as number;
    });
  }
}

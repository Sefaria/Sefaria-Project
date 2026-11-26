/**
 * Visual parity (PLAN.md §6.1.4): for each state × width, run the recipe through the LOCAL adapter
 * and apply the three gates against the committed Roboto baseline and its metrics file.
 *
 * Run by `playwright.devportal-visual.config.ts` (owned by W16): projects `visual-1440` …
 * `visual-390`, deviceScaleFactor 1, baseURL = the local portal. A test whose width is not one of
 * the state's widths is skipped with the reason from `states.ts` (I-2).
 *
 * Each state × width also writes a JSON report (`<state>-visual-<width>.json`: the three gates'
 * results and pass flags) and its evidence images (`-actual.png`, `-diff.png`) to
 * `DEVPORTAL_VISUAL_REPORT_DIR` (default `e2e-tests/e2e-test-logs/devportal-visual-report/`), so a
 * V-pixel run can be summarized without opening the Playwright report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { STATES, type Width } from './states.ts';
import { REGIONS, MASKS, DEFAULT_MASKS, MASK_COLOR, type RegionId } from './regions.ts';
import { GATE1_PROPS, MAPPED_ELEMENTS, hiddenOnLive } from './mapped-elements.ts';
import { deviationsFor } from './deviations.ts';
import { LocalAdapter } from './adapters/local.ts';
import { measureAll, measureElements, unionRect, type MetricsFile, type Rect } from './capture/metrics.ts';
import { currentEnv, envDifferences, type EnvFingerprint } from './capture/env.ts';
import { fontSource } from './adapters/live.ts';
import { decodePng, encodePng } from './png.ts';
import {
  DEFAULT_LIMITS,
  crop,
  diffImage,
  diffImages,
  exciseRows,
  gateGeometry,
  gatePixels,
  gateStyles,
  keysInside,
  keysWithin,
  mergeBands,
  paintRects,
  shiftPastBands,
  type RegionInput,
} from './gates.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINES = path.join(here, 'baselines');
const REPORT_DIR = path.resolve(
  process.env.DEVPORTAL_VISUAL_REPORT_DIR ?? path.join(here, '../e2e-test-logs/devportal-visual-report')
);

let envChecked: string[] | null = null;

for (const state of STATES) {
  test(state.id, async ({ page, context, browser, baseURL }, testInfo) => {
    const width = testInfo.project.use.viewport?.width as Width | undefined;
    test.skip(!width || !state.widths.includes(width), state.excluded?.[width as Width] ?? 'not a width of this state');
    const w = width as Width;

    // V-pixel refuses to run in an environment whose fingerprint differs (§6.1.1).
    if (!envChecked) {
      const recorded: EnvFingerprint = JSON.parse(fs.readFileSync(path.join(BASELINES, 'ENV.json'), 'utf8'));
      envChecked = envDifferences(recorded, await currentEnv(browser, fontSource().dir));
    }
    expect(envChecked, 'rendering environment differs from baselines/ENV.json').toEqual([]);

    const stem = `${state.id}-visual-${w}`;
    const baseMetrics: MetricsFile = JSON.parse(
      fs.readFileSync(path.join(BASELINES, 'roboto', `${stem}.metrics.json`), 'utf8')
    );
    const baseImg0 = decodePng(fs.readFileSync(path.join(BASELINES, 'roboto', `${stem}.png`)));

    // ---- drive the portal through the same recipe
    const adapter = await LocalAdapter.create(context, page, baseURL!);
    await adapter.goto(state.path);
    // `excise` from the layout (D-3): what live does not have is taken out of the portal's layout before the recipe
    // runs, by a style rule (React re-renders cannot bring it back). A constructed stylesheet, as the portal's CSP
    // (style-src 'self') blocks a <style> element.
    const layoutExcise = deviationsFor(state.id).flatMap((d) =>
      d.treatments.flatMap((t) => (t.kind === 'excise' && t.from === 'layout' ? [t.local] : []))
    );
    if (layoutExcise.length)
      await page.evaluate(
        (rule) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(rule);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        },
        `${layoutExcise.join(', ')} { display: none !important; }`
      );
    await state.recipe(adapter);

    const fullPage = !!state.fullPage;
    if (fullPage) await adapter.prepareFullPage();
    else {
      // `excise` in a viewport state framed at the end of the page (docs_footer, D-7): the portal's page is longer by
      // the boxes cut out, so a recipe that scrolls to the end scrolls that much further than live, and everything
      // above them would sit higher than on live. Scrolled back by their height, the portal frames live's scroll
      // offset; the boxes then lie at or below the viewport's bottom and are cut from what is left of them there.
      const exciseSelectors = deviationsFor(state.id).flatMap((d) =>
        d.treatments.flatMap((t) => (t.kind === 'excise' && t.from !== 'layout' ? [t.local] : []))
      );
      let height = 0;
      for (const selector of exciseSelectors)
        for (const r of await measureAll(page, selector, false)) if (r[1] >= 0) height += r[3];
      if (height > 0)
        await page.evaluate((h) => {
          const end = document.documentElement.scrollHeight - window.innerHeight;
          if (window.scrollY >= end - 1) window.scrollTo({ top: window.scrollY - h, behavior: 'instant' });
        }, height);
    }
    const maskIds = state.masks ?? DEFAULT_MASKS;
    const local = await measureElements(page, Object.fromEntries(MAPPED_ELEMENTS.map((e) => [e.key, e.local])));
    let localElements: Record<string, { rect: Rect; style: Record<string, string> }> = Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, { rect: fullPage ? v.docRect : v.rect, style: v.style }])
    );
    const localRegions: Record<string, Rect | null> = {};
    for (const id of state.regions) {
      const def = REGIONS[id];
      const rects = await measureAll(page, def.local, fullPage);
      localRegions[id] = def.pick === 'union' ? unionRect(rects) : (rects[0] ?? null);
    }
    const localMasksById: Record<string, Rect[]> = {};
    for (const id of maskIds) localMasksById[id] = await measureAll(page, MASKS[id].local, fullPage);
    let localMaskRects: Rect[] = Object.values(localMasksById).flat();

    // ---- deviations (deviations.ts is the only place they are declared)
    const deviations = deviationsFor(state.id);
    // `mask`: the baseline's recorded live boxes and the portal's measured boxes, painted on both images.
    const baseDeviationRects: Rect[] = [];
    let localDeviationRects: Rect[] = [];
    // `mask-regions`: painted on both images too, but gates 1 and 2 skip only what lies wholly inside them.
    const baseRegionMasks: Rect[] = [];
    let localRegionMasks: Rect[] = [];
    const regionLimits: Record<string, number> = {};
    const exempt = new Set<string>();
    const splits: { region: RegionId; elements: readonly string[] }[] = [];
    const exciseRects: Rect[] = [];
    for (const d of deviations)
      for (const t of d.treatments) {
        if (t.kind === 'mask') {
          baseDeviationRects.push(...(baseMetrics.deviations[d.id] ?? []));
          if (t.local) {
            let rects = await measureAll(page, t.local, fullPage);
            if (t.localFirst !== undefined) rects = rects.slice(0, t.localFirst);
            const clip = t.localClipLeftPx;
            if (clip) rects = rects.map(([x, y, , h]) => [x, y, clip, h] as Rect);
            localDeviationRects.push(...rects);
          }
        } else if (t.kind === 'region-threshold') regionLimits[t.region] = t.maxDiffRatio;
        else if (t.kind === 'exempt-regions') {
          if (t.widths.includes(w)) t.regions.forEach((r) => exempt.add(r));
        } else if (t.kind === 'mask-regions') {
          for (const id of t.regions) {
            exempt.add(id);
            const b = baseMetrics.regions[id];
            if (b) baseRegionMasks.push(b);
            const l = (await measureAll(page, REGIONS[id].local, fullPage))[0];
            if (l) localRegionMasks.push(l);
          }
        } else if (t.kind === 'split-region') splits.push({ region: t.region, elements: t.elements });
        else if (t.kind === 'excise' && t.from !== 'layout')
          exciseRects.push(...(await measureAll(page, t.local, fullPage)));
      }

    const png = await page.screenshot({
      fullPage,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      mask: maskIds.map((id) => page.locator(MASKS[id].local)),
      maskColor: MASK_COLOR,
    });
    let localImg = decodePng(png);
    let baseImg = baseImg0;

    // `excise`: the portal's own boxes come out of its screenshot; everything measured below them moves up.
    const skip = new Set<string>();
    const bands = mergeBands(exciseRects, localImg.height);
    if (bands.length) {
      localImg = exciseRows(localImg, bands);
      // A viewport screenshot keeps the viewport's height on live: the same number of rows go from its bottom.
      if (!fullPage && localImg.height < baseImg.height)
        baseImg = crop(baseImg, [0, 0, baseImg.width, localImg.height]);
      const shift = (rs: Rect[]) => rs.map((r) => shiftPastBands(r, bands)).filter((r): r is Rect => r !== null);
      const moved: typeof localElements = {};
      for (const [k, v] of Object.entries(localElements)) {
        const r = shiftPastBands(v.rect, bands);
        if (r) moved[k] = { ...v, rect: r };
        else skip.add(k);
      }
      localElements = moved;
      for (const id of Object.keys(localRegions)) {
        const r = localRegions[id];
        localRegions[id] = r ? shiftPastBands(r, bands) : null;
      }
      for (const id of Object.keys(localMasksById)) localMasksById[id] = shift(localMasksById[id]);
      localMaskRects = shift(localMaskRects);
      localDeviationRects = shift(localDeviationRects);
      localRegionMasks = shift(localRegionMasks);
    }

    // Masks of either side are painted on both images.
    const baseMaskRects = Object.values(baseMetrics.masks).flat();
    const deviationRects = [...baseDeviationRects, ...localDeviationRects];
    const regionMaskRects = [...baseRegionMasks, ...localRegionMasks];
    const allMasks = [...baseMaskRects, ...localMaskRects, ...deviationRects, ...regionMaskRects];
    for (const k of [
      ...keysInside(baseMetrics.elements, deviationRects),
      ...keysInside(localElements, deviationRects),
      ...keysWithin(baseMetrics.elements, regionMaskRects),
      ...keysWithin(localElements, regionMaskRects),
    ])
      skip.add(k);
    // Mapped elements not visible on live (mapped-elements.ts `hiddenOnLive`: live's closed mobile sidebar dropdown)
    // are skipped by gates 1 and 2 on both sides.
    const hidden = hiddenOnLive(baseMetrics.elements, baseMetrics.regions);
    for (const k of hidden) skip.add(k);
    // Dynamic content (PLAN §6.1.4): mapped elements wholly under a dynamic mask of the baseline ("Updated N ago",
    // `updated`) are masked in gate 3 and, by the Integrator's decision, exempt from gate 2 as well: the text's width
    // depends on the date. Gate 1 still compares their styles; the rest of the page footer is still compared.
    const dynamic = keysWithin(baseMetrics.elements, baseMaskRects);

    // ---- gate 1: computed styles
    const styleFailures = gateStyles(baseMetrics.elements, localElements, GATE1_PROPS, skip);
    // ---- gate 2: geometry
    const geometryFailures = gateGeometry(
      baseMetrics.elements,
      localElements,
      DEFAULT_LIMITS.geometryTolerancePx,
      new Set([...skip, ...dynamic])
    );
    // ---- gate 3: pixels
    // `cropRegionsAtMask`: the region ends where the first box of its dynamic mask starts, on each side.
    const cropAt = (r: Rect | null, masks: readonly Rect[]): Rect | null => {
      if (!r) return r;
      const tops = masks.filter((m) => m[1] >= r[1] && m[1] < r[1] + r[3]).map((m) => m[1]);
      return tops.length ? [r[0], r[1], r[2], Math.min(...tops) - r[1]] : r;
    };
    const regions: RegionInput[] = [];
    const ownBoxRegions: RegionInput[] = [];
    for (const id of state.regions) {
      // A region the baseline does not have at this width (the sidebar at 390) is not compared;
      // the viewport comparison still sees the whole screenshot.
      if (!REGIONS[id].compared || exempt.has(id) || !baseMetrics.regions[id]) continue;
      const split = splits.find((s) => s.region === id);
      if (split) {
        // `split-region`: each mapped element is a region of its own, boxed on each side by its metrics. A piece
        // that is wholly dynamic content ("Updated N ago", masked on both sides) has nothing left to compare.
        for (const key of split.elements)
          if (baseMetrics.elements[key] && !skip.has(key) && !dynamic.has(key))
            ownBoxRegions.push({
              id: `${id}:${key}`,
              baseline: baseMetrics.elements[key].rect,
              actual: localElements[key]?.rect ?? null,
              maxDiffRatio: regionLimits[id],
            });
        continue;
      }
      let baseline: Rect | null = baseMetrics.regions[id] ?? null;
      let actual = localRegions[id] ?? null;
      for (const c of state.cropRegionsAtMask ?? [])
        if (c.region === id) {
          baseline = cropAt(baseline, baseMetrics.masks[c.mask] ?? []);
          actual = cropAt(actual, localMasksById[c.mask] ?? []);
        }
      // `ownBoxRegions` (not_found): compared on each side's own box with that side's masks only, like a split piece.
      // Its content is centred, so where the two boxes differ in width (live's box is widened by its wider list) the
      // wider is narrowed to the other's width about its centre.
      if (state.ownBoxRegions?.includes(id)) {
        if (baseline && actual && Math.abs(baseline[2] - actual[2]) > 0.5) {
          const w = Math.min(baseline[2], actual[2]);
          const narrow = (r: Rect): Rect => [r[0] + (r[2] - w) / 2, r[1], w, r[3]];
          baseline = narrow(baseline);
          actual = narrow(actual);
        }
        ownBoxRegions.push({ id, baseline, actual, maxDiffRatio: regionLimits[id] });
      } else regions.push({ id, baseline, actual, maxDiffRatio: regionLimits[id] });
    }
    const pixels = gatePixels(baseImg, localImg, regions, { masks: allMasks, exemptViewport: exempt.has('viewport') });
    if (ownBoxRegions.length) {
      // Split pieces are compared on their own boxes, which the two sides may frame at different scroll offsets
      // (D-7: the portal's page is longer by the Discord button, so it scrolls further). Each image is painted with
      // its own side's masks only: the other side's, at the same viewport coordinates, would land on content.
      const bOwn = { ...baseImg, data: new Uint8Array(baseImg.data) };
      const lOwn = { ...localImg, data: new Uint8Array(localImg.data) };
      paintRects(bOwn, [...baseMaskRects, ...baseDeviationRects, ...baseRegionMasks]);
      paintRects(lOwn, [...localMaskRects, ...localDeviationRects, ...localRegionMasks]);
      const own = gatePixels(bOwn, lOwn, ownBoxRegions, { exemptViewport: true });
      pixels.regions.push(...own.regions);
      pixels.ok = pixels.ok && own.regions.every((r) => r.ok);
      regions.push(...ownBoxRegions);
    }

    // ---- evidence for PX entries
    const b = { ...baseImg, data: new Uint8Array(baseImg.data) };
    const l = { ...localImg, data: new Uint8Array(localImg.data) };
    paintRects(b, allMasks);
    paintRects(l, allMasks);
    const diffPng = encodePng(diffImage(b, diffImages(b, l)));
    await testInfo.attach(`${stem}-actual.png`, { body: png, contentType: 'image/png' });
    await testInfo.attach(`${stem}-diff.png`, {
      body: diffPng,
      contentType: 'image/png',
    });
    await testInfo.attach(`${stem}-gates.json`, {
      body: JSON.stringify({ styleFailures, geometryFailures, pixels }, null, 1),
      contentType: 'application/json',
    });

    const report = {
      state: state.id,
      width: w,
      fullPage,
      gate1: { ok: styleFailures.length === 0, failures: styleFailures },
      gate2: { ok: geometryFailures.length === 0, failures: geometryFailures },
      gate3: {
        ok: pixels.viewport.ok && pixels.regions.every((r) => r.ok),
        viewport: pixels.viewport,
        regions: pixels.regions,
      },
      // Region boxes on each side (screenshot coordinates), for cropping evidence.
      regionBoxes: Object.fromEntries(regions.map((r) => [r.id, { baseline: r.baseline, actual: r.actual }])),
      sizes: { baseline: [baseImg.width, baseImg.height], actual: [localImg.width, localImg.height] },
      network: adapter.guardLog,
    };
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, `${stem}.json`), JSON.stringify(report, null, 1));
    fs.writeFileSync(path.join(REPORT_DIR, `${stem}-actual.png`), png);
    fs.writeFileSync(path.join(REPORT_DIR, `${stem}-diff.png`), diffPng);

    expect.soft(styleFailures, 'gate 1: computed styles').toEqual([]);
    expect.soft(geometryFailures, 'gate 2: geometry within 0.5px').toEqual([]);
    expect
      .soft(
        pixels.regions.filter((r) => !r.ok),
        'gate 3: regions ≤ 1.0% (or the registered limit)'
      )
      .toEqual([]);
    expect(pixels.viewport.ok, `gate 3: viewport ${(pixels.viewport.ratio * 100).toFixed(2)}% (limit 0.5%)`).toBe(true);
  });
}

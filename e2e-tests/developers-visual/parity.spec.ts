/**
 * Visual parity (PLAN.md §6.1.4): for each state × width, run the recipe through the LOCAL adapter
 * and apply the three gates against the committed Roboto baseline and its metrics file.
 *
 * Run by `playwright.devportal-visual.config.ts` (owned by W16): projects `visual-1440` …
 * `visual-390`, deviceScaleFactor 1, baseURL = the local portal. A test whose width is not one of
 * the state's widths is skipped with the reason from `states.ts` (I-2).
 *
 * Until the page objects exist the local adapter throws 'local adapter: not implemented', so every
 * test fails at the recipe; that is expected for Phase 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { STATES, type Width } from './states.ts';
import { REGIONS, MASKS, DEFAULT_MASKS, MASK_COLOR } from './regions.ts';
import { GATE1_PROPS, MAPPED_ELEMENTS } from './mapped-elements.ts';
import { deviationsFor } from './deviations.ts';
import { LocalAdapter } from './adapters/local.ts';
import { measureAll, measureElements, unionRect, type MetricsFile, type Rect } from './capture/metrics.ts';
import { currentEnv, envDifferences, type EnvFingerprint } from './capture/env.ts';
import { fontSource } from './adapters/live.ts';
import { decodePng, encodePng } from './png.ts';
import {
  DEFAULT_LIMITS,
  diffImage,
  diffImages,
  gateGeometry,
  gatePixels,
  gateStyles,
  keysInside,
  paintRects,
  type RegionInput,
} from './gates.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINES = path.join(here, 'baselines');

let envChecked: string[] | null = null;

for (const state of STATES) {
  test(state.id, async ({ page, browser }, testInfo) => {
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
    const baseImg = decodePng(fs.readFileSync(path.join(BASELINES, 'roboto', `${stem}.png`)));

    // ---- drive the portal through the same recipe
    const adapter = new LocalAdapter(page);
    await adapter.goto(state.path);
    await state.recipe(adapter);

    const fullPage = !!state.fullPage;
    if (fullPage) await adapter.prepareFullPage();
    const maskIds = state.masks ?? DEFAULT_MASKS;
    const local = await measureElements(page, Object.fromEntries(MAPPED_ELEMENTS.map((e) => [e.key, e.local])));
    const localElements = Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, { rect: fullPage ? v.docRect : v.rect, style: v.style }])
    );
    const localRegions: Record<string, Rect | null> = {};
    for (const id of state.regions) {
      const def = REGIONS[id];
      const rects = await measureAll(page, def.local, fullPage);
      localRegions[id] = def.pick === 'union' ? unionRect(rects) : (rects[0] ?? null);
    }
    const localMaskRects: Rect[] = [];
    for (const id of maskIds) localMaskRects.push(...(await measureAll(page, MASKS[id].local, fullPage)));

    // ---- deviations (deviations.ts is the only place they are declared)
    const deviations = deviationsFor(state.id);
    const deviationRects: Rect[] = [];
    const regionLimits: Record<string, number> = {};
    const exempt = new Set<string>();
    for (const d of deviations)
      for (const t of d.treatments) {
        if (t.kind === 'mask') {
          deviationRects.push(...(baseMetrics.deviations[d.id] ?? []));
          if (t.local) deviationRects.push(...(await measureAll(page, t.local, fullPage)));
        } else if (t.kind === 'region-threshold') regionLimits[t.region] = t.maxDiffRatio;
        else if (t.kind === 'exempt-regions' && t.widths.includes(w)) t.regions.forEach((r) => exempt.add(r));
      }

    const png = await page.screenshot({
      fullPage,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      mask: maskIds.map((id) => page.locator(MASKS[id].local)),
      maskColor: MASK_COLOR,
    });
    const localImg = decodePng(png);

    // Masks of either side are painted on both images.
    const baseMaskRects = Object.values(baseMetrics.masks).flat();
    const allMasks = [...baseMaskRects, ...localMaskRects, ...deviationRects];
    const skip = new Set([
      ...keysInside(baseMetrics.elements, deviationRects),
      ...keysInside(localElements, deviationRects),
    ]);

    // ---- gate 1: computed styles
    const styleFailures = gateStyles(baseMetrics.elements, localElements, GATE1_PROPS, skip);
    // ---- gate 2: geometry
    const geometryFailures = gateGeometry(
      baseMetrics.elements,
      localElements,
      DEFAULT_LIMITS.geometryTolerancePx,
      skip
    );
    // ---- gate 3: pixels
    const regions: RegionInput[] = state.regions
      // A region the baseline does not have at this width (the sidebar at 390) is not compared;
      // the viewport comparison still sees the whole screenshot.
      .filter((id) => REGIONS[id].compared && !exempt.has(id) && baseMetrics.regions[id])
      .map((id) => ({
        id,
        baseline: baseMetrics.regions[id] ?? null,
        actual: localRegions[id] ?? null,
        maxDiffRatio: regionLimits[id],
      }));
    const pixels = gatePixels(baseImg, localImg, regions, { masks: allMasks, exemptViewport: exempt.has('viewport') });

    // ---- evidence for PX entries
    const b = { ...baseImg, data: new Uint8Array(baseImg.data) };
    const l = { ...localImg, data: new Uint8Array(localImg.data) };
    paintRects(b, allMasks);
    paintRects(l, allMasks);
    await testInfo.attach(`${stem}-actual.png`, { body: png, contentType: 'image/png' });
    await testInfo.attach(`${stem}-diff.png`, {
      body: encodePng(diffImage(b, diffImages(b, l))),
      contentType: 'image/png',
    });
    await testInfo.attach(`${stem}-gates.json`, {
      body: JSON.stringify({ styleFailures, geometryFailures, pixels }, null, 1),
      contentType: 'application/json',
    });

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

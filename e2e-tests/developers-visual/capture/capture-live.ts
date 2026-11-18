/**
 * Captures the visual baselines from live developers.sefaria.org (PLAN.md §6.1.3).
 *
 * Standalone Node script (no Playwright test runner). Runs every state of states.ts through the
 * live adapter at 1× scale for each of the state's widths, twice:
 *   baselines/raw/<state>-visual-<w>.jpg        live as it is, JPEG q90 (a record; never compared)
 *   baselines/roboto/<state>-visual-<w>.png     Roboto + Heebo injected, optimized lossless PNG
 *   baselines/roboto/<state>-visual-<w>.metrics.json   boxes and computed styles (gates 1, 2)
 * and writes baselines/ENV.json and baselines/capture-report.json.
 *
 * Usage (from the repo root):
 *   node e2e-tests/developers-visual/capture/capture-live.ts                # everything
 *   node e2e-tests/developers-visual/capture/capture-live.ts --only v3_default,home --widths 1440
 *   node e2e-tests/developers-visual/capture/capture-live.ts --out /tmp/x  # anywhere but baselines/
 * Options: --only <ids>  --widths <list>  --variants raw,roboto  --concurrency <n, max 2>  --out <dir>
 *
 * Live is read-only: the guard in capture/browser.ts aborts the metrics proxy and every non-GET
 * request to developers.sefaria.org, and Try It is fulfilled from fixtures. The report lists every
 * aborted and fulfilled request per job.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright';
import { STATES, VIEWPORTS, type VisualState, type Width } from '../states.ts';
import { REGIONS, MASKS, DEFAULT_MASKS, MASK_COLOR } from '../regions.ts';
import { MAPPED_ELEMENTS } from '../mapped-elements.ts';
import { deviationsFor } from '../deviations.ts';
import { LiveAdapter, fontSource } from '../adapters/live.ts';
import { launchChromium } from './browser.ts';
import { formatMetrics, measureAll, measureElements, unionRect, type MetricsFile, type Rect } from './metrics.ts';
import { currentEnv } from './env.ts';
import { decodePng, encodePng, samePixels } from '../png.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

type Variant = 'raw' | 'roboto';

interface Args {
  only: string[] | null;
  widths: Width[] | null;
  variants: Variant[];
  concurrency: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = get('only');
  const widths = get('widths');
  return {
    only: only ? only.split(',') : null,
    widths: widths ? (widths.split(',').map(Number) as Width[]) : null,
    variants: (get('variants')?.split(',') as Variant[]) ?? ['raw', 'roboto'],
    concurrency: Math.min(2, Number(get('concurrency') ?? 2)),
    out: path.resolve(get('out') ?? path.join(ROOT, 'baselines')),
  };
}

interface Job {
  state: VisualState;
  width: Width;
  variant: Variant;
}

interface JobReport {
  state: string;
  width: number;
  variant: Variant;
  ok: boolean;
  attempts: number;
  error?: string;
  file?: string;
  bytes?: number;
  aborted: string[];
  fulfilled: string[];
  deploy?: string | null;
  /** Regions of the state that do not exist on live at this width (not compared there). */
  absentRegions?: string[];
}

async function runJob(browser: Browser, job: Job, out: string): Promise<JobReport> {
  const { state, width, variant } = job;
  const vp = VIEWPORTS[width];
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
  });
  const report: JobReport = { state: state.id, width, variant, ok: false, attempts: 1, aborted: [], fulfilled: [] };
  try {
    const adapter = await LiveAdapter.create(context, { fonts: variant === 'roboto' ? 'roboto' : 'system' });
    const page = adapter.page;
    await adapter.goto(state.path);
    report.deploy = await page.evaluate(
      () => document.querySelector('meta[name="readme-deploy"]')?.getAttribute('content') ?? null
    );
    if (variant === 'roboto') {
      const ok = await page.evaluate(() => document.fonts.check('16px Roboto'));
      if (!ok) throw new Error('Roboto did not load');
    }
    await state.recipe(adapter);
    const fullPage = !!state.fullPage;
    if (fullPage) await adapter.prepareFullPage();
    const stem = `${state.id}-visual-${width}`;
    const maskIds = state.masks ?? DEFAULT_MASKS;
    if (variant === 'raw') {
      const file = path.join(out, 'raw', `${stem}.jpg`);
      await page.screenshot({
        path: file,
        type: 'jpeg',
        quality: 90,
        fullPage,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      });
      report.file = path.relative(ROOT, file);
      report.bytes = fs.statSync(file).size;
    } else {
      // Measure first (the screenshot's mask overlay is removed afterwards, but measuring first
      // keeps the DOM untouched by Playwright).
      const elements = await measureElements(page, Object.fromEntries(MAPPED_ELEMENTS.map((e) => [e.key, e.live])));
      const regions: Record<string, Rect> = {};
      for (const id of new Set([...state.regions, 'header', 'sidebar'] as const)) {
        const def = REGIONS[id];
        const rects = await measureAll(page, def.live, fullPage);
        const r = def.pick === 'union' ? unionRect(rects) : (rects[0] ?? null);
        if (r) regions[id] = r;
      }
      const masks: Record<string, Rect[]> = {};
      for (const id of maskIds) {
        const rects = await measureAll(page, MASKS[id].live, fullPage);
        if (rects.length) masks[id] = rects;
      }
      const deviations: Record<string, Rect[]> = {};
      for (const d of deviationsFor(state.id))
        for (const t of d.treatments)
          if (t.kind === 'mask' && t.live) {
            let rects = await measureAll(page, t.live, fullPage);
            if (t.liveClipLeftPx) rects = rects.map(([x, y, , h]) => [x, y, t.liveClipLeftPx!, h] as Rect);
            if (rects.length) deviations[d.id] = [...(deviations[d.id] ?? []), ...rects];
          }
      const scroll = await page.evaluate(() => {
        const root = document.querySelector('[class*="ContentWithOwlbot-content"]');
        return { x: window.scrollX, y: window.scrollY + (root ? root.scrollTop : 0) };
      });
      const png = await page.screenshot({
        type: 'png',
        fullPage,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        mask: maskIds.map((id) => page.locator(MASKS[id].live)),
        maskColor: MASK_COLOR,
      });
      const decoded = decodePng(png);
      const optimized = encodePng(decoded);
      if (!samePixels(decodePng(optimized), decoded)) throw new Error('PNG optimization was not lossless');
      const best = optimized.length < png.length ? optimized : png;
      const file = path.join(out, 'roboto', `${stem}.png`);
      fs.writeFileSync(file, best);
      // Coordinates in the metrics file are screenshot coordinates: viewport or document.
      const elementsOut = Object.fromEntries(
        Object.entries(elements).map(([k, v]) => [
          k,
          { rect: fullPage ? v.docRect : v.rect, docRect: v.docRect, style: v.style },
        ])
      );
      const metrics: MetricsFile = {
        state: state.id,
        width,
        height: vp.height,
        fullPage,
        scroll,
        image: { width: decoded.width, height: decoded.height },
        elements: elementsOut,
        regions,
        masks,
        deviations,
      };
      fs.writeFileSync(path.join(out, 'roboto', `${stem}.metrics.json`), formatMetrics(metrics));
      report.file = path.relative(ROOT, file);
      report.bytes = best.length;
      report.absentRegions = state.regions.filter((r) => !regions[r]);
    }
    adapter.tryIt.release();
    report.aborted = adapter.guardLog.aborted;
    report.fulfilled = adapter.guardLog.fulfilled;
    report.ok = true;
  } finally {
    await context.close().catch(() => undefined);
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.join(args.out, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(args.out, 'roboto'), { recursive: true });
  const jobs: Job[] = [];
  for (const state of STATES) {
    if (args.only && !args.only.includes(state.id)) continue;
    for (const width of state.widths) {
      if (args.widths && !args.widths.includes(width)) continue;
      for (const variant of args.variants) jobs.push({ state, width, variant });
    }
  }
  const browser = await launchChromium();
  const env = await currentEnv(browser, fontSource().dir);
  const started = new Date().toISOString();
  console.log(`capturing ${jobs.length} jobs with ${args.concurrency} contexts into ${args.out}`);
  const reports: JobReport[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let rep: JobReport | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          rep = await runJob(browser, job, args.out);
          rep.attempts = attempt;
          break;
        } catch (e) {
          rep = {
            state: job.state.id,
            width: job.width,
            variant: job.variant,
            ok: false,
            attempts: attempt,
            error: String((e as Error).message ?? e).split('\n')[0],
            aborted: [],
            fulfilled: [],
          };
        }
      }
      reports.push(rep!);
      console.log(
        `${rep!.ok ? 'ok  ' : 'FAIL'} ${job.state.id} ${job.width} ${job.variant}${rep!.error ? ' — ' + rep!.error : ''}`
      );
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  await browser.close();
  reports.sort((a, b) => `${a.state}${a.width}${a.variant}`.localeCompare(`${b.state}${b.width}${b.variant}`));
  const deploys = [...new Set(reports.map((r) => r.deploy).filter(Boolean))];
  const reportFile = path.join(args.out, 'capture-report.json');
  const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
  // A partial run (--only/--widths) merges into the previous report instead of replacing it.
  const merged = new Map<string, JobReport>();
  for (const r of (args.only || args.widths) && previous ? previous.jobs : [])
    merged.set(`${r.state}|${r.width}|${r.variant}`, r);
  for (const r of reports) merged.set(`${r.state}|${r.width}|${r.variant}`, r);
  const allJobs = [...merged.values()].sort((a, b) =>
    `${a.state}${a.width}${a.variant}`.localeCompare(`${b.state}${b.width}${b.variant}`)
  );
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        started: (args.only || args.widths) && previous ? previous.started : started,
        finished: new Date().toISOString(),
        readmeDeploy: deploys.length ? deploys : previous?.readmeDeploy,
        jobs: allJobs.map((r) => ({
          state: r.state,
          width: r.width,
          variant: r.variant,
          ok: r.ok,
          attempts: r.attempts,
          error: r.error,
          file: r.file,
          bytes: r.bytes,
          absentRegions: r.absentRegions?.length ? r.absentRegions : undefined,
          aborted: r.aborted.map((u) => u.replace(/groupId=[^&]+/, 'groupId=…').replace(/oneshot\/.*$/, 'oneshot/…')),
          fulfilled: r.fulfilled,
        })),
      },
      null,
      1
    ) + '\n'
  );
  fs.writeFileSync(path.join(args.out, 'ENV.json'), JSON.stringify(env, null, 2) + '\n');
  const failed = reports.filter((r) => !r.ok || r.error);
  console.log(`\n${reports.length - failed.length}/${reports.length} clean; readme-deploy ${deploys.join(', ')}`);
  if (failed.length) process.exitCode = 1;
}

await main();

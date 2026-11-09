// auth-service/k6/arms.js — the latency the API-key gateway adds, phase 1 contract.
//
// Four arms, each its own constant-arrival-rate scenario at the same low fixed rate, run side by side so they see
// the same host conditions. Every arm sends the same request shape; the arm is where it goes and which key it sends:
//
//   base   BASE_NOAUTHZ + PATH with the valid key   Envoy without ext_authz (the local stack's drill listener).
//                                                   Left out when BASE_NOAUTHZ is empty: on a cluster the baseline
//                                                   is a separate run with authService.enabled=false (compare.py).
//   anon   BASE + ANON_PATH, no key                 ext_authz runs, finds no key, allows (ANON_PATH is not gated).
//   hit    BASE + PATH with the valid key           the key is in the auth service's in-memory registry. Phase 1
//                                                   has no response cache: every request is a Check call, and a
//                                                   "hit" is a found key, the common case.
//   miss   BASE + PATH with an unknown key          the registry lookup fails: 401 api_key_invalid in enforce on
//                                                   the gated path (a local reply from Envoy, so no upstream time
//                                                   and no "added" figure), 200 in observe.
//
// Env: BASE (required), BASE_NOAUTHZ, HOST (Host header; empty keeps the URL's), PATH_GATED (default /api/knn-search),
//      ANON_PATH (default /api/texts/Genesis.1, never gated), AUTH_MODE (enforce|observe: what miss expects on a gated path),
//      MISS_STATUS (what miss must answer; default 401 in enforce, 200 in observe: set 200 when PATH_GATED is not a
//      gated path), KEY_FILE (the valid key, either the bare value or an "x-api-key: <value>" line), ARMS (default
//      all four), RATE (requests/s per arm, default 20), DURATION (default 60s), SUMMARY_FILE (JSON written by
//      handleSummary), SUMMARY_STDOUT=1 (also print it as one "SUMMARY_JSON {...}" line, for a cluster Job's log).
//      KEY_STATUS_CHECK=1: hit must come back without x-sefaria-key-status and miss with "not_accepted" (the chart's
//      nginx echoes the gateway's verdict; set it on a cluster with the auth service on, where the path is ungated).
// The key is read from a file so it never appears in argv or in the k6 output; the summary holds no key material.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE;
const BASE_NOAUTHZ = __ENV.BASE_NOAUTHZ || '';
const HOST = __ENV.HOST || '';
const PATH = __ENV.PATH_GATED || '/api/knn-search';
const ANON_PATH = __ENV.ANON_PATH || '/api/texts/Genesis.1';
const MODE = __ENV.AUTH_MODE || 'enforce';
const RATE = Number(__ENV.RATE || 20);
const DURATION = __ENV.DURATION || '60s';
const SUMMARY_FILE = __ENV.SUMMARY_FILE || '';
const UNKNOWN = 'sfr_k6unknown0000000000000000000000000';
const KEY_STATUS_CHECK = __ENV.KEY_STATUS_CHECK === '1';

if (!BASE) throw new Error('BASE is required');
if (!['enforce', 'observe'].includes(MODE)) throw new Error(`AUTH_MODE must be enforce or observe, got ${MODE}`);

function readKey(path) {
  if (!path) return '';
  const raw = open(path).trim();
  const i = raw.indexOf(':');
  return (raw.toLowerCase().startsWith('x-api-key') && i >= 0 ? raw.slice(i + 1) : raw).trim();
}
const KEY = readKey(__ENV.KEY_FILE || '');

const ALL = ['base', 'anon', 'hit', 'miss'];
let arms = (__ENV.ARMS || ALL.join(',')).split(',').map((a) => a.trim()).filter(Boolean);
if (!BASE_NOAUTHZ) arms = arms.filter((a) => a !== 'base');
for (const a of arms) if (!ALL.includes(a)) throw new Error(`unknown arm ${a}`);
if (!KEY && arms.some((a) => a === 'base' || a === 'hit')) throw new Error('KEY_FILE is required for the base and hit arms');

// What each arm must answer. An unexpected status fails the arm's check threshold, so a misrouted run never
// produces a latency number that looks valid.
const EXPECT = { base: 200, anon: 200, hit: 200, miss: Number(__ENV.MISS_STATUS || 0) || (MODE === 'enforce' ? 401 : 200) };
http.setResponseCallback(http.expectedStatuses(200, 401));

const scenarios = {};
const thresholds = {};
for (const a of arms) {
  scenarios[a] = {
    executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: DURATION,
    preAllocatedVUs: 5, maxVUs: 20, exec: a, tags: { arm: a },
  };
  thresholds[`checks{arm:${a}}`] = ['rate==1'];
  // The ext_authz timeout is 200 ms; a p99 near it would mean Envoy fails open under this load.
  thresholds[`http_req_duration{arm:${a}}`] = ['p(99)<200'];
}
// A run that could not keep its rate is not a measurement at that rate: at most 1% of the requests may be dropped.
thresholds.dropped_iterations = [`rate<=${RATE * arms.length * 0.01}`];
export const options = {
  scenarios, thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(99)', 'p(99.9)', 'max', 'count'],
  discardResponseBodies: true,
};

function send(arm, base, path, key) {
  const headers = {};
  if (HOST) headers.Host = HOST;
  if (key) headers['x-api-key'] = key;
  const r = http.get(`${base}${path}`, { headers, tags: { arm } });
  const checks = { [`${arm} status ${EXPECT[arm]}`]: (x) => x.status === EXPECT[arm] };
  // On an ungated path a bad key still gets 200, so the status alone cannot prove the hit arm's key was accepted.
  // Through the chart's nginx the gateway's verdict comes back as x-sefaria-key-status: not_accepted.
  if (KEY_STATUS_CHECK && arm === 'hit') checks['hit key accepted (no x-sefaria-key-status)'] = (x) => !x.headers['X-Sefaria-Key-Status'];
  if (KEY_STATUS_CHECK && arm === 'miss') checks['miss key not accepted'] = (x) => x.headers['X-Sefaria-Key-Status'] === 'not_accepted';
  check(r, checks, { arm });
}
export function base() { send('base', BASE_NOAUTHZ, PATH, KEY); }
export function anon() { send('anon', BASE, ANON_PATH, ''); }
export function hit() { send('hit', BASE, PATH, KEY); }
export function miss() { send('miss', BASE, PATH, UNKNOWN); }

export function handleSummary(data) {
  const out = { mode: MODE, rate_per_arm: RATE, duration: DURATION, arms: {} };
  for (const a of arms) {
    const d = data.metrics[`http_req_duration{arm:${a}}`];
    const c = data.metrics[`checks{arm:${a}}`];
    if (!d) continue;
    const v = d.values;
    out.arms[a] = {
      n: v.count, p50: v.med, p90: v['p(90)'], p99: v['p(99)'], p999: v['p(99.9)'], max: v.max,
      checks_rate: c ? c.values.rate : null,
    };
  }
  if (out.arms.base) {
    out.added = {};
    // A 401 miss is Envoy's local reply (no upstream), so subtracting the base arm would mean nothing.
    for (const a of EXPECT.miss === 401 ? ['anon', 'hit'] : ['anon', 'hit', 'miss']) {
      if (!out.arms[a]) continue;
      out.added[a] = { p50: out.arms[a].p50 - out.arms.base.p50, p99: out.arms[a].p99 - out.arms.base.p99 };
    }
  }
  const lines = [`arms (${MODE}, ${RATE}/s per arm, ${DURATION})`];
  for (const [a, v] of Object.entries(out.arms)) {
    lines.push(`  ${a.padEnd(5)} n=${v.n} p50=${v.p50.toFixed(3)} p90=${v.p90.toFixed(3)} p99=${v.p99.toFixed(3)} max=${v.max.toFixed(3)} ms checks=${v.checks_rate}`);
  }
  for (const [a, v] of Object.entries(out.added || {})) {
    lines.push(`  added ${a}: p50 ${v.p50 >= 0 ? '+' : ''}${v.p50.toFixed(3)} ms, p99 ${v.p99 >= 0 ? '+' : ''}${v.p99.toFixed(3)} ms`);
  }
  if (__ENV.SUMMARY_STDOUT === '1') lines.push('SUMMARY_JSON ' + JSON.stringify(out));
  const res = { stdout: lines.join('\n') + '\n' };
  if (SUMMARY_FILE) res[SUMMARY_FILE] = JSON.stringify(out, null, 2) + '\n';
  return res;
}

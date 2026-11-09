// auth-service/k6/replicas.js — one versus two auth-service replicas behind Envoy, phase 1 contract: sequential
// requests (one VU) with the valid key and with an unknown key on the gated path, counting every status. Phase 1
// ships with rate limiting off, so a 429 is a failure, and each request must get the same decision whichever
// replica answered it (both load the same registry).
//
// Env: BASE (Envoy with ext_authz, required), HOST, PATH_GATED (default /api/knn-search), AUTH_MODE (enforce|observe),
//      KEY_FILE (the valid key: bare value or an "x-api-key: <value>" line), ITERATIONS (default 300), SUMMARY_FILE.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE;
if (!BASE) throw new Error('BASE is required');
const HOST = __ENV.HOST || '';
const PATH = __ENV.PATH_GATED || '/api/knn-search';
const MODE = __ENV.AUTH_MODE || 'enforce';
const ITERATIONS = Number(__ENV.ITERATIONS || 300);
const SUMMARY_FILE = __ENV.SUMMARY_FILE || '';
const UNKNOWN = 'sfr_k6unknown0000000000000000000000000';

const raw = open(__ENV.KEY_FILE).trim();
const KEY = (raw.toLowerCase().startsWith('x-api-key') ? raw.slice(raw.indexOf(':') + 1) : raw).trim();
if (!KEY) throw new Error('KEY_FILE holds no key');

const status = {
  200: new Counter('status_200'), 401: new Counter('status_401'), 403: new Counter('status_403'),
  429: new Counter('status_429'), other: new Counter('status_other'),
};
http.setResponseCallback(http.expectedStatuses(200, 401));

export const options = {
  scenarios: { seq: { executor: 'shared-iterations', vus: 1, iterations: ITERATIONS, maxDuration: '5m' } },
  thresholds: { checks: ['rate==1'], status_429: ['count==0'], status_other: ['count==0'] },
  summaryTrendStats: ['med', 'p(99)', 'max', 'count'],
  discardResponseBodies: true,
};

function one(key, want, label) {
  const headers = { 'x-api-key': key };
  if (HOST) headers.Host = HOST;
  const r = http.get(`${BASE}${PATH}`, { headers, tags: { kind: label } });
  (status[r.status] || status.other).add(1);
  check(r, { [`${label} ${want}`]: (x) => x.status === want });
}

export default function () {
  one(KEY, 200, 'valid');
  one(UNKNOWN, MODE === 'enforce' ? 401 : 200, 'unknown');
}

export function handleSummary(data) {
  const m = data.metrics;
  const count = (name) => (m[name] ? m[name].values.count : 0);
  const d = m.http_req_duration.values;
  const out = {
    mode: MODE, iterations: ITERATIONS,
    status: { 200: count('status_200'), 401: count('status_401'), 403: count('status_403'), 429: count('status_429'), other: count('status_other') },
    latency: { n: d.count, p50: d.med, p99: d['p(99)'], max: d.max },
    checks_rate: m.checks ? m.checks.values.rate : null,
  };
  const res = {
    stdout: `replicas (${MODE}): ${JSON.stringify(out.status)} p50=${d.med.toFixed(3)} p99=${d['p(99)'].toFixed(3)} ms checks=${out.checks_rate}\n`,
  };
  if (SUMMARY_FILE) res[SUMMARY_FILE] = JSON.stringify(out, null, 2) + '\n';
  return res;
}

// auth-service/k6/authsvc-direct.js — the auth service on its own, bypassing Envoy: ext_authz Check calls over gRPC
// (the server registers reflection, so no proto files are needed), keys round-robin from KEYS_FILE, at a fixed
// arrival rate. The result is the service's own latency including the gRPC hop, to hold against the 200 ms
// ext_authz timeout (Envoy fails open past it).
//
// Env: ADDR (host:port of the gRPC listener, required), KEYS_FILE (one key per line; "x-api-key: " prefixes are
//      stripped), PATH_GATED (default /api/knn-search), UNKNOWN_EVERY (every Nth call sends an unknown key, default
//      10; 0 never), RATE (default 200/s), DURATION (default 30s), SUMMARY_FILE.
// No key value reaches the output: the summary carries counts and timings only.
//
// One VU: k6 registers the reflected descriptors process-wide, and several VUs reflecting at once can panic with
// "proto: message ... is already registered" (seen on this stack). A Check takes well under a millisecond, so one VU
// keeps up with a few hundred calls a second; any call it cannot start on time is counted as dropped_iterations.
import grpc from 'k6/net/grpc';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';

const ADDR = __ENV.ADDR;
if (!ADDR) throw new Error('ADDR is required');
const PATH = __ENV.PATH_GATED || '/api/knn-search';
const UNKNOWN_EVERY = Number(__ENV.UNKNOWN_EVERY || 10);
const RATE = Number(__ENV.RATE || 200);
const DURATION = __ENV.DURATION || '30s';
const SUMMARY_FILE = __ENV.SUMMARY_FILE || '';

const keys = new SharedArray('keys', () =>
  open(__ENV.KEYS_FILE)
    .split('\n')
    .map((l) => l.replace(/^x-api-key:\s*/i, '').trim())
    .filter(Boolean));
if (!keys.length) throw new Error('KEYS_FILE has no keys');

export const options = {
  scenarios: {
    direct: { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: DURATION, preAllocatedVUs: 1, maxVUs: 1 },
  },
  // A run that could not keep its rate is not a measurement at that rate: at most 1% of the calls may be dropped.
  thresholds: { 'checks': ['rate==1'], 'grpc_req_duration': ['p(99)<200'], 'dropped_iterations': [`rate<=${RATE * 0.01}`] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(99)', 'p(99.9)', 'max', 'count'],
};

const client = new grpc.Client();
let connected = false;

export default function () {
  if (!connected) {
    client.connect(ADDR, { plaintext: true, reflect: true, timeout: '5s' });
    connected = true;
  }
  const n = exec.scenario.iterationInTest;
  const unknown = UNKNOWN_EVERY > 0 && n % UNKNOWN_EVERY === UNKNOWN_EVERY - 1;
  const key = unknown ? 'sfr_k6unknown0000000000000000000000000' : keys[n % keys.length];
  const res = client.invoke('envoy.service.auth.v3.Authorization/Check', {
    attributes: { request: { http: { method: 'GET', path: PATH, headers: { 'x-api-key': key } } } },
  });
  check(res, { 'grpc OK': (r) => r && r.status === grpc.StatusOK });
}

export function handleSummary(data) {
  const v = data.metrics.grpc_req_duration ? data.metrics.grpc_req_duration.values : null;
  const out = {
    addr: ADDR, rate: RATE, duration: DURATION, keys: keys.length,
    grpc: v ? { n: v.count, p50: v.med, p90: v['p(90)'], p99: v['p(99)'], p999: v['p(99.9)'], max: v.max } : null,
    checks_rate: data.metrics.checks ? data.metrics.checks.values.rate : null,
    dropped: data.metrics.dropped_iterations ? data.metrics.dropped_iterations.values.count : 0,
  };
  const line = v
    ? `authsvc direct (${RATE}/s, ${DURATION}, ${keys.length} keys): n=${v.count} p50=${v.med.toFixed(3)} p99=${v['p(99)'].toFixed(3)} max=${v.max.toFixed(3)} ms checks=${out.checks_rate} dropped=${out.dropped}\n`
    : 'authsvc direct: no gRPC samples\n';
  const res = { stdout: line };
  if (SUMMARY_FILE) res[SUMMARY_FILE] = JSON.stringify(out, null, 2) + '\n';
  return res;
}

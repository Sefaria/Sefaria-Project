// k6/arms.js — identical load per arm on one hostname; the arm is the request shape.
import http from 'k6/http';
import { check } from 'k6';
const BASE = __ENV.BASE, HOST = __ENV.HOST || 'authpoc.cauldron.sefaria.org';
const MINT = __ENV.MINT || 'http://mint-authpoc.default.svc.cluster.local:8081';
const RATE = Number(__ENV.RATE || 50), DURATION = __ENV.DURATION || '3m';
const ARMS = (__ENV.ARMS || 'anon,key,embed,jwt').split(',');
const scen = (name) => ({ executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: DURATION, preAllocatedVUs: 20, maxVUs: 100, exec: name, tags: { arm: name } });
const scenarios = {}, thresholds = {};
for (const a of ARMS) { scenarios[a] = scen(a); thresholds[`http_req_failed{arm:${a}}`] = ['rate==0']; thresholds[`http_req_duration{arm:${a}}`] = ['p(99)<5000']; }
export const options = { scenarios, thresholds, summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'p(99.9)', 'max'] };
export function setup() { return { token: ARMS.includes('jwt') ? http.get(`${MINT}/token?sub=sefaria-web&tier=firstparty&ttl=7200`).json('token') : '' }; }
const PATH = '/api/texts/Genesis.1';   // Varnish-cacheable; warmed by the first requests
function hit(arm, headers) {
  const r = http.get(`${BASE}${PATH}`, { headers: Object.assign({ Host: HOST }, headers), tags: { arm } });
  check(r, { 'status 200': (x) => x.status === 200 });
}
export function anon()      { hit('anon', {}); }
export function key()       { hit('key', { 'x-api-key': 'sfr_alpha000000000000000000000000001' }); }
export function embed()     { hit('embed', { Origin: 'https://embed-one.example.org' }); }
export function jwt(data)   { hit('jwt',   { Authorization: `Bearer ${data.token}` }); }
export function handleSummary(data) {
  const out = {};
  for (const a of ARMS) { const m = data.metrics[`http_req_duration{arm:${a}}`]; if (m) out[a] = m.values; }
  return { stdout: JSON.stringify(out, null, 2) + '\n' };
}

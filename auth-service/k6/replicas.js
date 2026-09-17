import http from 'k6/http';
import { Counter } from 'k6/metrics';

const ok = new Counter('ok_200'), limited = new Counter('limited_429');
export const options = { vus: 1, iterations: 30 };
let printed = false;
export default function () {
  const headers = { 'x-probe': 'k6-replicas' };
  if (__ENV.KEY) headers['x-api-key'] = __ENV.KEY;
  if (__ENV.ORIGIN) headers['Origin'] = __ENV.ORIGIN;
  if (__ENV.TOKEN) headers['Authorization'] = `Bearer ${__ENV.TOKEN}`;
  const r = http.get(`https://${__ENV.HOST}/api/texts/Genesis.1`, { headers });
  if (r.status === 200) ok.add(1); else if (r.status === 429) limited.add(1);
  if (r.status === 429 && !printed) {
    printed = true;
    console.log(`429 headers: retry-after=${r.headers['Retry-After']} x-ratelimit-limit=${r.headers['X-Ratelimit-Limit']} remaining=${r.headers['X-Ratelimit-Remaining']} reset=${r.headers['X-Ratelimit-Reset']} x-envoy-ratelimited=${r.headers['X-Envoy-Ratelimited']} content-type=${r.headers['Content-Type']} body=${String(r.body).slice(0, 300)}`);
  }
}

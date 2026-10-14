// k6/authsvc-direct.js — the auth service itself, bypassing Envoy: 1000 seeded keys round-robin at RATE rps.
import http from 'k6/http';
import { SharedArray } from 'k6/data';
const keys = new SharedArray('keys', () => open(__ENV.KEYS_FILE || '/scripts/keys.txt').split('\n').filter(Boolean));
export const options = { scenarios: { direct: { executor: 'constant-arrival-rate', rate: Number(__ENV.RATE || 500), timeUnit: '1s', duration: '60s', preAllocatedVUs: 50, maxVUs: 500 } },
  thresholds: { http_req_failed: ['rate==0'] }, summaryTrendStats: ['p(50)', 'p(99)', 'max'] };
export default function () { http.get(`${__ENV.BASE}/api/texts/Genesis.1`, { headers: { 'x-api-key': keys[__ITER % keys.length] } }); }

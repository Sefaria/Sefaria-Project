// An API cassette for the end-to-end tests (CODE_REVIEW R-13): both the node server (server-side rendering) and the browser reach the
// Sefaria API through this local proxy, which answers from recordings on disk, so the suite does not change when live data does
// (a site's page count went 145 → 144 and turned the suite red).
//
//   E2E_API_MODE=auto    (default) answer from the cassette; record what is missing from the live API
//   E2E_API_MODE=replay  answer only from the cassette; a miss is a 504 and is logged (CI: deterministic, never touches the network)
//   E2E_API_MODE=record  always ask the live API and overwrite the recording (refresh after the API changed)
//
// The user agent names "sefaria-node" (the old Node server's), which Django's language middleware never redirects to the other
// language's domain: page paths outside /api/ (the topics TOC in /data.js, /topics) are recorded as answered, not as a 302 to .org.il.
//
// Dicta (the Hebrew search's Tanakh hits, src/lib/search/dicta.ts) is recorded too, under the prefix /__dicta/: a request for
// /__dicta/search is https://sefaria.loadbalancer.dicta.org.il/search (E2E_DICTA_UPSTREAM). The browser calls Dicta directly, so the
// e2e suite routes it here (scripts/cassette/dicta-route.mjs).
//
// Recordings live in e2e/.cassette/ (not in git: tens of MB). CI downloads the bundle pinned by e2e/cassette.lock and replays it
// (scripts/cassette/bundle.mjs); without a bundle it restores them from its cache and records what is missing.
// E2E_API_PORT (default 3998), E2E_API_UPSTREAM (default https://www.sefaria.org).
//
// Local only: it listens on the loopback addresses (127.0.0.1 and ::1), never on the network, and answers CORS with credentials only
// for a loopback page origin (http://[<sub>.]localhost|127.0.0.1|[::1]:<port>), never for an arbitrary Origin.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";

const PORT = Number(process.env.E2E_API_PORT) || 3998;
const UPSTREAM = process.env.E2E_API_UPSTREAM || "https://www.sefaria.org";
const DICTA_PREFIX = "/__dicta";
const DICTA_UPSTREAM = process.env.E2E_DICTA_UPSTREAM || "https://sefaria.loadbalancer.dicta.org.il";
const MODE = process.env.E2E_API_MODE || "auto";
const DIR = process.env.E2E_CASSETTE_DIR || new URL("../e2e/.cassette/", import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const KEEP_HEADERS = ["content-type", "location"];
const misses = new Set();

const keyOf = (method, url, body) => createHash("sha1").update(`${method} ${url}\n${body ?? ""}`).digest("hex");

// localhost and its subdomains (he.localhost, voices.localhost: the e2e hosts; browsers resolve *.localhost to loopback)
const LOOPBACK_ORIGIN = /^http:\/\/(?:(?:[a-z0-9-]+\.)*localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

function cors(req, headers) {
  headers["vary"] = "Origin";
  const origin = req.headers.origin;
  // the e2e pages run on a loopback origin; any other page gets no CORS answer, so the browser keeps the response from it
  if (!origin || !LOOPBACK_ORIGIN.test(origin)) return headers;
  headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-credentials"] = "true";
  headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  headers["access-control-allow-headers"] = req.headers["access-control-request-headers"] || "content-type";
  return headers;
}

/** Where a request is recorded from: Dicta for /__dicta/…, else the Sefaria API. */
const upstreamFor = (url) =>
  url.startsWith(`${DICTA_PREFIX}/`) ? { target: `${DICTA_UPSTREAM}${url.slice(DICTA_PREFIX.length)}`, dicta: true } : { target: `${UPSTREAM}${url}`, dicta: false };

async function record(method, url, body, file, contentType) {
  const { target, dicta } = upstreamFor(url);
  // Dicta reads a JSON body; Sefaria's API is asked as before (the recordings' keys do not depend on it)
  const type = body ? (dicta ? contentType || "application/json; charset=UTF-8" : "text/plain;charset=UTF-8") : null;
  const res = await fetch(target, {
    method,
    headers: { "accept-encoding": "identity", ...(type ? { "content-type": type } : {}), "user-agent": "sefaria-reader-e2e-cassette (sefaria-node)" },
    body: body ?? undefined,
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const headers = Object.fromEntries(KEEP_HEADERS.map((h) => [h, res.headers.get(h)]).filter(([, v]) => v));
  const entry = { method, url, status: res.status, headers };
  // a server error is passed on but never recorded: a transient 502/504 would otherwise be replayed forever
  if (res.status < 500) writeFileSync(file, gzipSync(Buffer.concat([Buffer.from(JSON.stringify(entry) + "\n"), buf])));
  else console.error(`[cassette] not recorded (${res.status}): ${method} ${url}`);
  return { ...entry, body: buf };
}

/** A redirect to the live API is pointed back at this proxy, so a replayed run never reaches the network. */
const localize = (headers, req) =>
  headers.location ? { ...headers, location: headers.location.replace(UPSTREAM, `http://${req.headers.host ?? `localhost:${PORT}`}`) } : headers;

function replay(file) {
  const raw = gunzipSync(readFileSync(file));
  const nl = raw.indexOf(10);
  return { ...JSON.parse(raw.subarray(0, nl).toString()), body: raw.subarray(nl + 1) };
}

async function handle(req, res) {
  try {
    if (req.method === "OPTIONS") return res.writeHead(204, cors(req, {})).end();
    if (req.url === "/__cassette/health") return res.writeHead(200, { "content-type": "text/plain" }).end(`ok ${MODE}`);
    if (req.url === "/__cassette/misses") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify([...misses]));
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks).toString() : null;
    const file = join(DIR, `${keyOf(req.method, req.url, body)}.gz`);
    let entry;
    if (MODE !== "record" && existsSync(file)) entry = replay(file);
    else if (MODE === "replay") {
      misses.add(`${req.method} ${req.url}`);
      console.error(`[cassette] MISS ${req.method} ${req.url}`);
      return res.writeHead(504, cors(req, { "content-type": "application/json" })).end(JSON.stringify({ error: "not in the e2e cassette" }));
    } else entry = await record(req.method, req.url, body, file, req.headers["content-type"]);
    res.writeHead(entry.status, cors(req, { ...localize(entry.headers, req), "content-length": String(entry.body.length) })).end(entry.body);
  } catch (e) {
    console.error(`[cassette] ${req.method} ${req.url}: ${e}`);
    if (!res.headersSent) res.writeHead(502, cors(req, { "content-type": "text/plain" }));
    res.end(String(e));
  }
}

// both loopback addresses, as "localhost" may resolve to either; ::1 is skipped where the machine has no IPv6 loopback
for (const host of ["127.0.0.1", "::1"]) {
  const server = createServer(handle);
  server.on("error", (e) => {
    if (host === "::1" && (e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT")) return;
    throw e;
  });
  server.listen(PORT, host, () =>
    console.log(`[cassette] ${MODE} on ${host === "::1" ? "[::1]" : host}:${PORT} → ${UPSTREAM} (and ${DICTA_PREFIX}/ → ${DICTA_UPSTREAM}), recordings in ${DIR}`),
  );
}

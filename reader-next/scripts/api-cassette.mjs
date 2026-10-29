// An API cassette for the end-to-end tests (CODE_REVIEW R-13): both the node server (server-side rendering) and the browser reach the
// Sefaria API through this local proxy, which answers from recordings on disk, so the suite does not change when live data does
// (a site's page count went 145 → 144 and turned the suite red).
//
//   E2E_API_MODE=auto    (default) answer from the cassette; record what is missing from the live API
//   E2E_API_MODE=replay  answer only from the cassette; a miss is a 504 and is logged (CI: deterministic, never touches the network)
//   E2E_API_MODE=record  always ask the live API and overwrite the recording (refresh after the API changed)
//
// Recordings live in e2e/.cassette/ (not in git: tens of MB). CI restores them from its cache; a fresh checkout records on the first
// run.  E2E_API_PORT (default 3998), E2E_API_UPSTREAM (default https://www.sefaria.org).
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";

const PORT = Number(process.env.E2E_API_PORT) || 3998;
const UPSTREAM = process.env.E2E_API_UPSTREAM || "https://www.sefaria.org";
const MODE = process.env.E2E_API_MODE || "auto";
const DIR = new URL("../e2e/.cassette/", import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const KEEP_HEADERS = ["content-type", "location"];
const misses = new Set();

const keyOf = (method, url, body) => createHash("sha1").update(`${method} ${url}\n${body ?? ""}`).digest("hex");

function cors(req, headers) {
  headers["access-control-allow-origin"] = req.headers.origin || "*";
  headers["access-control-allow-credentials"] = "true";
  headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  headers["access-control-allow-headers"] = req.headers["access-control-request-headers"] || "content-type";
  headers["vary"] = "Origin";
  return headers;
}

async function record(method, url, body, file) {
  const res = await fetch(`${UPSTREAM}${url}`, {
    method,
    headers: { "accept-encoding": "identity", ...(body ? { "content-type": "text/plain;charset=UTF-8" } : {}), "user-agent": "sefaria-reader-e2e-cassette" },
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

createServer(async (req, res) => {
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
    } else entry = await record(req.method, req.url, body, file);
    res.writeHead(entry.status, cors(req, { ...localize(entry.headers, req), "content-length": String(entry.body.length) })).end(entry.body);
  } catch (e) {
    console.error(`[cassette] ${req.method} ${req.url}: ${e}`);
    if (!res.headersSent) res.writeHead(502, cors(req, { "content-type": "text/plain" }));
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`[cassette] ${MODE} on :${PORT} → ${UPSTREAM}, recordings in ${DIR}`));

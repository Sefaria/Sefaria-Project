// A local WebSocket room server, so "follow me" can be tried across devices on a LAN (a phone following a laptop) without the
// Cloudflare relay. One room per path ws://<host>:<port>/r/<sessionId>, each running the same pure room as the in-tab one
// (src/lib/session/room.ts), bundled with esbuild at start so there is no build step.
//
// Usage:  npm run room:dev            (or: node scripts/dev-room-server.mjs)
//   ROOM_PORT=3199                     port to listen on (default 3199)
//   ROOM_HOST=127.0.0.1                address to listen on (default: loopback only, this machine). For the LAN (a phone following a
//                                      laptop) set ROOM_HOST=0.0.0.0 on a network you trust: anyone on it can then reach the server
//   ROOM_ORIGINS=http://a:3100,...     browser origins allowed to connect (default: localhost/127.0.0.1 on port 3100, plus this
//                                      machine's LAN IPv4 addresses when ROOM_HOST is not loopback)
// On the LAN, point the reader at it: ROOM_HOST=0.0.0.0 npm run room:dev, then PUBLIC_ROOM_URL=ws://<lan-ip>:3199 npm run dev -- --host
//
// Development only: there is no authentication (a joiner says whether it is the host), which is why connections are limited to
// known origins.
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.ROOM_PORT || 3199);
const HOST = process.env.ROOM_HOST || "127.0.0.1";
const LOOPBACK = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
const ROOM_PATH = /^\/r\/([A-Za-z0-9_-]{8,128})$/;
/** Rooms nobody is connected to are dropped after this (the in-tab room's grace is 30 s; this only frees memory). */
const IDLE_ROOM_MS = 10 * 60_000;
const HEARTBEAT_MS = 30_000;

function defaultOrigins() {
  const hosts = ["localhost", "127.0.0.1"];
  if (!LOOPBACK) {
    for (const addrs of Object.values(networkInterfaces())) {
      for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) hosts.push(a.address);
    }
  }
  return hosts.map((h) => `http://${h}:3100`);
}
const ORIGINS = new Set(
  (process.env.ROOM_ORIGINS ? process.env.ROOM_ORIGINS.split(",") : defaultOrigins()).map((o) => o.trim()).filter(Boolean),
);

/** Bundle room.ts (and the protocol + core/diff it imports) into one ES module and import it from memory. */
async function loadRoomModule() {
  const entry = fileURLToPath(new URL("../src/lib/session/room.ts", import.meta.url));
  const result = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: false, logLevel: "error" });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const { createRoom } = await loadRoomModule();

/** sessionId → { room, sockets: Map<connId, WebSocket>, idleSince } */
const rooms = new Map();
let nextConn = 1;

function getRoom(sessionId) {
  let entry = rooms.get(sessionId);
  if (!entry) {
    entry = { room: createRoom({ now: Date.now }), sockets: new Map(), idleSince: null };
    rooms.set(sessionId, entry);
    log(`room ${sessionId} created`);
  }
  return entry;
}

function deliver(entry, out) {
  for (const { to, envelope } of out) {
    const text = JSON.stringify(envelope);
    for (const id of entry.room.recipients(to)) {
      const ws = entry.sockets.get(id);
      if (ws && ws.readyState === ws.OPEN) ws.send(text);
    }
  }
}

function log(msg) {
  console.log(`[room ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`sefaria dev room server: ${rooms.size} room(s)\n`);
});

// maxPayload well above the room's own limit: the room drops oversize messages itself; this only stops absurd frames early.
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = ROOM_PATH.exec(url.pathname);
  const origin = req.headers.origin;
  if (!match || !origin || !ORIGINS.has(origin)) {
    log(`refused ${req.url} from origin ${origin ?? "(none)"}`);
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, match[1]));
});

function onConnection(ws, sessionId) {
  const entry = getRoom(sessionId);
  const conn = `ws-${nextConn++}`;
  entry.sockets.set(conn, ws);
  entry.idleSince = null;
  entry.room.connect(conn);
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    deliver(entry, entry.room.handle(conn, data.toString("utf8")));
  });
  ws.on("close", () => {
    entry.sockets.delete(conn);
    deliver(entry, entry.room.disconnect(conn));
    if (entry.sockets.size === 0) entry.idleSince = Date.now();
  });
  ws.on("error", () => ws.terminate());
}

// The room has no timers of its own: tick every room once a second (the spotlight's grace), and drop idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of rooms) {
    if (entry.idleSince !== null && now - entry.idleSince > IDLE_ROOM_MS) {
      rooms.delete(sessionId);
      log(`room ${sessionId} dropped (idle)`);
      continue;
    }
    deliver(entry, entry.room.tick());
  }
}, 1000);

// Dead sockets (a phone that went to sleep) never send close; ping them and terminate the silent ones.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

server.listen(PORT, HOST, () => {
  log(`listening on ws://${HOST}:${PORT}/r/<sessionId>${LOOPBACK ? " (this machine only; ROOM_HOST=0.0.0.0 for the LAN)" : ""}`);
  log(`allowed origins: ${[...ORIGINS].join(", ")}`);
});

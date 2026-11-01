# Follow me on Cloudflare: the room relay as a Durable Object

How to put follow me's room (`src/lib/session/room.ts`) on Cloudflare, so people on different devices and networks can follow each
other. This replaces `scripts/dev-room-server.mjs` (the local stand-in) with a Worker and one Durable Object per follow session. The
design is in [READER_STATE_API.md](./READER_STATE_API.md), "Sessions".

Nothing in the reader changes: it already speaks to any room at `PUBLIC_ROOM_URL` + `/r/<sessionId>`. The relay only has to do what the
dev server does: accept the socket, check the Origin, and feed the pure room.

## What you get

```
browser ──wss://rooms.sefaria.org/r/<sessionId>──▶ Worker (checks path + Origin)
                                                     │  env.ROOMS.idFromName(sessionId)
                                                     ▼
                                          Durable Object "Room" (one per session)
                                          createRoom() in memory, ticks once a second
```

- **One object per session.** `idFromName(sessionId)` sends everyone with the same link to the same object, wherever they are; it
  runs near whoever connected first.
- **No storage.** The room lives in memory. When the last socket closes the object shuts down and the room is gone, as with the dev
  server. If Cloudflare restarts the object mid-session, sockets close, the clients reconnect, and the leader takes the spotlight back:
  the path `e2e/follow-ws.spec.ts` already checks (it kills the room server mid-session).
- **No hibernation, on purpose.** The room's state (spotlight, term, latest snapshots) is in memory; hibernation would discard it while
  keeping the sockets open, so clients would never know to rejoin. The object therefore uses the standard WebSocket API and a
  one-second `setInterval`, which keep it in memory while anyone is connected. That is billed as duration while a session is open:
  small for a lab. Hibernation is a later optimisation (it needs a room snapshot/restore, or closing every socket on wake).

## Before you start

1. **The Cloudflare account that holds the `sefaria.org` zone.** The relay needs a custom domain in that zone (`rooms.sefaria.org`,
   and `rooms-staging.sefaria.org` if you want a separate staging relay). Durable Objects work on the Workers Free plan
   (SQLite-backed only, which is what this uses) and on Paid. Use Paid for production: the Free plan's daily limits would cut
   sessions off.
2. **A Cloudflare API token** for whoever deploys (or CI), with *Workers Scripts: Edit*, *Workers Routes: Edit* and, for the custom
   domain, *Zone: DNS Edit* on `sefaria.org`. Locally, `npx wrangler login` is enough.
3. **WebSockets on for the zone** (Network → WebSockets). On by default.

## 1. Add the Worker to the repo

Put it next to the reader so it bundles the same `room.ts` the reader and the e2e tests use (wrangler bundles with esbuild;
`room.ts` imports only relative paths, so no alias is needed).

```
relay/
  wrangler.toml
  worker.ts
```

`relay/wrangler.toml`:

```toml
name = "sefaria-room-relay"
main = "worker.ts"
compatibility_date = "2026-10-01"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]   # new namespaces must be SQLite-backed; this one never writes to storage

[vars]
# exact origins, comma-separated; "*.suffix" allows any subdomain (cauldrons)
ALLOWED_ORIGINS = "https://www.sefaria.org,https://www.sefaria.org.il,https://*.cauldron.sefaria.org"

routes = [{ pattern = "rooms.sefaria.org", custom_domain = true }]

[env.staging]
name = "sefaria-room-relay-staging"
routes = [{ pattern = "rooms-staging.sefaria.org", custom_domain = true }]
[env.staging.vars]
ALLOWED_ORIGINS = "https://www.staging.sefaria.org,https://*.cauldron.sefaria.org,http://localhost:3100"
[[env.staging.durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"
```

`relay/worker.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { createRoom, type Room as PureRoom, type Outgoing } from "../src/lib/session/room";

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
}

const ROOM_PATH = /^\/r\/([A-Za-z0-9_-]{8,128})$/;

function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  for (const rule of allowed.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (rule === origin) return true;
    const m = /^(https?):\/\/\*\.(.+)$/.exec(rule); // "https://*.cauldron.sefaria.org"
    if (m) {
      try {
        const u = new URL(origin);
        if (u.protocol === `${m[1]}:` && u.hostname.endsWith(`.${m[2]}`)) return true;
      } catch {}
    }
  }
  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected a WebSocket", { status: 426 });
    if (!originAllowed(req.headers.get("Origin"), env.ALLOWED_ORIGINS)) return new Response("forbidden", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(req);
  },
};

/** One follow session: the pure room, its sockets, and a once-a-second tick while anyone is connected. */
export class Room extends DurableObject<Env> {
  private room: PureRoom = createRoom({ now: Date.now });
  private sockets = new Map<string, WebSocket>();
  private nextConn = 1;
  private ticker: ReturnType<typeof setInterval> | null = null;

  async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept(); // the standard API, not acceptWebSocket(): no hibernation (see the doc)
    const conn = `ws-${this.nextConn++}`;
    this.sockets.set(conn, server);
    this.room.connect(conn);
    this.ticker ??= setInterval(() => this.deliver(this.room.tick()), 1000);

    server.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return; // the protocol is JSON text; the room checks size and shape
      this.deliver(this.room.handle(conn, e.data));
    });
    const gone = () => {
      if (!this.sockets.delete(conn)) return;
      this.deliver(this.room.disconnect(conn));
      if (this.sockets.size === 0 && this.ticker) {
        clearInterval(this.ticker); // nothing keeps the object now: it shuts down and the room goes with it
        this.ticker = null;
      }
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  private deliver(out: Outgoing[]) {
    for (const { to, envelope } of out) {
      const text = JSON.stringify(envelope);
      for (const id of this.room.recipients(to)) {
        try {
          this.sockets.get(id)?.send(text);
        } catch {} // a socket closing under us; its close event cleans up
      }
    }
  }
}
```

Add `wrangler` and `@cloudflare/workers-types` as dev dependencies, and scripts:

```json
"relay:dev": "wrangler dev --config relay/wrangler.toml --port 3199",
"relay:deploy": "wrangler deploy --config relay/wrangler.toml"
```

## 2. Try it locally first

`wrangler dev` runs the Worker and the Durable Object locally (Miniflare), on the same port as the dev room server, so the existing
cross-device test runs against it unchanged:

```bash
npm run relay:dev
PUBLIC_LABS=follow_me,recording PUBLIC_ROOM_URL=ws://<lan-ip>:3199 npm run dev -- --host
FOLLOW_WS_BASE=http://<lan-ip>:3100 npx playwright test e2e/follow-ws.spec.ts --project=desktop
```

For local runs, add `http://localhost:3100,http://<lan-ip>:3100` to `ALLOWED_ORIGINS` (a `.dev.vars` file in `relay/` overrides
`[vars]` for `wrangler dev` only). The spec's outage step kills whatever listens on 3199 and restarts the dev room server; against
`wrangler dev`, skip that step or restart wrangler by hand.

## 3. Deploy

```bash
npx wrangler deploy --config relay/wrangler.toml --env staging   # rooms-staging.sefaria.org
npx wrangler deploy --config relay/wrangler.toml                 # rooms.sefaria.org
```

The first deploy applies the `v1` migration (creates the `Room` namespace) and creates the custom domain's DNS record and
certificate. Check it: `curl https://rooms-staging.sefaria.org/health` → `ok`; a WebSocket from a non-allowed origin gets 403.

Later class changes go in a new migration tag (`v2`, …), never by editing `v1`. Newer wrangler versions also accept an `exports` map
instead of `migrations`; once a Worker is deployed with `exports` it cannot go back, so pick one and keep it.

## 4. Point the reader at it

The reader reads `PUBLIC_ROOM_URL` at run time, so this is configuration, not a build:

| Where | `PUBLIC_ROOM_URL` | Labs |
| --- | --- | --- |
| Cauldron | `wss://rooms-staging.sefaria.org` | `PUBLIC_LABS=follow_me,recording` on the node deployment |
| Staging | `wss://rooms-staging.sefaria.org` | remote config `feature.reader.labs.follow_me` = true |
| Production | `wss://rooms.sefaria.org` | remote config, when ready; set it to false to turn follow me off at once |

In the helm chart that is two env entries on the node (reader) deployment, e.g. `nodejs.env.PUBLIC_ROOM_URL` and
`nodejs.env.PUBLIC_LABS`. Without `PUBLIC_ROOM_URL` follow me falls back to the in-browser room (tabs of one browser only).

Cauldrons are not behind Cloudflare, but that does not matter here: the browser connects to the relay directly, and only the relay's
`ALLOWED_ORIGINS` needs to accept the cauldron's origin (the `*.cauldron.sefaria.org` rule).

## 5. Watch it

- `npx wrangler tail --config relay/wrangler.toml` streams the Worker's logs and exceptions.
- Dashboard → Workers & Pages → sefaria-room-relay → Durable Objects: active objects, requests, duration (the cost driver here).
- Cost: incoming WebSocket messages are billed at 20 messages per request; the 20/s state limit per participant keeps a session's
  traffic bounded. Duration is billed while a session has anyone connected.

## Not done yet (before follow me leaves labs)

- **Tokens.** Today the session id (unguessable) and the Origin check are the only gate, as with the dev server. The design's next
  step: Django mints a short-lived HMAC token naming the participant and whether they host (`/api/follow/sessions`), the reader sends
  it on connect (`?t=` or the first message), and the Worker verifies it with a shared secret (`wrangler secret put ROOM_TOKEN_SECRET`)
  before forwarding to the object. Until then a joiner's claim to be the host is believed.
- **Rate limits per IP** at the Worker (Cloudflare's rate-limiting binding) against someone opening many sockets; the room already
  limits each connection's messages and caps a room at 200 participants.
- **Hibernation**, if duration costs matter (see "What you get").

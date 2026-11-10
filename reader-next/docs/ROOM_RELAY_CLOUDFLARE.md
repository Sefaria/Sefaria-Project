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
2. **A Cloudflare API token** for whoever deploys (or CI), with _Workers Scripts: Edit_, _Workers Routes: Edit_ and, for the custom
   domain, _Zone: DNS Edit_ on `sefaria.org`. Locally, `npx wrangler login` is enough.
3. **WebSockets on for the zone** (Network → WebSockets). On by default.

## 1. The relay in the repo

```
relay/
  wrangler.toml   # the ROOMS binding, the v1 migration (new_sqlite_classes), ALLOWED_ORIGINS, the custom domains, the pinned account_id
  worker.ts       # the Worker (path + Origin check, /health) and the Room Durable Object
  tsconfig.json   # Workers types; `npm run relay:typecheck`
```

It sits next to the reader so it bundles the same `src/lib/session/room.ts` the reader and the e2e tests use (wrangler bundles with
esbuild; `room.ts` imports only relative paths). In Sefaria-Project it is under `reader-next/relay/`: run every command below from
`reader-next/`, not from the Sefaria-Project root.

- `account_id` pins the account that holds the `sefaria.org` zone (`b006a0acd05a164603538fdb99335318`), so a deploy fails rather
  than lands in another account.
- `ALLOWED_ORIGINS`: exact origins, or `https://*.suffix` for any subdomain of suffix (`www` included, not the bare domain).
  Production allows `www.sefaria.org`, `www.sefaria.org.il` and cauldrons; staging allows `*.sefariastaging.org`,
  `*.sefariastaging-il.org`, cauldrons and `http://localhost:3100`.
- Top-level keys (`routes`, `account_id`) must come before the first `[table]` in `wrangler.toml`, or TOML files them under it.

Scripts: `relay:dev` (wrangler dev, staging settings, on port 3199 on all interfaces), `relay:deploy`, `relay:typecheck`.

## 2. Try it locally first

`wrangler dev` runs the Worker and the Durable Object locally (Miniflare) on the dev room server's port, so the cross-device test runs
against it. Let the reader's origin in with a `relay/.dev.vars` (git-ignored; overrides `[vars]` for `wrangler dev` only):

```bash
echo 'ALLOWED_ORIGINS="http://localhost:3100,http://<lan-ip>:3100"' > relay/.dev.vars
npm run relay:dev
PUBLIC_LABS=follow_me,recording PUBLIC_ROOM_URL=ws://<lan-ip>:3199 npm run dev -- --host
ROOM_SERVER=relay FOLLOW_WS_BASE=http://<lan-ip>:3100 npx playwright test e2e/follow-ws.spec.ts --project=desktop
```

`ROOM_SERVER=relay` makes the spec's outage step stop and restart `relay:dev` instead of the dev room server. This passes: a phone
follows a laptop through the Durable Object, both reconnect after the relay goes down and comes back empty, and the phone is told when
sharing stops.

## 3. Deploy

```bash
cd reader-next   # in Sefaria-Project, on the reader-next branch
npm run relay:deploy -- --env staging   # rooms-staging.sefaria.org
npm run relay:deploy                    # rooms.sefaria.org
```

The first deploy applies the `v1` migration (creates the `Room` namespace) and creates the custom domain's DNS record and
certificate; that needs DNS edit rights on the zone (`npx wrangler login` again, or an API token with Zone DNS: Edit). Check it:
`curl https://rooms-staging.sefaria.org/health` → `ok`; a WebSocket from a non-allowed origin gets 403.

Later class changes go in a new migration tag (`v2`, …), never by editing `v1`. Newer wrangler versions also accept an `exports` map
instead of `migrations`; once a Worker is deployed with `exports` it cannot go back, so pick one and keep it.

## 4. Point the reader at it

The reader reads `PUBLIC_ROOM_URL` at run time, so this is configuration, not a build:

| Where      | `PUBLIC_ROOM_URL`                 | Labs                                                                     |
| ---------- | --------------------------------- | ------------------------------------------------------------------------ |
| Cauldron   | `wss://rooms-staging.sefaria.org` | `PUBLIC_LABS=follow_me,recording` on the node deployment                 |
| Staging    | `wss://rooms-staging.sefaria.org` | remote config `feature.reader.labs.follow_me` = true                     |
| Production | `wss://rooms.sefaria.org`         | remote config, when ready; set it to false to turn follow me off at once |

In the helm chart that is two env entries on the node (reader) deployment, e.g. `nodejs.env.PUBLIC_ROOM_URL` and
`nodejs.env.PUBLIC_LABS`. Without `PUBLIC_ROOM_URL` follow me falls back to the in-browser room (tabs of one browser only).

Cauldrons are not behind Cloudflare, but that does not matter here: the browser connects to the relay directly, and only the relay's
`ALLOWED_ORIGINS` needs to accept the cauldron's origin (the `*.cauldron.sefaria.org` rule).

## 5. Watch it

- `npx wrangler tail --config relay/wrangler.toml` (add `--env staging` for the staging relay) streams the Worker's logs and exceptions.
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

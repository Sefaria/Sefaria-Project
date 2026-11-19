# Reader state API: snapshots, streams, recording, replay and follow

Status: design, proposed 2026-11-01 and partly built since. Passages marked **As built** describe the code in
`src/lib/reader-state/`, `src/lib/session/` and `src/features/reader-state/`; the rest is design. These features are labs,
off in production (`PUBLIC_LABS` unset; `docs/DECISIONS.md`, D-10).

An API that reads the reader's complete state at any moment, reports every change to it, and puts the reader back
into a given state. Several features are built on that one API without adding to it:

- **Record and replay**: press record, read as usual, and get a timeline that can be scrubbed back and forth like
  an audio or video player, the reader showing exactly what it showed at each moment.
- **Follow me**: like Figma's "follow": I share a link, and whoever opens it sees my reader move as I move, live,
  until they click away (and can rejoin).
- **Drive the reader from outside**: an embedding page, the Library Assistant, or a test sends states to the reader.

The core is meant to be open-sourced, so it is written apart from this app (see "Packaging").

## What "state" is today

Most of the reader is already a function of the URL. `src/lib/workspace/url.ts` encodes the whole workspace
(docs/WORKSPACE.md): panels, their side panels, versions, `lang`, `aliyot`, the side panel's view, `lookup`, `sbsq`,
the named entity. Four kinds of state are not in it:

| Kind                      | Lives in                                                             | Examples                                                                                     |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| History-entry state       | router history state, `NavState` (`lib/workspace/commands.ts`)       | `nav` kind, stable `panelKeys`, search `terms` to highlight                                  |
| Reader settings           | cookies, through `ReaderSettingsProvider` (`lib/reader/settings.ts`) | font size, layouts, vowels, colour, bilingual layout                                         |
| Position inside a section | the DOM's scroll (`features/reader/use-reading-scroll.ts`)           | the URL tracks the segment, not where in it                                                  |
| Open UI over the text     | component `useState`                                                 | display settings menu, share/feedback modals, popovers, header drop-downs, Library Assistant |

## Three options, and the choice

1. **Ignore what is not in the URL.** Cheapest; replays and follows come out wrong (wrong scroll inside a long
   section, menus that were open are not).
2. **Write more into the URL.** The URL has a contract: it reads and writes sefaria.org's grammar, so old links
   open here and new links open there. Font size or "menu open" would break that and put noise into every shared
   link. Settings belong to the reader, not the moment: a link someone sends should not change my font size. Pixel
   scroll in the URL means history churn and does not survive a different window width.
3. **A separate state layer beside the URL.** Chosen, with one constraint: **the URL stays the source of truth for
   the workspace.** The layer does not copy the workspace; it adds what the URL does not hold.

The test for whether something new belongs in the URL: _would I want it if someone sent me this link?_ If yes, add
it to the URL codec (and to sefaria.org's grammar if it has a counterpart). If not, it is a slice (below).

## Layers

```
          ┌──────────────── consumers ────────────────┐
          │ Recorder/Player   Leader/Follower   Embed │   use only the core API
          └─────────────────────┬─────────────────────┘
                                │  ReaderStateApi + StateStream
          ┌─────────────────────┴─────────────────────┐
  core    │ snapshot schema, slices, stream encoding, │   no React, no router, no DOM, no Sefaria imports
          │ fold/diff, warnings, transports interface │
          └─────────────────────┬─────────────────────┘
                                │  ReaderHost (implemented by the app)
          ┌─────────────────────┴─────────────────────┐
  host    │ this reader: TanStack router + commands,  │
          │ settings provider, scroll, overlays       │
          └───────────────────────────────────────────┘
```

- The **core** defines the data and the rules. It knows nothing about Sefaria's URL grammar or React.
- The **host** binds the core to a real reader. This app is one host; another reader (an open-source user's) would
  write its own.
- **Consumers** use only the core API. Recording and following differ only in where the stream of states goes
  and where it comes from.

## Slices

Every piece of non-URL state that changes what is on screen registers a slice:

```ts
interface StateSlice<T> {
  id: SliceId; // namespaced: "sefaria.settings", "sefaria.scroll"; third parties use their own prefix
  version: number; // bumped when T changes shape; old recordings and older peers still decode
  get(): T;
  apply(value: T, ctx: ApplyContext): void;
  subscribe(onChange: () => void): () => void;
  /** Turn an older version's value into the current shape, or return undefined (restored with a warning). */
  migrate?(value: unknown, fromVersion: number): T | undefined;
  /** Whether this slice is personal (the reader's own preference) or about the moment. Consumers decide what to send by it. */
  scope: 'personal' | 'moment';
}
interface ApplyContext {
  /** Who is applying: a replay, a leader being followed, an embedding page. Never "local". */
  origin: 'playback' | 'follow' | 'external';
  /** Persist the value (cookies, preferences)? False for every origin today. */
  persist: boolean;
}
```

`src/lib/reader-state/registry.ts` holds them. Slices are registered by the providers that own the state (the
settings provider registers `sefaria.settings`, the workspace registers `sefaria.scroll`), so nothing outside the
owner reaches into its internals.

### First slices

| Slice              | Scope    | Value                                                         | Notes                                                                                                                                                                                                        |
| ------------------ | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sefaria.settings` | personal | `ReaderSettings`                                              | With `persist: false`, `apply` sets an override and writes **no cookie** (`ReaderSettingsProvider.update` writes cookies today; it gets a non-persisting path).                                              |
| `sefaria.scroll`   | moment   | `Record<panelKey, { ref: string; fraction: number }>`         | An anchor, not pixels: the segment at the top of the column and how far into it. Survives other fonts, widths and phone vs desktop. Applied with the existing scroll-to-segment machinery, as a `"stay"`.    |
| `sefaria.focus`    | moment   | `{ panelKey: string } \| null`                                | The panel last interacted with. A phone shows one panel; a phone replaying or following a desktop shows this one.                                                                                            |
| `sefaria.overlay`  | moment   | `{ kind: "displaySettings" \| …; panelKey?: string } \| null` | Only overlays chosen to be in scope. Components move their `open` state into the slice (`useOverlaySlice(kind)`). Overlays that carry the person's own data (share, feedback, sign-in) are never registered. |

### Not captured

Hover, focus rings, text typed into a field and not submitted, transient animations, and the viewport size. The
viewport is where a replay or follow runs, not reader state: a recording made on a phone replays in a desktop
layout on a desktop, with the same panels, text and anchors.

## The core API

```ts
interface ReaderSnapshot {
  v: 1;
  url: string; // host-defined location; for this reader, pathname + search in the old grammar
  nav: NavState; // host-defined history-entry state (panel keys, terms…)
  slices: Record<SliceId, { v: number; value: unknown }>;
}

/** What changed between two snapshots; absent fields did not change. */
interface SnapshotChange {
  url?: string;
  nav?: NavState;
  slices?: Record<SliceId, { v: number; value: unknown } | null>; // null: slice removed
}

interface ReaderStateApi {
  getSnapshot(filter?: SliceFilter): ReaderSnapshot;
  applySnapshot(s: ReaderSnapshot, ctx: ApplyContext): Promise<ApplyResult>;
  /** Every settled change made in this reader — by the person, not by applySnapshot. */
  subscribe(onChange: (change: SnapshotChange, snapshot: ReaderSnapshot) => void, filter?: SliceFilter): () => void;
}

type SliceFilter = { scope?: 'moment' | 'all'; include?: SliceId[]; exclude?: SliceId[] };
interface ApplyResult {
  warnings: RestoreWarning[];
}
interface RestoreWarning {
  code: number;
  slice?: SliceId;
  detail?: string;
}
```

- `getSnapshot` reads the location, history state and every slice's `get`.
- `applySnapshot` navigates through `lib/workspace/commands.ts` (rule 3: every URL change goes through the router)
  with no `nav`, so every panel goes to its URL, carrying the snapshot's `panelKeys`. After the route's data has
  loaded it applies the slices, `sefaria.scroll` last (it needs the text on screen).
- `subscribe` fires once per settled change, coalesced per frame. **It does not report changes that
  `applySnapshot` made** (see "Telling local changes from applied ones") — a follower's reader must not echo the
  leader's moves back as its own.

Pure helpers in the core: `diff(a, b): SnapshotChange`, `fold(s, change): ReaderSnapshot`.

### The host contract

What a reader implements to use the core:

```ts
interface ReaderHost {
  getLocation(): { url: string; nav: unknown };
  /** Go to a location. "replace" for follow and playback, so the person's history is not filled with someone else's moves. */
  navigate(url: string, nav: unknown, mode: 'push' | 'replace'): Promise<void>;
  /** Resolves once the location's data is on screen (slices like scroll apply after). */
  settled(): Promise<void>;
  onLocationChange(cb: (cause: 'local' | 'applied') => void): () => void;
  slices: SliceRegistry;
}
```

For this app: TanStack router + `commands.ts` + the registry.

### Telling local changes from applied ones

Applying a snapshot causes the same router events, re-renders and scroll events as the person acting. The host
marks them:

- `applySnapshot` runs inside an **apply window**: an apply id is set before navigating and cleared once
  `settled()` resolves and the slices are applied. Router changes inside the window are `cause: "applied"`.
- Programmatic scrolling marks the target anchor; scroll events that land on it are applied, anything else
  (wheel, touch, keys, scrollbar drag) is local. Input events (`pointerdown`, `wheel`, `keydown`, `touchstart`)
  during the window end it as local.
- Back/forward (`popstate`) is always local.

Consumers that need it (follow) get the local changes from `subscribe`, and an `onLocalInput` signal for input that
did not change state yet.

**As built** (review fixes): applies never overlap. A newer `applySnapshot` supersedes one still running (a follower
retargeted to a new leader, a replay exited or replaced mid-apply), which stops at its next step. Local input and
supersession both fire an `AbortSignal` the API puts on the `ApplyContext` it passes to each slice (`ctx.signal`;
callers leave it out), so a slice still working after `apply` was called — scroll retrying while its text loads —
stops instead of moving a reader that is no longer the apply's. The player likewise drops a follow-up its own clock
queued when playback pauses (a seek's follow-up is kept).

### Partial restore

`applySnapshot` restores what it can and reports the rest; it never throws on a stale or foreign snapshot. Warnings
carry stable numeric codes that callers branch on (the same contract as the v3 API's `warnings`):

| Code | Meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 100  | A ref no longer resolves (book renamed or removed); the panel shows what the router shows for that URL |
| 101  | A version is gone; the panel falls back to the default version                                         |
| 102  | The location is not visible to this person (a private sheet, a moderator view)                         |
| 200  | A slice in the snapshot is not registered in this build                                                |
| 201  | A slice's version is newer than this build, or `migrate` declined it                                   |
| 300  | The scroll anchor's segment is not in the loaded section                                               |

Snapshots refer to text by ref and version and never embed it: the text comes from the API (cached by TanStack
Query, IndexedDB and Varnish), so snapshots stay small and a replay months later shows today's text at the recorded
places.

## Streams: one shape for recording and following

Recording and following move the same thing: a full snapshot, then changes.

```ts
type StreamMessage =
  | { type: 'keyframe'; seq: number; t: number; snapshot: ReaderSnapshot }
  | { type: 'change'; seq: number; t: number; change: SnapshotChange };
```

`seq` increases by one per message; `t` is milliseconds since the stream started. A reader of the stream folds
changes onto the last keyframe. A gap in `seq` means a message was lost: wait for (or ask for) the next keyframe.

The **stream writer** (`createStreamWriter(api, { filter, keyframeEvery })`) subscribes to the API and emits
messages: a keyframe first, then changes, and a keyframe again every 10 s or 50 changes, or on demand. `sefaria.scroll`
changes are sampled (recording: at most every 250 ms; follow: every 100 ms) plus once when scrolling stops.

The **stream reader** (`createStreamReader(api, ctx)`) takes messages and applies them: a keyframe with
`applySnapshot`, a change by folding it onto the current state and applying the result. Consecutive changes within
the same section apply as `"stay"`/`"scroll"` so the column does not restart.

|                 | Writer sends to       | Reader receives from      | Applies to                                |
| --------------- | --------------------- | ------------------------- | ----------------------------------------- |
| Record / replay | a `Recording` (array) | the `Recording`, by time  | the person's own reader, restored on exit |
| Follow          | a transport           | a transport, live         | the follower's own reader                 |
| Embed           | —                     | a `postMessage` transport | the embedded reader                       |

## Transports

```ts
interface StateTransport {
  send(msg: ProtocolMessage): void;
  onMessage(cb: (msg: ProtocolMessage) => void): () => void;
  onStatus(cb: (s: 'connecting' | 'open' | 'closed') => void): () => void;
  close(): void;
}
```

The core ships `WebSocketTransport` (reconnects with back-off), `BroadcastChannelTransport` (tabs of one browser:
local development and e2e tests without a server), `PostMessageTransport` (an embedding page or iframe) and
`MemoryTransport` (unit tests). The backend is not decided here: anything that relays messages between a leader and
its followers fits.

## Recording and replay

```ts
interface Recording {
  v: 1;
  startedAt: string;
  messages: StreamMessage[];
}
```

A recording is a stream written to an array: a keyframe at the start and every 10 s / 50 changes, changes in
between, `filter: { scope: "all" }` (settings included — the replay should look as it looked).

**Seeking** to `t`: take the last keyframe at or before `t`, fold the changes up to `t` into it, and apply the
result. Playing is seeking forward on a timer.

Playback must leave the person watching where they were. **As built** (task H), it applies to the person's real reader, as
follow does (decided over a second router under `createMemoryHistory`, which would mount the workspace, its settings context and
its slices a second time, against a second registry).

- **Restore on exit.** Entering playback takes `getSnapshot({ scope: "all" })` (location, history state, settings, scroll);
  "Exit replay" disposes the player and applies that snapshot back. Loading a second recording mid-replay keeps the first saved place.
- **No history entries.** Every apply navigates with `replace` (the API always does), so scrubbing fills neither the back button nor
  the history; leaving returns to the same entry. No extra entry is pushed on entering.
- **No persistence.** The player applies with `origin: "playback"`, `persist: false`: no cookie writes (settings), and the host skips
  `last-place`, user history (`lib/user/history.ts`) and version preferences (`lib/versions/prefs-source.ts`) for applied changes. The
  restore on exit is applied the same way, so the cookies end exactly as they were.
- **Analytics: not paused.** `lib/analytics` has no off switch: events (`select_content` when a column opens a text, and whatever
  GTM derives from history changes) fire during playback as they would for the person. Pausing needs a flag in `lib/analytics/core.ts` that every channel
  checks; not built.
- **Read only.** The person's input in the reader (`api.onLocalInput`: pointer, wheel, key, touch, back/forward) pauses playback and
  offers "Resume". Input on the dock itself does not: the dock marks its own events in the capture phase and the pause is decided
  after the event has been dispatched (a mark counts only for the input event being decided, never for a later one).
- **Loaded on use.** The provider mounts only small shells on every page. The recording controller, recorder, player and dock load
  with dynamic imports on "Record session" or a picked file (`recording/handle.ts`); the follow controller, session client,
  transports, the in-browser room (only when `PUBLIC_ROOM_URL` is unset) and the follow bar load on the first "Follow me", a
  `follow` link, or a session kept in sessionStorage (`follow/FollowUi.tsx`, `follow/lazy.ts`).
- **Labs, off by default.** The API (`window.sefariaReaderState`) is on every page; recording and follow me are labs (`lib/labs.ts`):
  their UIs mount, and the menu entry and Share's "Follow me" appear, only when switched on — by the deployment (`PUBLIC_LABS=
follow_me,recording`) or by remote config (`feature.reader.labs.follow_me`, `feature.reader.labs.recording`, bool), which overrides
  the deployment either way and is the kill switch. A `follow` link opened where follow me is off is an ordinary link.

The UI (`features/reader-state/recording/`): "Record session" and "Load recording…" in the display settings menu; a floating dock with
a red dot, the elapsed time and Stop while recording; Download, Replay, Discard and Load recording… after; during playback the
`Timeline` (`ui/Timeline`: scrubber with keyframe ticks, arrows ±5 s, play/pause, time / duration, 1x/2x/4x) and "Exit replay". A
`.json` file can be dropped on the dock; loading errors are shown there.

Playback is client only; there is nothing to server-render.

## Follow me

I am the **leader**; whoever opens my link is a **follower**. The follower's own reader moves as mine does; there
is no second router — it is their real reader, until they take it back.

This section is the front end of the simplest case: one person shares, others follow. Underneath, a follow session
is a **room** (see "Sessions: the relay, the room, leadership and chat"): every participant publishes their state,
and "the leader" is whoever holds the room's spotlight, which can move. Nothing below changes when it does.

### Starting: the leader

1. The leader chooses "Share: follow me" (in the panel header's share menu). The client asks the backend for a
   follow session and gets `{ sessionId, token }` (the token marks them host), opens the room, and takes the
   spotlight.
2. The share link is the leader's **current URL** plus `follow=<token>`:
   `/Genesis.1.3?lang=bi&with=Rashi&follow=Xk2…`. Because the URL is the leader's workspace, a follower's first
   paint (server-rendered) is already nearly right before any socket opens, and someone without JavaScript, or
   after the session ended, still lands on the right text. The workspace decoder ignores parameters it does not
   know, so `follow` changes nothing in the URL codec.
3. A stream writer runs over the transport with `filter: { scope: "moment" }` — workspace, scroll, focus, overlays;
   **not settings**: the follower keeps their own font, vowels and colour. (A leader may opt in to sharing content
   language, which is already in the URL: `lang` follows by default.)
4. The leader sees a small presence pill: "2 following · Stop". Stop closes the session; followers are told it ended.

### Joining: the follower

1. On load the shell sees `follow` in the location. It keeps the `sessionId` in `sessionStorage` (so a reload
   rejoins) and removes `follow` from the address bar with a replace navigation — the follower's own URL, if they
   share it, is a plain link, not a second invitation.
2. It gets a token from Django, opens the room and sends `hello`. The room answers with the spotlight holder's last
   keyframe; the stream reader applies it with `origin: "follow"`, `persist: false`.
3. While following, every applied change navigates with **replace**: the follower's back button is not filled with
   the leader's every verse. As built, nothing is pushed on entering or leaving: the follower arrives by opening the
   link, so Back leaves to the page before it. (Pushing once on entering, so Back returns to the place they were
   following from, is a possible refinement.)
   Breaking away is decided by the person's input alone (pointer, wheel, key, touch, back/forward); a change with no
   input is the reader settling itself. Input on the reader state's own controls (marked `data-reader-state-ui`: the
   follow bar and its menus, the recording dock) is not breaking away.
4. A bar shows the state: "Following Reader One · Stop following".

### Breaking away and returning

Any **local** change or input ends following (see "Telling local changes from applied ones"): scrolling, clicking a
verse, opening the sidebar, typing in search, back/forward. Figma does the same.

- The transport **stays open**. The stream reader stops applying but keeps folding messages, so it always holds the
  leader's latest state.
- The bar turns into "Reader One is reading Exodus 3 · Follow again". Clicking it applies the held state at once — no
  round trip — and resumes.
- "Stop following" closes the transport and clears the token. The reader stays where it is.

A follower's own state is published to the room too (that is what lets the spotlight move to them), but it moves
nobody who has not chosen to follow them.

### Connection states

| State          | Follower sees                      | What happens                                                     |
| -------------- | ---------------------------------- | ---------------------------------------------------------------- |
| connecting     | "Joining…"                         | the server-rendered page is already showing the link's URL       |
| live           | "Following …"                      | messages applied as they come                                    |
| paused         | "… is reading X · Follow again"    | the follower broke away; messages folded, not applied            |
| leader away    | "Waiting for … to come back"       | the leader's tab is hidden or disconnected; the reader stays put |
| no leader      | "Waiting for a leader"             | the spotlight was cleared; the reader stays put                  |
| leader changed | "Now following Reader Two" (brief) | the spotlight moved; Reader Two's last keyframe is applied       |
| reconnecting   | small spinner on the bar           | transport back-off; on reopen, a `resync` gets a fresh keyframe  |
| ended          | "… stopped sharing"                | the leader stopped or the session expired; the token is cleared  |

### Protocol

The reader-state part of what travels, inside the room's `state` channel (the envelope and the other channels are
under "The room protocol" below):

```ts
type StateChannelMessage =
  | { type: 'hello'; protocol: 1; slices: { id: SliceId; v: number }[]; client: string }
  | { type: 'resync'; of: ParticipantId } // send me a keyframe of this participant (join, gap, reconnect)
  | StreamMessage; // keyframe | change, from the sender's own stream
```

- `hello` carries the protocol version and the slices each side knows, so a newer leader and an older follower
  agree: the leader still sends everything, the follower drops unknown slices with warning 200.
- A gap in `seq` sends `resync`. The room keeps each participant's last keyframe and answers it itself, so a
  joining follower does not need the leader's tab to be awake.
- Messages are small JSON (a change is usually one URL or one scroll anchor). Scroll is the busiest: 10 per second
  at most while someone scrolls.

### Differences between the two screens

- **Width**: anchors make scroll land on the same words; a phone follower shows the leader's `sefaria.focus` panel.
- **Permissions**: if the follower cannot see what the leader opened (warning 102), the bar says so and the reader
  stays on the last place it could show.
- **Settings**: not sent, so the same words may sit at different heights. The anchor keeps the top of the screen on
  the same words.
- **Smoothness**: scroll changes are applied with a short eased scroll when the target is near (within a screen),
  and a jump when far, so a follower is not dragged through long sections.

### What the leader must not leak

Only registered `moment` slices and the URL go out. Text typed into search, the share and feedback modals, sign-in,
notes, and anything in the person's settings stay home. The leader's display name and avatar go in `presence` only
when signed in and only as the backend gives them.

**As built** (`src/lib/session/outgoing.ts`, `client.ts`): a participant publishes its stream only while it holds the
spotlight or someone's presence says they follow it, so a guest who broke away is not broadcasting where they went.
The writer reads the API through a filter: on search, sign-in, register and password pages it shows the last public
state (nothing goes out while the person is there; followers stay on the last text), and the search words a "go"
carries in `nav.terms` are dropped everywhere.

## Sessions: the relay, the room, leadership and chat

The backend for follow (and later chat). Recommendation, 2026-11-01; not decided.

### Why not in the current stack

- **Django cannot hold sockets.** No ASGI/Channels; web pods run gunicorn with a few sync threads per pod, fixed
  replicas, worker recycling, and memory is already their main production risk. Each socket would hold a thread.
- **Every hop would need changes.** Browser → Cloudflare → Envoy Gateway → nginx → Varnish → web/node: the upgrade
  must pass every hop, Varnish must be bypassed, and the HTTPRoute needs its own rule with no request timeout.
  The chart has no WebSocket route today.
- **Every deploy would cut every socket.** The blue-green Rollout scales the old ReplicaSet down after a release.
- **The reader's Node server** runs several replicas, so a leader and its followers can land on different pods
  (Redis fan-out needed), and it is cut on every deploy too.

### The relay: one Cloudflare Durable Object per room

```
participant ──POST /api/follow/sessions──▶ Django   (signed-in check, rate limit, name/avatar)
            ◀── { sessionId, token, expiresAt }

participants ══ wss://live.sefaria.org/r/<sessionId>  (token) ══▶ Durable Object "room:<sessionId>"
                                                                  • relays channels between participants
                                                                  • last keyframe per participant
                                                                  • spotlight + term (who leads)
                                                                  • chat log (SQLite in the object)
                                                                  • presence; alarm ends idle rooms
```

- Created on first connect, addressed by `idFromName(sessionId)`, using the hibernation API so idle rooms cost
  almost nothing. Its own host bypasses Envoy, nginx and Varnish, and our deploys never cut its sockets.
- A Durable Object handles one message at a time, so the room is the **single source of order**: it stamps every
  chat message with a room `seq` and server time. No CRDTs or vector clocks.
- It validates, it does not interpret reader state: message types against the schemas, size (16 KB), rate (20
  messages/s per participant for `state`, less for `chat`), participants per room (200).
- Nothing is logged. Storage is deleted when the room ends (unless chat retention says otherwise, below).
- Assumes Sefaria's own Cloudflare account with Workers; Cloudflare already proxies all sefaria.org traffic, so the
  relay seeing reading positions adds no new party.
- The Worker is published as the reference relay next to `@sefaria/reader-state`, so others can run the whole thing.

**Fallback** if Workers are not acceptable: a separate Node `session-relay` Deployment (not inside the reader's
pods), Redis pub/sub across replicas, last keyframes in Redis with a TTL, its own Envoy HTTPRoute with no timeout
and the upgrade allowed. Deploys cut its sockets; the client's reconnect + resync covers it. Test on **staging**, not
a cauldron: cauldrons are not behind Cloudflare, so they do not exercise Cloudflare's WebSocket and idle-timeout
behaviour.

**Not chosen:** Django Channels (a new ASGI deployment anyway, in Python, to relay bytes); WebRTC peer-to-peer
(still needs a signalling server, scales badly to many followers, TURN costs); a hosted service such as Liveblocks
or Ably (a new third party sees reading positions, and it ties the open-source API to a vendor).

### The share URL and tokens

`https://www.sefaria.org/Genesis.1.3?lang=bi&with=Rashi&follow=<sessionId>`

- `sessionId` is the **join capability**: 256 random bits, base62. It is treated like a password: short-lived,
  revocable (the host's Stop ends it), rate-limited at the relay, and only its hash is stored server-side.
- The rest is the sharer's ordinary ref URL, so SSR, link previews and share-card images (`/api/img-gen/…`) work as
  for any text link. A preview shows the ref when the link was made, not the live state — fine. After the room ends
  the link still opens that text.
- The **token** says who you are and what you may do, never who leads (that is room state, so it can change without
  new tokens): `{ sessionId, userId | anonId, name, isHost, canLead, canChat, exp }`, HMAC-signed with a key Django
  and the Worker share. The Worker checks it without a database call. It lives **in memory only**; on reload the
  client asks Django for a new one (web auth is the Django session cookie). `sessionStorage` keeps only the
  `sessionId`, which is already in the link.
- The relay checks the `Origin` header on every upgrade against an allowlist (WebSockets are not covered by the
  same-origin policy or Django's CSRF middleware), and rejects tokens for another `sessionId`.
- Lifetime: ended by the host's Stop, after the room has had no leader for 10 minutes, or after 12 hours.

### The room protocol

One connection carries several channels:

```ts
interface Envelope<C extends Channel = Channel> {
  ch: C; // "state" | "control" | "presence" | "chat"
  from: ParticipantId; // stamped by the room, never trusted from the client
  seq?: number; // stamped by the room for "chat" and "control"
  t?: number; // server time, stamped by the room
  body: ChannelBody[C];
}
```

| Channel    | Carries                                                         | Kept by the room                                  |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------- |
| `state`    | each participant's reader stream (`StateChannelMessage`, above) | the last keyframe + later changes per participant |
| `control`  | spotlight, roles, mute, end                                     | current spotlight, `term`, roles                  |
| `presence` | joined/left, following whom, wandered off, typing               | nothing (ephemeral)                               |
| `chat`     | messages, edits, deletions                                      | the log, per the retention policy                 |

`@sefaria/reader-state` knows only the `state` channel's body. The envelope, `control`, `presence` and `chat` belong
to the session layer (`src/lib/session/`, later its own package), so the reader-state core stays the same whether
it runs over a room, a recording or `postMessage`.

### Leadership: everyone publishes, the spotlight picks

As in Figma, anyone can be followed:

- **Every participant's client publishes its own state stream** to the room. State messages are tiny, so the cost
  is negligible.
- The room keeps each participant's latest snapshot.
- **Following is chosen on the client**: "follow Reader Two" points the stream reader at Reader Two's stream. Clicking any face
  in the presence list does it.
- The room holds a **spotlight** (`ParticipantId | null`). Everyone who has not picked someone follows whoever holds
  it. "The leader" in the follow-me section is the spotlight holder.

Changing the leader is one control message:

```ts
{ ch: "control", body: { type: "spotlight", to: "reader2" } }   // room checks permission, bumps term, tells everyone
```

Followers switch streams and apply Reader Two's latest snapshot at once — the room already has it. Nothing reconnects;
no tokens change.

Who may move it:

| Mode                | Rule                                                         |
| ------------------- | ------------------------------------------------------------ |
| Presenter (default) | The host gives and takes the spotlight.                      |
| Hand raise          | A participant asks; the host or the current leader approves. |
| Open (a study pair) | Anyone with `canLead` takes it.                              |

- **Terms.** Every spotlight change increments `term`; the room stamps it on what it relays and followers drop
  spotlight-stream messages from an older term, so a lagging message from the previous leader cannot pull everyone
  back.
- **The new leader does not jump.** If Reader Two was following, her reader already shows the room's state, so her first
  keyframe matches what everyone sees. If she was elsewhere, followers go where she is — which is the point.
- **The leader leaves.** The spotlight returns to the host, or clears after a 30 s grace period; followers stay where
  they are ("Waiting for a leader").
- Breaking away and "Follow again" work the same for any participant, since following anyone is the same stream
  reader.

### Chat

Chat differs from reader state in what matters:

|                     | Reader state                 | Chat                       |
| ------------------- | ---------------------------- | -------------------------- |
| What matters        | only the latest              | every message              |
| A late joiner needs | the last keyframe            | the history                |
| Reconnect           | `resync` → a fresh keyframe  | "everything after `seq` N" |
| Who writes          | each participant, own stream | everyone, one shared log   |

- **Order and replay.** The room stamps `seq`. On reconnect the client sends `{ type: "since", seq }` and gets what
  it missed. The client sends a `clientMsgId`; the room drops duplicates from resends after a dropped connection.
- **Identity.** Watching can be anonymous; chatting needs signing in (`canChat` in the token). The host can mute,
  delete messages and make the room read-only.
- **Retention.** Deleted when the room ends, or kept N days; if staff need it for moderation or "save this
  discussion", the room also writes through to Django/Postgres. Decided before chat ships.
- **Moderation.** Per-user rate limits, size limits, a report button, and a decision about minors (e.g. in a class
  only the host can turn chat on). This is product and policy work more than engineering.
- **Refs in chat.** A message can carry a ref or a snapshot; clicking it `applySnapshot`s it — the same API again.
  Chat text is rendered as text, never as HTML.
- **Kill switch.** The chat UI has a per-request kill switch so it can be turned off without a deploy.

### Security of what arrives

Everything from the room or a `postMessage` peer is untrusted input:

- Snapshots, changes and envelopes are **parsed with runtime schemas** (the same JSON Schemas the package publishes,
  via a validator such as Zod), never cast with `as`.
- A snapshot's `url` must be a **same-site relative path** in the reader's grammar: reject `//`, `://`, backslashes
  and anything `isReaderPath` does not accept, before navigating.
- Folding changes never writes `__proto__`, `constructor` or `prototype` keys (slices are held in `Map`s).
- `PostMessageTransport` checks `event.origin` against an allowlist.
- The socket opens only on the client, after hydration; no module touches `WebSocket` at import time (SSR).

### Limits

- One Durable Object comfortably serves hundreds of participants. A 10,000-person webinar would need a fan-out tier
  across several objects — only if that becomes a real use.
- Every participant publishing costs each follower nothing (they receive only the stream they follow, plus
  presence); the room sends each participant only what they subscribe to.
- **As built** (`src/lib/session/room.ts`): the spotlight holder's stream goes to everyone (followers, and those who
  broke away and may "Follow again"); anyone else's only to the members whose presence follows them. Per connection
  and per second: 20 changes, 4 keyframes, 5 control and presence messages together (`leave` always passes). A
  presence status that changes nothing, and the same join again, broadcast nothing. Client side, everything from the
  room is parsed (`src/lib/session/incoming.ts`) before the client or the follow bar reads it.

## Driving the reader from outside (embed)

The same reader stream over a `PostMessageTransport` lets an embedding page send keyframes and changes, and, with a
writer, follow what the embedded reader does. `sefaria:bootstrap-url` (`lib/integration/legacy-events.ts`) stays
for the Library Assistant's links; an `apply-snapshot` event can sit beside it for apps on the page that want more
than a URL.

## Packaging (open source)

- `src/lib/reader-state/core/` is the future package `@sefaria/reader-state`: types, the JSON Schemas for
  `ReaderSnapshot`, `StreamMessage` and `ProtocolMessage`, slice registry, stream writer and reader, `diff`/`fold`,
  warning codes, transports, recorder and player logic. A lint rule forbids imports from `~/` and from React in it;
  it builds and tests on its own.
- `src/lib/session/` is the room client (envelope, `control`, `presence`, `chat`, following and spotlight logic),
  later its own package; it depends on the core, never the reverse. The relay Worker lives beside it.
- `src/lib/reader-state/sefaria/` is this app's host: the router binding, the `sefaria.*` slices, the URL codec's
  role as the `url` field.
- `src/features/reader-state/` is the UI: record controls and timeline, the follow bar, the leader's presence pill.
- The public contract is the schemas plus `ReaderHost` and `StateSlice`. Each schema has a version; additions are
  optional fields; anything else is a new version, and the core reads the previous one.
- Slice ids are namespaced so other readers' slices never clash with `sefaria.*`.

## Keeping it complete: the replay check

The way this design fails is drift: someone adds `useState` that shows on screen and never registers a slice, and
replays and follows silently stop matching. Tests catch it:

- `scripts/replay-check.mjs` drives a scripted session with Playwright (open a text, open the sidebar, change
  settings, scroll, open a menu, open a second panel), records it, then replays it and compares a screenshot at each
  keyframe with the one taken while recording (`scripts/parity-diff-page.py`). Differing pixels beyond the
  threshold fail the check and name the keyframe.
- A follow e2e test opens two pages joined by `BroadcastChannelTransport`, drives the leader, and compares the
  follower's screenshots at the same moments (settings equal in both). It also checks breaking away and
  "Follow again", and that the follower's history has one entry for the whole session.

Rule for reviews: state that changes what is on screen is either in the URL, in a slice, or listed under "Not
captured" above.

## Phases

Each phase is finishable and useful on its own.

1. **Core and host, URL and history state.** `getSnapshot` / `applySnapshot` / `subscribe`, the apply window,
   `diff`/`fold`, stream writer and reader, `MemoryTransport`. No slices yet.
2. **Record and replay** over phase 1: recorder, player with its memory router, seek.
3. **Follow me, front end**, over phase 1, with an in-browser room on `BroadcastChannelTransport` (no backend): the
   `follow` parameter, the bar, breaking away and returning, presence, the spotlight and following anyone.
4. **The relay**: the Durable Object room, Django's session and token endpoints, `WebSocketTransport`; tested on
   staging.
5. **Slices:** `sefaria.scroll` and `sefaria.focus` (with the replay and follow checks), then `sefaria.settings`
   with its non-persisting path.
6. **`sefaria.overlay`**, for the overlays agreed to be in scope.
7. **Chat**, once retention and moderation are decided: the `chat` channel, history, `since` replay, mute/delete.
8. **Extract** the core as `@sefaria/reader-state` and the room client and relay as their own package.

## Open questions

- Where recordings live: downloaded files only, or saved to the account (needs a Django endpoint and a privacy
  decision: a recording is a reading history).
- Who may follow: anyone with the link, or signed-in people only.
- Whether Sefaria's Cloudflare account can run Workers and Durable Objects (else the in-cluster fallback).
- The default leadership mode per kind of session (presenter for a class, open for a pair).
- Chat retention (end of room vs N days, write-through to Postgres) and the policy for minors.
- Which overlays are in scope. The Library Assistant's conversation is its own app's state (kept server-side; the
  widget holds a session id). The reader can capture whether it is open from the widget's `chatbot:opened` /
  `chatbot:closed` events and reopen it with `chatbot:open`; sharing or recording the conversation is a separate
  decision.
- Whether a viewer can "take over" from a moment in a replay (apply that snapshot to their real reader).
- Whether the timeline and the follow bar show labels (book and chapter) — cheap, since each change carries a URL.

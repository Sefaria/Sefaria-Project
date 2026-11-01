# Reader state API — execution plan

Builds three products from docs/READER_STATE_API.md: the **client state API**, **recording** (keyframe recordings, download and load,
replay with a timeline), and **follow me** (front end, with an in-browser room; the Cloudflare relay is out of scope). Written to be run
by many agents at once: each task owns its files, and the contracts below are fixed before anyone starts.

## Frozen contracts (written first, do not change without the plan owner)

| File | What |
|---|---|
| `src/lib/reader-state/core/types.ts` | snapshots, changes, slices, registry, warnings, `ReaderStateApi`, `ReaderHost`, streams, `Recording`, `StateTransport` |
| `src/lib/session/protocol.ts` | room envelope, channels, control and presence messages, limits |
| `src/features/reader-state/context.tsx` | `ReaderStateContext`, `useReaderState`, `useRegisterSlice` |
| `src/features/reader-state/{recording/RecordingUi,follow/FollowUi}.tsx` | placeholders the provider mounts; tasks H and I fill them |

A task that needs a contract change stops and reports it instead of editing the file.

## Scope (MVP contract)

In: the API over URL + history state; slices `sefaria.settings`, `sefaria.scroll`, `sefaria.focus`; recorder, file download/load,
player with seek; follow with spotlight, following anyone, breaking away, "Follow again", presence; transports memory, BroadcastChannel,
postMessage, WebSocket; a dev WebSocket room server for trying follow across devices locally; unit tests, stories for new UI, e2e for
record/replay and follow.

Out (later phases): `sefaria.overlay`, chat, the Cloudflare relay and Django session/token endpoints, hand-raise UI beyond the protocol,
package extraction.

## Waves and tasks

Rules for every task: work in `/Users/akiva/Sefaria/dev/sefaria-reader`; edit only the files you own (create new ones freely inside your
folders); do not commit; run `npx tsc --noEmit`, `npx vitest run --project unit <your paths>`; errors in files another task owns are not
yours to fix — report them. Code style: match the surrounding code (doc comments explaining *why*, `~/` imports, CSS modules).

### Wave 1 — parallel, against the contracts

| Task | Owns | Builds |
|---|---|---|
| **A. Core** | `src/lib/reader-state/core/` (except `types.ts`, `transports/`) | `registry.ts`, `diff.ts` (`diff`, `fold`; never writes `__proto__`/`constructor`/`prototype`), `schema.ts` (zod: `parseSnapshot`, `parseStreamMessage`, `parseRecording`), `api.ts` (`createReaderStateApi(host)`: apply window, applied-vs-local, coalescing, filters, warnings), `stream.ts` (`createStreamWriter`, `createStreamReader`), `index.ts`; unit tests. No `~/` imports, no React. |
| **B. Transports** | `src/lib/reader-state/core/transports/` | `memory.ts` (a linked pair), `broadcast-channel.ts`, `post-message.ts` (origin allowlist), `websocket.ts` (reconnect with back-off, status); unit tests. |
| **C. Host + provider** | `src/lib/reader-state/sefaria/host.ts`, `safe-url.ts`, `src/features/reader-state/ReaderStateProvider.tsx`, edit `src/routes/__root.tsx` (mount only) | `createSefariaHost(router, registry)`; `acceptsUrl` (same-site relative, `isDjangoPage` refused); provider creating registry + API, mounting `RecordingUi` and `FollowUi`, exposing `window.sefariaReaderState` (the API) on the client; tests. |
| **D. Slices** | `src/lib/reader-state/sefaria/slices/`, edits to `src/features/reader/settings-context.tsx`, `src/features/workspace/navigation.tsx`, `src/features/reader/TextPanel.tsx` | `sefaria.settings` (non-persisting apply path), `sefaria.scroll` (per panel key: `{ref, offset}` from the existing `getPosition`/`restorePosition`; apply waits for the text), `sefaria.focus` (panel last interacted with); tests. |
| **E. Room** | `src/lib/session/room.ts`, `local-room.ts`, `scripts/dev-room-server.mjs` (+ `ws` devDependency if needed) | pure `createRoom({ now })`: join/leave, stamps `from`/`seq`/`t`/`term`, last keyframe + changes per participant, spotlight and modes, resync answers, presence, limits; `local-room.ts` runs a room in the host tab over BroadcastChannel; the dev server runs the same room over WebSockets; tests. |
| **F. Session client** | `src/lib/session/client.ts`, `ids.ts` | `createSessionClient({ api, transport, self })`: publishes own stream (moment slices, scroll sampled 100 ms), follows the spotlight or a chosen participant, breaks away on local input/changes, `followAgain`, status machine (connecting, live, paused, leader-away, no-leader, reconnecting, ended), presence; `newSessionId()` (256 bits, base62); tests with fakes. |
| **G. Recording logic** | `src/lib/reader-state/recording/` | `recorder.ts` (start/stop → `Recording`, scope all, scroll sampled 250 ms), `file.ts` (serialize, download as `.sefaria-recording.json`, load + validate), `player.ts` (`snapshotAt(rec, t)`, play/pause/seek/rate over an API, `persist: false`); tests. |

### Cross-task signatures (wave 1 builds against these)

- `core/diff.ts`: `diff(a: ReaderSnapshot, b: ReaderSnapshot): SnapshotChange`, `fold(s: ReaderSnapshot, c: SnapshotChange): ReaderSnapshot`.
- `core/schema.ts`: `parseSnapshot(x): ReaderSnapshot | null`, `parseStreamMessage(x): StreamMessage | null`, `parseRecording(x): Recording | null`.
- `core/registry.ts`: `createSliceRegistry(): SliceRegistry`. `core/api.ts`: `createReaderStateApi(host: ReaderHost): ReaderStateApi`.
- `core/stream.ts`: `createStreamWriter(api, opts?: StreamWriterOptions): StreamWriter`, `createStreamReader(api, ctx: ApplyContext): StreamReader`.
- `core/transports/memory.ts`: `createMemoryPair<M>(): [StateTransport<M>, StateTransport<M>]`.
- Everything under `core/` and `session/room.ts` uses relative imports only (type-only imports excepted), so Node can load the room.

### Integration checkpoint (plan owner)

Typecheck + unit tests green across all of wave 1; fix mismatches between tasks; smoke-test the API in the browser
(`window.sefariaReaderState.getSnapshot()`, `applySnapshot`).

### Wave 2 — parallel UI

| Task | Owns | Builds |
|---|---|---|
| **H. Recording UI** | `src/features/reader-state/recording/`, `src/ui/Timeline/` (+ story), one menu entry | Record/stop control, timeline scrubber with play/pause and time, download, load (file picker + drop), playback mode banner. Playback: preferably a second router with `createMemoryHistory`; if that is impractical, apply to the real reader with replace navigations, one push on entering playback, `persist: false`, analytics paused — and document the choice in READER_STATE_API.md. |
| **I. Follow UI** | `src/features/reader-state/follow/`, the share entry in `src/ui/ShareView/` | "Follow me" in Share, the `follow` parameter (keep `sessionId` in sessionStorage, strip it with a replace navigation), follow bar with states, presence pill with faces (click to follow), Stop. Transport: `PUBLIC_ROOM_URL` set → WebSocket to it; else the local room over BroadcastChannel. |

### Wave 3 — checks

- **J. Replay check**: `e2e/recording.spec.ts` — record a scripted session, download, load, seek to each keyframe, compare screenshots.
- **K. Follow e2e**: `e2e/follow.spec.ts` — two pages in one context over BroadcastChannel: follow, break away, follow again, spotlight
  change, history has one entry.
- **Review**: independent reviewers (correctness, SSR/hydration safety, security of incoming data) over the whole diff; a fixer applies
  the confirmed findings.

### Done when

Typecheck, unit, stories and the new e2e specs pass; existing e2e specs touched by the edited files still pass; the three products work
in the browser; READER_STATE_API.md updated where the build differed.

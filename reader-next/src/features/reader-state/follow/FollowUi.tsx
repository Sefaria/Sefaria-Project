/**
 * Follow me (docs/READER_STATE_API.md, "Follow me"), mounted by ReaderStateProvider beside the app.
 *
 * Mounted on every page, so it stays small: in the browser only (effects) it registers a stand-in for Share's "Follow me" entry
 * (./lazy.ts) and loads the follow controller — with the session client, the transports, the in-browser room when no room server is
 * configured, and the follow bar — only when it is needed: the first "Follow me" click, a `follow` parameter in the address, or a session
 * sessionStorage kept for a reload. Then it adopts the parameter or the stored session (./adopt.ts) and shows the bar while a session is
 * open. On the server it renders nothing and opens nothing — no socket or BroadcastChannel is touched before hydration.
 */
import { lazy, Suspense, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { QueryClientContext } from "@tanstack/react-query";
import { viewerQuery } from "~/features/auth/viewer";
import { PUBLIC_CONFIG } from "~/lib/config";
import { registerFollowMe } from "~/ui/ShareView/follow-me";
import { useReaderState } from "../context";
import { adoptFollowLocation, type AdoptRouter } from "./adopt";
import type { FollowController, FollowControllerOptions, FollowControllerState } from "./controller";
import { lazyFollowMe } from "./lazy";
import { newParticipantId } from "~/lib/session/ids";
import { followParamOf, readStoredFollow, roomSocketUrl, safeSessionStorage, writeStoredFollow } from "./params";

const FollowBar = lazy(() => import("./FollowBar").then((m) => ({ default: m.FollowBar })));

const noSubscribe = () => () => {};
const noState = () => null;

/** The controller module, and the in-browser room only when no room server is configured. */
async function loadFollow(roomUrl: string | undefined) {
  const [controller, localRoom] = await Promise.all([
    import("./controller"),
    roomSocketUrl(roomUrl, "probe") ? Promise.resolve(undefined) : import("~/lib/session/local-room"),
  ]);
  return { createFollowController: controller.createFollowController, localRoom };
}

export function FollowUi() {
  const ctx = useReaderState();
  const router = useRouter();
  const href = useLocation({ select: (l) => l.href });
  // The signed-in reader's name, read from the query cache when joining (it may settle after the controller is built). Optional: without a
  // query client (an isolated test of the provider) everyone is a guest, rather than the whole app failing to render.
  const queryClient = useContext(QueryClientContext);
  const viewerName = useRef<() => string | null>(() => null);
  viewerName.current = () => queryClient?.getQueryData(viewerQuery.queryKey)?.name ?? null;
  const [controller, setController] = useState<FollowController | null>(null);
  const loadRef = useRef<(() => Promise<FollowController>) | null>(null);

  useEffect(() => {
    if (!ctx) return;
    let disposed = false;
    let built: FollowController | null = null;
    let loading: Promise<FollowController> | null = null;
    const load = () => {
      loading ??= loadFollow(PUBLIC_CONFIG.roomUrl).then(({ createFollowController, localRoom }) => {
        if (disposed) throw new Error("follow: unmounted while loading");
        const opts: FollowControllerOptions = {
          api: ctx.api,
          roomUrl: PUBLIC_CONFIG.roomUrl,
          localRoom,
          storage: safeSessionStorage(),
          viewerName: () => viewerName.current(),
        };
        const c = createFollowController(opts);
        built = c;
        source.attach(c.followMe);
        setController(c);
        return c;
      });
      loading.catch(() => {
        if (!built) loading = null; // a failed import may be tried again
      });
      return loading;
    };
    const source = lazyFollowMe(load);
    const unregister = registerFollowMe(source);
    loadRef.current = load;
    return () => {
      disposed = true;
      loadRef.current = null;
      unregister();
      built?.dispose();
      setController(null);
    };
  }, [ctx]);

  // Load as soon as there is a session to join: a follow link in the address, or one kept for a reload. A link's session id is kept in
  // sessionStorage at once, because the address may lose the parameter while the code loads (the reader settles its URL); adopt then
  // finds the session there and joins it.
  useEffect(() => {
    if (controller || !loadRef.current) return;
    const storage = safeSessionStorage();
    const sessionId = followParamOf(router.history.location.search);
    if (sessionId && readStoredFollow(storage)?.sessionId !== sessionId) {
      writeStoredFollow(storage, { sessionId, role: "guest", participantId: newParticipantId() });
    }
    if (sessionId || readStoredFollow(storage)) loadRef.current().catch(() => {});
  }, [controller, router, href, ctx]);

  useEffect(() => {
    if (!controller) return;
    void adoptFollowLocation(router as unknown as AdoptRouter, controller, safeSessionStorage());
  }, [controller, router, href]);

  const state: FollowControllerState | null = useSyncExternalStore(
    controller ? controller.subscribe : noSubscribe,
    controller ? controller.getState : noState,
    noState,
  );
  if (!controller || !state || (!state.session && !state.lost)) return null;
  return (
    <Suspense fallback={null}>
      <FollowBar
        client={state.session?.client ?? null}
        locations={state.locations}
        lost={state.lost}
        onLeave={controller.leave}
        onEndSharing={controller.endSharing}
        onDismiss={controller.dismiss}
      />
    </Suspense>
  );
}

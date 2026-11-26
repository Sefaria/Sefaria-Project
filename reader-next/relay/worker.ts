/**
 * The follow-me room relay on Cloudflare (docs/ROOM_RELAY_CLOUDFLARE.md): the Worker checks the path and the page's Origin, then hands
 * the WebSocket to the Durable Object named after the session, which runs the same pure room (src/lib/session/room.ts) as the in-tab
 * room and scripts/dev-room-server.mjs.
 */
import { DurableObject } from "cloudflare:workers";
import { createRoom, type Outgoing, type Room as PureRoom } from "../src/lib/session/room";
import { STATUS_PATH, statusAuthorized, statusOf, type RoomStatus } from "../src/lib/session/room-status";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
  /** Shared with the Sefaria Social server for `GET /status/<id>` (a secret: `wrangler secret put STATUS_SECRET`). Unset: refused. */
  STATUS_SECRET?: string;
}

const ROOM_PATH = /^\/r\/([A-Za-z0-9_-]{8,128})$/;

/** Is this Origin allowed? Rules are exact origins, or "https://*.suffix" for any subdomain of suffix. */
export function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  for (const rule of allowed.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (rule === origin) return true;
    const m = /^(https?):\/\/\*\.(.+)$/.exec(rule);
    if (!m) continue;
    try {
      const u = new URL(origin);
      if (u.protocol === `${m[1]}:` && !u.port && u.hostname.endsWith(`.${m[2]}`)) return true;
    } catch {
      // not a URL: no match
    }
  }
  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    const status = STATUS_PATH.exec(url.pathname);
    if (status) {
      if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
      const ok = statusAuthorized(req.headers.get("Authorization"), env.STATUS_SECRET, (a, b) => crypto.subtle.timingSafeEqual(a, b));
      if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
      const body = await env.ROOMS.get(env.ROOMS.idFromName(status[1]!)).status();
      return Response.json(body, { headers: { "cache-control": "no-store" } });
    }
    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected a WebSocket", { status: 426 });
    if (!originAllowed(req.headers.get("Origin"), env.ALLOWED_ORIGINS)) return new Response("forbidden", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

/** One follow session: the pure room, its sockets, and a once-a-second tick while anyone is connected. */
export class Room extends DurableObject<Env> {
  private room: PureRoom = createRoom({ now: Date.now });
  private sockets = new Map<string, WebSocket>();
  private nextConn = 1;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** Where the session is now, for Sefaria Social's feed cards (spec 032): no socket, nothing personal. */
  async status(): Promise<RoomStatus> {
    return statusOf(this.room.snapshot());
  }

  override async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept(); // the standard API, not acceptWebSocket(): no hibernation, which would discard the in-memory room
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
        } catch {
          // a socket closing under us; its close event cleans up
        }
      }
    }
  }
}

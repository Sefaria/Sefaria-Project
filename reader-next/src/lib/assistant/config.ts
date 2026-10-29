/**
 * Which Library Assistant build the page loads, and the attributes `<lc-chatbot>` gets: the rules of the old server
 * (sefaria/system/context_processors.py `_chatbot_script_url_and_type`, reader/views.py `base_props`), kept in one place.
 *
 * The build, first match wins:
 *  1. `?chatbot_version=<n>` on any page: preview build n (https://<n>.ai-server.coolifydev.sefaria.org), remembered for the browser
 *     session (the old server kept it in the Django session; here a session cookie). `?chatbot_version=clear` forgets it.
 *  2. CHATBOT_VERSION on the server: the same, for a whole deployment (a cauldron testing a preview build).
 *  3. CHATBOT_USE_LOCAL_SCRIPT on the server: the assistant's own dev server (http://localhost:5173/src/main.js, an ES module).
 *  4. CHATBOT_API_BASE_URL on the server (Django's variable): its static build.
 * A version is a number or it is ignored: it is written into a script URL (the old server's same safeguard).
 *
 * @feature AI-005 Chatbot preview build selection (?chatbot_version)
 * @feature AI-012 Chatbot version override via query param
 */
import type { AssistantEnv } from "~/lib/config";

export const VERSION_PARAM = "chatbot_version";
export const VERSION_COOKIE = "chatbot_version";
const PREVIEW_HOST = (v: string) => `https://${v}.ai-server.coolifydev.sefaria.org`;
const LOCAL_SCRIPT = "http://localhost:5173/src/main.js";

const asVersion = (v: string | null | undefined): string | null => (v && /^\d+$/.test(v.trim()) ? v.trim() : null);

/** What `?chatbot_version=` asks for: a version to remember, "clear", or nothing (absent or not a number). */
export function versionFromQuery(search: string): { set: string } | { clear: true } | null {
  const raw = new URLSearchParams(search).get(VERSION_PARAM)?.trim();
  if (!raw) return null;
  if (raw === "clear") return { clear: true };
  const v = asVersion(raw);
  return v ? { set: v } : null;
}

/** The version this reader asked for earlier in the session (the cookie), if any. */
export function versionFromCookie(cookieHeader: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${VERSION_COOKIE}=([^;]*)`).exec(cookieHeader);
  return m ? asVersion(decodeURIComponent(m[1]!)) : null;
}

/** The session cookie that remembers a version (empty value and max-age 0 to forget it). */
export const versionCookie = (version: string | null): string =>
  version ? `${VERSION_COOKIE}=${version}; path=/; SameSite=Lax` : `${VERSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;

export interface AssistantBuild {
  /** The script to load. */
  scriptUrl: string;
  /** "module" for the dev server's ES module; otherwise a classic script. */
  scriptType?: "module";
  /** The assistant's API (`api-base-url`). */
  apiBaseUrl: string;
}

/** The build for a reader's version (query or cookie, already resolved) and the deployment's settings. */
export function assistantBuild(readerVersion: string | null, env: AssistantEnv): AssistantBuild {
  const version = asVersion(readerVersion) ?? asVersion(env.version);
  if (version) return { scriptUrl: `${PREVIEW_HOST(version)}/static/js/lc-chatbot.umd.cjs`, apiBaseUrl: `${PREVIEW_HOST(version)}/api` };
  if (env.useLocalScript) return { scriptUrl: LOCAL_SCRIPT, scriptType: "module", apiBaseUrl: env.apiBaseUrl };
  return { scriptUrl: `${env.apiBaseUrl.replace(/\/api\/?$/, "")}/static/js/lc-chatbot.umd.cjs`, apiBaseUrl: env.apiBaseUrl };
}

/** What the server says about this reader (GET /api/library-assistant, reader/views.py). */
export interface AssistantAccess {
  /** Signed in and the assistant is on for them (their setting, or the old experiments rule). */
  enabled: boolean;
  /** The encrypted, short-lived token that names them to the assistant (`user-id`). */
  userToken: string | null;
  isModerator: boolean;
}

/** `<lc-chatbot>`'s attributes, as the old ReaderApp set them (AI-011). Limits come from remote config, as on the old server. */
export function assistantAttributes(
  access: AssistantAccess,
  build: AssistantBuild,
  env: AssistantEnv,
  opts: { interfaceLang: "en" | "he"; maxInputChars?: unknown; maxPrompts?: unknown },
): Record<string, string> {
  const num = (v: unknown, fallback: number) => String(typeof v === "number" && v > 0 ? v : fallback);
  return {
    "user-id": access.userToken ?? "",
    "api-base-url": build.apiBaseUrl,
    origin: env.origin,
    ...(access.isModerator ? { "is-moderator": "true" } : {}),
    placement: "right",
    "default-open": "true",
    mode: "floating",
    "max-input-chars": num(opts.maxInputChars, 10000),
    "max-prompts": num(opts.maxPrompts, 100),
    "interface-lang": opts.interfaceLang,
  };
}

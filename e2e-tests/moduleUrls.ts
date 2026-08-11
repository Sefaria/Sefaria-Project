/**
 * Where each module lives, derived from `SANDBOX_URL` / `SANDBOX_URL_IL`.
 *
 * Two shapes of target exist and they cannot be assembled the same way:
 *
 * - A **deployed sandbox** is given as a bare domain (`https://sefariastaging.org`) whose
 *   modules live on `www.` / `voices.` (`chiburim.` in Hebrew) subdomains over TLS. The
 *   subdomains are prefixed onto the domain here.
 * - A **development server** is given as a host that has to be used exactly as written:
 *   `localhost`, an explicit port, or plain `http`. Prefixing `https://www.` onto one of
 *   those yields a hostname that does not resolve, so the URL is used verbatim, and only
 *   Voices gets a sub-host — Chromium resolves `*.localhost` to 127.0.0.1.
 *
 * Exported as a function rather than a constant because `playwright.config.ts` loads
 * `e2e-tests/.env` in its own module body: an imported module is evaluated *before* any
 * statement of its importer, so a value computed at import time would be frozen with the
 * environment as it stood before dotenv ran. Workers inherit the already-populated
 * environment and can call this at import time safely.
 */

type ModuleUrls = {
  EN: { LIBRARY: string; VOICES: string };
  HE: { LIBRARY: string; VOICES: string };
};

/**
 * Whether this URL must be used as written instead of being rebuilt from its domain.
 *
 * Scoped to loopback hosts on purpose. Every other target — deployed sandboxes and the
 * in-cluster host CI builds — keeps the subdomain assembly it has always had, so widening
 * this cannot change where an existing suite points.
 *
 * Deliberately textual: `new URL('localhost:8000')` parses `localhost:` as the scheme, and
 * a bare domain has to be readable without one.
 */
function usedVerbatim(raw: string): boolean {
  const host = raw.replace(/^https?:\/\//, '').split('/')[0];
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
}

/** Scheme + host of `raw`, with `subHost` prefixed onto the host when given. */
function origin(raw: string | undefined, subHost?: string): string {
  const url = new URL((raw ?? '').match(/^https?:\/\//) ? raw! : `http://${raw}`);
  return `${url.protocol}//${subHost ? `${subHost}.${url.host}` : url.host}`;
}

const domainOf = (raw: string | undefined) =>
  raw?.replace(/^https?:\/\//, '').replace(/^www\./, '');

export function moduleUrls(): ModuleUrls {
  const sandbox = process.env.SANDBOX_URL;
  const sandboxIL = process.env.SANDBOX_URL_IL;

  if (usedVerbatim(sandbox ?? '')) {
    return {
      EN: {
        LIBRARY: origin(sandbox),
        VOICES: origin(sandbox, 'voices'),
      },
      HE: {
        LIBRARY: origin(sandboxIL),
        // There is no chiburim. host on a dev server (it isn't in ALLOWED_HOSTS):
        // Hebrew Voices is the voices. host with the interfaceLang=hebrew cookie.
        VOICES: origin(sandboxIL, 'voices'),
      },
    };
  }

  return {
    EN: {
      LIBRARY: `https://www.${domainOf(sandbox)}`,
      VOICES: `https://voices.${domainOf(sandbox)}`,
    },
    HE: {
      LIBRARY: `https://www.${domainOf(sandboxIL)}`,
      VOICES: `https://chiburim.${domainOf(sandboxIL)}`,
    },
  };
}

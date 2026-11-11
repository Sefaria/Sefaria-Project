import { createFileRoute } from "@tanstack/react-router";
import { interfaceCookieDomain, interfaceLanguageResponse } from "~/lib/shell/interface-language";
import { domainModulesFromEnv, withHostOnlyLangCookieExpired } from "~/server/language-domain";
import { passThrough, passThroughEnabled, requestHost } from "~/server/pass-through";

/**
 * /interface/english, /interface/hebrew: set the interface language and go back (RTE-034), as Django's interface_language_redirect.
 * A signed-in reader's switch is Django's own when it is reachable: it also saves the language in their profile, which outranks the
 * cookie for them (without that, the switch looks stuck on a host Django pins to the other language). Django's answer also expires a
 * stale host-only `interfaceLang` (Django sets only the domain cookie; the host-only one would win: rework round 1).
 */
export const Route = createFileRoute("/interface/$lang")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { lang: string } }) => {
        const where = { host: requestHost(request), modules: domainModulesFromEnv() };
        if (passThroughEnabled() && /(?:^|;\s*)sessionid=[^;]+/.test(request.headers.get("cookie") ?? ""))
          return passThrough(request).then((res) => withHostOnlyLangCookieExpired(res, interfaceCookieDomain(where.host, where.modules)));
        return interfaceLanguageResponse(params.lang, new URL(request.url).searchParams.get("next"), where);
      },
    },
  },
});

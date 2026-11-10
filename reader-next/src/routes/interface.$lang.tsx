import { createFileRoute } from "@tanstack/react-router";
import { interfaceLanguageResponse } from "~/lib/shell/interface-language";
import { domainModulesFromEnv } from "~/server/language-domain";
import { passThrough, passThroughEnabled, requestHost } from "~/server/pass-through";

/**
 * /interface/english, /interface/hebrew: set the interface language and go back (RTE-034), as Django's interface_language_redirect.
 * A signed-in reader's switch is Django's own when it is reachable: it also saves the language in their profile, which outranks the
 * cookie for them (without that, the switch looks stuck on a host Django pins to the other language).
 */
export const Route = createFileRoute("/interface/$lang")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { lang: string } }) => {
        if (passThroughEnabled() && /(?:^|;\s*)sessionid=[^;]+/.test(request.headers.get("cookie") ?? "")) return passThrough(request);
        return interfaceLanguageResponse(params.lang, new URL(request.url).searchParams.get("next"), { host: requestHost(request), modules: domainModulesFromEnv() });
      },
    },
  },
});

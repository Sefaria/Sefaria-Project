import { createFileRoute } from "@tanstack/react-router";
import { interfaceLanguageResponse } from "~/lib/shell/interface-language";

/** /interface/english, /interface/hebrew: set the interface language and go back (RTE-034). */
export const Route = createFileRoute("/interface/$lang")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { lang: string } }) => interfaceLanguageResponse(params.lang, new URL(request.url).searchParams.get("next")),
    },
  },
});

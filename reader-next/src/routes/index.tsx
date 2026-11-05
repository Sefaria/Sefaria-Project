import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/`: the library's home is Browse the Library, as on sefaria.org (VERIFIED 2026-10-29: `/` answers 302 → /texts, dropping any query).
 *
 * @feature LIB-001 Browse the Library category grid
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/texts", search: {}, statusCode: 302 });
  },
});

/**
 * The /compare routes' loader: the address as Django reads it (a path its pattern does not match is a 404, which Django then answers),
 * the section(s) to show, and in the first paint the versions to choose from and the tables' texts.
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 * @feature RTE-019 Version compare tool URL
 */
import { notFound } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { compareSetupQueryOptions, sectionTextQueryOptions } from "~/lib/compare/queries";
import { parseComparePath } from "~/lib/compare/url";
import { versionsQueryOptions } from "~/lib/versions/book-versions";

/** Tables rendered on the server; a ref above section level can list dozens (Rashi on Genesis 1: 31), the rest load in the browser. */
const SSR_TABLES = 6;

export async function loadCompareRoute(queryClient: QueryClient, pathname: string) {
  const address = parseComparePath(pathname);
  if (!address) throw notFound();
  const setup = await queryClient.ensureQueryData(compareSetupQueryOptions(address.compRef)).catch(() => ({ secRef: "", refArray: null, nextChapter: null }));
  const { lang, v1, v2 } = address;
  const refs = lang && v1 && v2 ? (setup.refArray ?? (setup.secRef ? [setup.secRef] : [])).slice(0, SSR_TABLES) : [];
  await Promise.all([
    setup.secRef ? queryClient.prefetchQuery(versionsQueryOptions(setup.secRef)) : undefined,
    ...refs.flatMap((ref) => [v1!, v2!].map((v) => queryClient.prefetchQuery(sectionTextQueryOptions(ref, lang!, v)))),
  ]);
  return { address };
}

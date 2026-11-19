import { useQuery } from "@tanstack/react-query";
import { useViewer } from "~/features/auth/viewer";
import { fetchCms, jobsMoment, jobsQuery, productsQuery, shapeJobs, shapeProducts, shapeTeam, TEAM_QUERY, UNDATED_RANGE } from "~/lib/cms/cms";
import { PUBLIC_CONFIG } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { JobsView, ProductsView, TeamMembersView, type CmsState } from "./CmsPages";

/**
 * The CMS parts of /team, /products and /jobs with their data: each is asked for in the browser once the page is showing (as the old
 * pages did), through Django's CMS proxy on the API origin (lib/cms), and kept a few minutes in memory (never on disk).
 *
 * @feature STA-009 Jobs page
 * @feature STA-010 Team page
 * @feature STA-011 Products page
 */

const STALE_MS = 5 * 60_000;

function useCms<T>(key: readonly unknown[], load: (signal: AbortSignal) => Promise<T>): CmsState<T> {
  const q = useQuery({ queryKey: ["cms", ...key], queryFn: ({ signal }) => load(signal), staleTime: STALE_MS, retry: 1 });
  if (q.isError) return { status: "error" };
  if (q.data === undefined) return { status: "loading" };
  return { status: "ready", data: q.data };
}

export function TeamMembersPart() {
  const locale = useInterfaceLang() === "hebrew" ? "he" : "en";
  const state = useCms(["team", locale], async (signal) => shapeTeam(await fetchCms(TEAM_QUERY, UNDATED_RANGE, PUBLIC_CONFIG.apiOrigin, fetch, signal), locale));
  return <TeamMembersView state={state} />;
}

export function ProductsPart() {
  const moderator = !!useViewer()?.isStaff;
  const state = useCms(["products", moderator], async (signal) => shapeProducts(await fetchCms(productsQuery(moderator), UNDATED_RANGE, PUBLIC_CONFIG.apiOrigin, fetch, signal)));
  return <ProductsView state={state} />;
}

export function JobsPart() {
  const { iso, range } = jobsMoment(new Date());
  const state = useCms(["jobs", iso], async (signal) => shapeJobs(await fetchCms(jobsQuery(iso), range, PUBLIC_CONFIG.apiOrigin, fetch, signal)));
  return <JobsView state={state} />;
}

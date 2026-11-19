/**
 * The CMS (Strapi) content of the About pages /team, /products and /jobs: the GraphQL queries of the old pages
 * (static/js/StaticPages.jsx TeamMembersPage, ProductsPage, JobsPage), asked through Django's CMS proxy
 * (`POST /api/strapi/graphql-cache`, sefaria/views.py strapi_graphql_cache) on the API origin, and the answers shaped and ordered as
 * those pages showed them.
 *
 * The proxy reads the CMS address from Django's own settings (STRAPI_LOCATION, STRAPI_PORT), so this client needs no CMS address of
 * its own, and it keeps each answer until the CMS's webhook clears the cache (/api/strapi/cache-invalidate). Its `start_date` and
 * `end_date` parameters only name the cache entry (with a hash of the query): the team and the products are not dated, so they use a
 * fixed pair; the jobs query is dated (open postings) and names the hour it asks about.
 *
 * GraphQL reports failures inside a 200 answer (`{errors, data: null}`), which the proxy passes on: those, like an HTTP error or no
 * `data`, are a failure here (the pages show the old error, "Error: Sefaria's CMS cannot be reached").
 *
 * @feature STA-009 Jobs page
 * @feature STA-010 Team page
 * @feature STA-011 Products page
 */

export const CMS_PROXY_PATH = "/api/strapi/graphql-cache";
/** The cache entry of the undated queries (team, products). */
export const UNDATED_RANGE = { start: "2000-01-01", end: "2000-01-02" } as const;
export const CMS_ERROR = "Error: Sefaria's CMS cannot be reached";

export class CmsError extends Error {}

/** One GraphQL query through Django's proxy; resolves to the answer's `data`. */
export async function fetchCms<T>(
  query: string,
  range: { start: string; end: string },
  apiOrigin: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${apiOrigin}${CMS_PROXY_PATH}?start_date=${range.start}&end_date=${range.end}`;
  // text/plain, as the proxy reads the query as the raw body (and a cross-origin "simple" request needs no preflight)
  const res = await fetcher(url, { method: "POST", headers: { "content-type": "text/plain" }, body: query, credentials: "omit", signal });
  if (!res.ok) throw new CmsError(`CMS proxy answered ${res.status}`);
  let body: { data?: T | null; errors?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new CmsError("CMS proxy answered something other than JSON");
  }
  if (!body || typeof body !== "object" || !body.data || body.errors) throw new CmsError(`CMS answered no data${body?.errors ? `: ${JSON.stringify(body.errors).slice(0, 300)}` : ""}`);
  return body.data;
}

export type Bilingual = { en: string; he: string };
export type InterfaceLocale = "en" | "he";

/** The Hebrew localization of a CMS document (the old pages took `localizations[0]`; it is the only one). */
function hebrew<L extends { locale?: string | null }>(localizations: L[] | null | undefined): Partial<L> {
  const list = localizations ?? [];
  return list.find((l) => l.locale === "he") ?? list[0] ?? {};
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

/* ---------------------------------------------------------------- team */

export const TEAM_QUERY = `
            query {
                teamMembers(pagination: { limit: -1 }) {
                    documentId
                    teamName
                    teamTitle
                    isTeamBoardMember
                    teamMemberImage {
                        url
                    }
                    localizations {
                        locale
                        teamName
                        teamTitle
                    }
                }
            }
            `;

interface RawTeamMember {
  documentId: string;
  teamName?: string | null;
  teamTitle?: string | null;
  isTeamBoardMember?: boolean | null;
  teamMemberImage?: { url?: string | null } | null;
  localizations?: { locale?: string | null; teamName?: string | null; teamTitle?: string | null }[] | null;
}

export interface TeamMember {
  id: string;
  name: Bilingual;
  title: Bilingual;
  image: string | null;
}

export interface Team {
  /** The staff, by last name in the interface language. */
  members: TeamMember[];
  /** The board: the chairman, the co-founders (in the CMS's order), then the others by last name. */
  board: TeamMember[];
}

/** The old byLastName: the last word of the name in the interface language (else the other one), compared in that locale. */
export function byLastName(locale: InterfaceLocale) {
  const last = (m: TeamMember) => (m.name[locale] || m.name.en || m.name.he).trim().split(/\s+/).pop() ?? "";
  return (a: TeamMember, b: TeamMember) => last(a).localeCompare(last(b), locale);
}

export function shapeTeam(data: { teamMembers?: RawTeamMember[] | null }, locale: InterfaceLocale): Team {
  const all = (data.teamMembers ?? []).map((t): TeamMember & { board: boolean } => {
    const he = hebrew(t.localizations);
    return {
      id: t.documentId,
      board: !!t.isTeamBoardMember,
      name: { en: str(t.teamName), he: str(he.teamName) },
      title: { en: str(t.teamTitle), he: str(he.teamTitle) },
      image: t.teamMemberImage?.url || null,
    };
  });
  const strip = ({ board: _b, ...m }: TeamMember & { board: boolean }): TeamMember => m;
  const sort = byLastName(locale);
  const members = all.filter((m) => !m.board).map(strip).sort(sort);
  const boardAll = all.filter((m) => m.board).map(strip);
  const role = (m: TeamMember) => m.title.en.trim().toLowerCase();
  const chairIndex = boardAll.findIndex((m) => role(m) === "chairman");
  const chairman = chairIndex === -1 ? [] : boardAll.splice(chairIndex, 1);
  const cofounders = boardAll.filter((m) => role(m) === "co-founder");
  const others = boardAll.filter((m) => role(m) !== "co-founder").sort(sort);
  return { members, board: [...chairman, ...cofounders, ...others] };
}

/* ------------------------------------------------------------ products */

const PRODUCT_FIELDS = `
              documentId
              title
              rank
              url
              type
              description
              rectanglion {
                url
                alternativeText
              }
              createdAt
              updatedAt
              locale
              call_to_actions {
                documentId
                text
                url
                icon {
                  url
                  alternativeText
                }
                locale
                localizations {
                  documentId
                  text
                }
              }
              localizations {
                locale
                title
                type
                description
              }
        `;

/** Everyone sees the published products; moderators also see the products that exist only as drafts (after them), as on the old page. */
export function productsQuery(moderator: boolean): string {
  const published = `published: products(pagination: { limit: -1 }, sort: "rank:asc", status: PUBLISHED) {
                    ${PRODUCT_FIELDS}
                }`;
  const drafts = `drafts: products(pagination: { limit: -1 }, sort: "rank:asc", status: DRAFT) {
                    ${PRODUCT_FIELDS}
                }`;
  return moderator ? `query {\n                ${published}\n                ${drafts}\n            }` : `query {\n                ${published}\n            }`;
}

interface RawProduct {
  documentId: string;
  title?: string | null;
  rank?: number | null;
  url?: string | null;
  type?: string | null;
  description?: string | null;
  rectanglion?: { url?: string | null; alternativeText?: string | null } | null;
  call_to_actions?: { documentId: string; text?: string | null; url?: string | null; icon?: { url?: string | null } | null; localizations?: { text?: string | null }[] | null }[] | null;
  localizations?: { locale?: string | null; title?: string | null; type?: string | null; description?: string | null }[] | null;
}

export interface ProductCta {
  id: string;
  text: Bilingual;
  url: string;
  icon: string | null;
}

export interface Product {
  id: string;
  rank: number | null;
  title: Bilingual;
  type: Bilingual;
  /** Markdown, from the CMS. */
  description: Bilingual;
  image: string | null;
  ctas: ProductCta[];
}

function shapeProduct(p: RawProduct): Product {
  const he = hebrew(p.localizations);
  return {
    id: p.documentId,
    rank: typeof p.rank === "number" ? p.rank : null,
    title: { en: str(p.title), he: str(he.title) },
    type: { en: str(p.type), he: str(he.type) },
    description: { en: str(p.description), he: str(he.description) },
    image: p.rectanglion?.url || null,
    ctas: (p.call_to_actions ?? []).map((c) => ({
      id: c.documentId,
      text: { en: str(c.text), he: str(c.localizations?.[0]?.text) },
      url: str(c.url),
      icon: c.icon?.url || null,
    })),
  };
}

/** The products in the CMS's rank order; for a moderator, then the drafts that were never published. */
export function shapeProducts(data: { published?: RawProduct[] | null; drafts?: RawProduct[] | null }): Product[] {
  const published = (data.published ?? []).map(shapeProduct);
  const ids = new Set(published.map((p) => p.id));
  const draftOnly = (data.drafts ?? []).filter((p) => !ids.has(p.documentId)).map(shapeProduct);
  return [...published, ...draftOnly];
}

/** Where the "Powered by Sefaria" box goes among the products (after the second). */
export const DEV_BOX_POSITION = 2;

/* ---------------------------------------------------------------- jobs */

/** The hour a jobs query asks about (open postings: started by then, not yet ended), so the proxy keeps one answer per hour. */
export function jobsMoment(now: Date): { iso: string; range: { start: string; end: string } } {
  const hour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const day = hour.toISOString().slice(0, 10);
  const next = new Date(hour.getTime() + 24 * 3600_000).toISOString().slice(0, 10);
  return { iso: hour.toISOString(), range: { start: day, end: next } };
}

export function jobsQuery(iso: string): string {
  return `
            query {
                jobPostings(
                    pagination: { limit: -1 }
                    filters: {
                        jobPostingStartDate: { lte: "${iso}" }
                        jobPostingEndDate: { gte: "${iso}" }
                    }
                ) {
                    documentId
                    jobLink
                    jobDescription
                    jobDepartmentCategory
                }
            }
        `;
}

export interface Job {
  id: string;
  link: string;
  description: string;
}

/** The open postings grouped by department ("HR_and_Operations" → "HR and Operations"), in the CMS's order. */
export function shapeJobs(data: { jobPostings?: { documentId: string; jobLink?: string | null; jobDescription?: string | null; jobDepartmentCategory?: string | null }[] | null }): [string, Job[]][] {
  const groups = new Map<string, Job[]>();
  for (const j of data.jobPostings ?? []) {
    const department = str(j.jobDepartmentCategory).split("_").join(" ");
    const list = groups.get(department) ?? [];
    list.push({ id: j.documentId, link: str(j.jobLink), description: str(j.jobDescription) });
    groups.set(department, list);
  }
  return [...groups];
}

import { describe, expect, it, vi } from "vitest";
import team from "../../../fixtures/api/_cms/team.json";
import products from "../../../fixtures/api/_cms/products.json";
import { CmsError, fetchCms, jobsMoment, jobsQuery, productsQuery, shapeJobs, shapeProducts, shapeTeam, TEAM_QUERY, UNDATED_RANGE } from "./cms";

const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

// @feature STA-009 @feature STA-010 @feature STA-011
describe("the CMS through Django's proxy", () => {
  it("posts the query as text/plain to /api/strapi/graphql-cache on the API origin, with the cache entry's dates", async () => {
    const f = answer({ data: { teamMembers: [] } });
    expect(await fetchCms(TEAM_QUERY, UNDATED_RANGE, "https://www.sefaria.org", f)).toEqual({ teamMembers: [] });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://www.sefaria.org/api/strapi/graphql-cache?start_date=2000-01-01&end_date=2000-01-02");
    expect(init).toMatchObject({ method: "POST", body: TEAM_QUERY, credentials: "omit", headers: { "content-type": "text/plain" } });
  });

  it("an HTTP error, GraphQL errors in a 200 (e.g. a CMS that forbids the query), no data or no JSON are failures", async () => {
    await expect(fetchCms("q", UNDATED_RANGE, "", answer({ error: "Internal server error" }, 500))).rejects.toBeInstanceOf(CmsError);
    await expect(fetchCms("q", UNDATED_RANGE, "", answer({ data: null, errors: [{ message: "Forbidden access" }] }))).rejects.toThrow(/Forbidden access/);
    await expect(fetchCms("q", UNDATED_RANGE, "", answer({}))).rejects.toBeInstanceOf(CmsError);
    const notJson = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchCms("q", UNDATED_RANGE, "", notJson)).rejects.toBeInstanceOf(CmsError);
  });
});

describe("the team, as the old TeamMembersPage ordered it", () => {
  const recorded = team.data;

  it("staff by last name in the interface language; the board apart: chairman, co-founders, then the rest by last name", () => {
    const en = shapeTeam(recorded, "en");
    expect(en.members.length + en.board.length).toBe(recorded.teamMembers.length);
    expect(en.board.length).toBe(recorded.teamMembers.filter((m) => m.isTeamBoardMember).length);
    const last = (s: string) => s.split(" ").pop()!;
    const names = en.members.map((m) => last(m.name.en));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(en.board[0]!.title.en).toBe("Chairman");
    expect(en.board.slice(1, 3).map((m) => m.title.en)).toEqual(["Co-Founder", "Co-Founder"]);
    const rest = en.board.slice(3).map((m) => last(m.name.en));
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "en")));
    // each with the Hebrew localization and the picture
    const someone = en.members[0]!;
    expect(someone.name.he).not.toBe("");
    expect(someone.image).toMatch(/^https:\/\//);
  });

  it("in Hebrew the staff are ordered by the Hebrew last name", () => {
    const he = shapeTeam(recorded, "he").members.map((m) => m.name.he.trim().split(" ").pop()!);
    expect(he).toEqual([...he].sort((a, b) => a.localeCompare(b, "he")));
  });

  it("a member with no Hebrew localization keeps the English (the old page failed the whole list)", () => {
    const t = shapeTeam({ teamMembers: [{ documentId: "x", teamName: "A B", teamTitle: "T", isTeamBoardMember: false, teamMemberImage: null, localizations: [] }] }, "he");
    expect(t.members[0]).toEqual({ id: "x", name: { en: "A B", he: "" }, title: { en: "T", he: "" }, image: null });
  });
});

describe("the products", () => {
  it("in rank order with both languages, call-to-action links and icons", () => {
    const list = shapeProducts(products.data);
    expect(list.map((p) => p.rank)).toEqual(products.data.published.map((p) => p.rank));
    expect(list[0]!.title.he).not.toBe("");
    expect(list[0]!.ctas[0]!.url).toMatch(/^https:\/\//);
    expect(list.flatMap((p) => p.ctas).some((c) => c.icon)).toBe(true);
  });

  it("moderators also get the never-published drafts, after the published ones; a draft of a published product is not shown twice", () => {
    expect(productsQuery(false)).not.toContain("drafts:");
    expect(productsQuery(true)).toContain("status: DRAFT");
    const p = (id: string) => ({ documentId: id, title: id, rank: 1, call_to_actions: [], localizations: [] });
    expect(shapeProducts({ published: [p("a")], drafts: [p("a"), p("b")] }).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("the jobs", () => {
  it("asks about the current hour (one cached answer per hour) and groups postings by department", () => {
    const m = jobsMoment(new Date("2026-11-11T19:42:10.123Z"));
    expect(m).toEqual({ iso: "2026-11-11T19:00:00.000Z", range: { start: "2026-11-11", end: "2026-11-12" } });
    expect(jobsQuery(m.iso)).toContain('jobPostingStartDate: { lte: "2026-11-11T19:00:00.000Z" }');
    const groups = shapeJobs({
      jobPostings: [
        { documentId: "1", jobLink: "https://x/1", jobDescription: "Engineer", jobDepartmentCategory: "Engineering" },
        { documentId: "2", jobLink: "https://x/2", jobDescription: "Ops", jobDepartmentCategory: "HR_and_Operations" },
        { documentId: "3", jobLink: "https://x/3", jobDescription: "Dev", jobDepartmentCategory: "Engineering" },
      ],
    });
    expect(groups.map(([d, jobs]) => [d, jobs.map((j) => j.id)])).toEqual([
      ["Engineering", ["1", "3"]],
      ["HR and Operations", ["2"]],
    ]);
    expect(shapeJobs({ jobPostings: [] })).toEqual([]);
  });
});

import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { server } from "../../../test/msw/server";
import { fetchFindings, findingsForRefs, findingsQueryOptions, findingsUrl, groupByMethod, otherRefs, parseFinding, parseFindings, type Finding } from "./findings";

const API = "https://chat.example.org/api";

const raw = (o: Record<string, unknown> = {}) => ({
  id: "f1",
  url: "https://chat.example.org/findings/f1",
  method: { slug: "example-method", title: { en: "Rabbi Ploni's Method", he: "שיטת רבי פלוני" } },
  skill: { name: "example-halachic-reading", title: "Example halachic reading" },
  title: "Short title",
  conclusion: "A paragraph explaining what was found.",
  label: "AI-assisted reading in the approach of Rabbi Ploni",
  anchorRefs: ["Genesis 1:1", "Genesis 1:2"],
  refs: [
    { ref: "Genesis 1:1-2", role: "anchor" },
    { ref: "Psalms 16:8", role: "support" },
  ],
  sheetUrl: "https://www.sefaria.org/sheets/1",
  created: "2026-11-25T12:00:00Z",
  ...o,
});
const finding = (o: Record<string, unknown> = {}) => parseFinding(raw(o))!;

// @feature CON-073
describe("findings: the request", () => {
  it("one URL per section, the ref encoded, whatever the base's trailing slash", () => {
    expect(findingsUrl("https://chat-dev.sefaria.org/api", "Genesis 1")).toBe("https://chat-dev.sefaria.org/api/findings/ref/Genesis%201");
    expect(findingsUrl("https://chat-dev.sefaria.org/api/", "Berakhot 2a")).toBe("https://chat-dev.sefaria.org/api/findings/ref/Berakhot%202a");
    expect(findingsUrl(API, "Rashi on Genesis 1:1")).toBe(`${API}/findings/ref/Rashi%20on%20Genesis%201%3A1`);
  });

  it("reads the answer's findings", async () => {
    server.use(http.get(`${API}/findings/ref/:ref`, ({ params }) => HttpResponse.json({ ref: params.ref, findings: [raw()] })));
    const list = await makeQueryClient().fetchQuery(findingsQueryOptions("Genesis 1", API));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "f1", title: "Short title", anchorRefs: ["Genesis 1:1", "Genesis 1:2"] });
  });

  it("a non-200 or a timeout throws (the sidebar then shows none), and is not retried", async () => {
    let calls = 0;
    server.use(http.get(`${API}/findings/ref/:ref`, () => (calls++, new HttpResponse(null, { status: 503 }))));
    await expect(makeQueryClient().fetchQuery(findingsQueryOptions("Genesis 1", API))).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(1);
    server.use(http.get(`${API}/findings/ref/:ref`, () => new Promise<Response>(() => {})));
    await expect(fetchFindings("Genesis 1", { apiBaseUrl: API, timeoutMs: 20 })).rejects.toThrow();
  });
});

// @feature CON-073 @feature CON-074
describe("findings: the answer is checked before it is shown", () => {
  it("drops entries missing what the sidebar shows; a non-list answer is none", () => {
    expect(parseFindings({ findings: [raw(), raw({ title: "" }), raw({ label: undefined }), raw({ method: null }), raw({ anchorRefs: "Genesis 1:1" }), null, "x"] })).toHaveLength(1);
    expect(parseFindings({ findings: "nope" })).toEqual([]);
    expect(parseFindings(null)).toEqual([]);
  });

  it("keeps only http(s) links and known roles", () => {
    const f = finding({ url: "javascript:alert(1)", sheetUrl: "not a url", refs: [{ ref: "Psalms 16:8", role: "support" }, { ref: "Exodus 1:1", role: "other" }, { role: "anchor" }] });
    expect(f.url).toBeNull();
    expect(f.sheetUrl).toBeNull();
    expect(f.refs).toEqual([{ ref: "Psalms 16:8", role: "support" }]);
  });

  it("a method with only one title uses it for both languages", () => {
    expect(finding({ method: { slug: "m", title: { en: "Method" } } }).method.title).toEqual({ en: "Method", he: "Method" });
  });
});

// @feature CON-073
describe("findings: the selection and the grouping", () => {
  it("picks the findings anchored to a selected segment, once each", () => {
    const all = [finding({ id: "a", anchorRefs: ["Genesis 1:1", "Genesis 1:2"] }), finding({ id: "b", anchorRefs: ["Genesis 1:3"] })];
    expect(findingsForRefs(all, ["Genesis 1:2"]).map((f) => f.id)).toEqual(["a"]);
    expect(findingsForRefs(all, ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"]).map((f) => f.id)).toEqual(["a", "b"]);
    expect(findingsForRefs(all, ["Genesis 1:4"])).toEqual([]);
    expect(findingsForRefs(undefined, ["Genesis 1:1"])).toEqual([]);
  });

  // @feature CON-074
  it("the other passages cited: not the anchor, not a selected segment, each once", () => {
    const f = finding({ refs: [{ ref: "Genesis 1:1-2", role: "anchor" }, { ref: "Genesis 1:3", role: "position" }, { ref: "Psalms 16:8", role: "support" }, { ref: "Psalms 16:8", role: "support" }] });
    expect(otherRefs(f, ["Genesis 1:1"])).toEqual(["Genesis 1:3", "Psalms 16:8"]);
    expect(otherRefs(f, ["Genesis 1:3"])).toEqual(["Psalms 16:8"]);
  });

  it("methods by number of findings, then by title; the newest finding first in each", () => {
    const m = (slug: string, en: string, he: string) => ({ slug, title: { en, he } });
    const list: Finding[] = [
      finding({ id: "z1", method: m("z", "Zeta", "א"), created: "2026-01-01T00:00:00Z" }),
      finding({ id: "b1", method: m("b", "Beta", "ב"), created: "2026-01-01T00:00:00Z" }),
      finding({ id: "a1", method: m("a", "Alpha", "ג"), created: "2026-01-01T00:00:00Z" }),
      finding({ id: "z2", method: m("z", "Zeta", "א"), created: "2026-03-01T00:00:00Z" }),
    ];
    const groups = groupByMethod(list);
    expect(groups.map((g) => g.method.slug)).toEqual(["z", "a", "b"]);
    expect(groups[0]!.findings.map((f) => f.id)).toEqual(["z2", "z1"]);
    expect(groupByMethod(list, "hebrew").map((g) => g.method.slug)).toEqual(["z", "b", "a"]);
  });
});

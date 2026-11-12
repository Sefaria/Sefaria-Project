import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { http, HttpResponse } from "msw";
import { readFixture } from "../../../test/msw/fixtures";
import { server } from "../../../test/msw/server";
import { resetPersisters } from "~/lib/cache/persisters";
import { makeQueryClient } from "~/lib/cache/query-client";
import { NO_PREFS } from "~/lib/versions/preferences";
import { loadWorkspaceRoute, shownVersions, versionRedirectTarget } from "./reader-route";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersisters();
});

const load = (search: Record<string, string>, prefs = NO_PREFS) => loadWorkspaceRoute({ queryClient: makeQueryClient(), splat: "Genesis.1", search, prefs });
const titleOf = (data: Awaited<ReturnType<typeof load>>) => data.panels.p1!.versions;

// @feature VER-014 @feature VER-002 @feature TXD-006
describe("which translation the loader shows (verified on sefaria.org)", () => {
  it("no preferences: the default; versions stay as the URL says", async () => {
    expect(titleOf(await load({}))).toEqual({ primary: undefined, translation: undefined });
  });

  it("a corpus preference becomes the panel's translation when the URL names none", async () => {
    const data = await load({}, { byCorpus: { Tanakh: { en: "The Koren Jerusalem Bible" } } });
    expect(data.panels.p1!.versions.translation).toBe("english|The Koren Jerusalem Bible");
    expect(data.panels.p1!.preload.every((u) => u.includes("Koren"))).toBe(true); // neighbours preloaded in it too
  });

  it("an explicit translation in the URL beats the preference", async () => {
    const data = await load({ ven: "english|The_Koren_Jerusalem_Bible" }, { byCorpus: { Tanakh: { en: "The Contemporary Torah, Jewish Publication Society, 2006" } } });
    expect(data.panels.p1!.versions.translation).toBe("english|The Koren Jerusalem Bible");
  });

  it("a preference for a version the text lacks changes nothing", async () => {
    const data = await load({}, { byCorpus: { Tanakh: { en: "No Such Version" } } });
    expect(data.panels.p1!.versions.translation).toBeUndefined();
  });

  it("a preference for another corpus changes nothing", async () => {
    const data = await load({}, { byCorpus: { Bavli: { en: "The Koren Jerusalem Bible" } } });
    expect(data.panels.p1!.versions.translation).toBeUndefined();
  });
});

// The API answers a version this text lacks by leaving it out (warning 101), as it does for Ibn Ezra asked for the JPS Tanakh. `extra`
// versions are added to the text's list (titles that do not survive the address: `_`, a non-breaking space).
const ODD_TITLES = ["Title_With_Underscore", "Title\u00a0NBSP", "Semi;colon & hash#"];
function serveMissingVersions() {
  server.use(
    http.get("https://www.sefaria.org/api/v3/texts/:tref", ({ request }) => {
      const asked = new URL(request.url).searchParams.getAll("version");
      if (!asked.some((x) => /No Such|Nope|Title|Semi/.test(x))) return undefined; // the recorded fixtures answer the rest
      const body = readFixture<{ versions: { languageFamilyName: string; versionTitle: string }[]; available_versions: Record<string, unknown>[] }>("genesis-1/v3-texts.json");
      const english = body.available_versions.find((v) => v.languageFamilyName === "english")!;
      return HttpResponse.json({
        ...body,
        available_versions: [...body.available_versions, ...ODD_TITLES.map((versionTitle) => ({ ...english, versionTitle, priority: "" }))],
        versions: body.versions.filter((v) => asked.includes(`${v.languageFamilyName}|${v.versionTitle}`) || asked.includes(v.languageFamilyName === "hebrew" ? "primary" : "translation")),
      });
    }),
  );
}
const redirectOf = async (search: Record<string, string>, prefs = NO_PREFS) => {
  const thrown: unknown = await load(search, prefs).then(() => null, (e: unknown) => e);
  return (thrown as { options?: { search?: Record<string, unknown>; statusCode?: number } } | null)?.options ?? null;
};

// @feature VER-014 The address is rewritten to the version shown, as sefaria.org's server does before rendering
describe("a version the address names that this text lacks", () => {
  it("a missing translation: redirect (302) to the first translation in its language, keeping the rest of the query", async () => {
    serveMissingVersions();
    const r = await redirectOf({ ven: "english|No_Such_Version", lang: "bi" });
    expect(r?.statusCode).toBe(302);
    expect(r?.search).toEqual({ ven: "english|THE_JPS_TANAKH:_Gender-Sensitive_Edition", lang: "bi" });
  });
  it("a language this text has no translation in: the parameter is dropped, so the preferences decide on the next load", async () => {
    serveMissingVersions();
    expect((await redirectOf({ ven: "klingon|No_Such_Version", lang: "en" }))?.search).toEqual({ lang: "en" });
    const next = await load({ lang: "en" }, { byCorpus: { Tanakh: { en: "The Koren Jerusalem Bible" } } });
    expect(next.panels.p1!.versions.translation).toBe("english|The Koren Jerusalem Bible");
  });
  it("a missing primary: the first source version in its language", async () => {
    serveMissingVersions();
    expect((await redirectOf({ vhe: "hebrew|No_Such_Version" }))?.search).toEqual({ vhe: "hebrew|Miqra_according_to_the_Masorah" });
  });
  it("a second panel's versions are rewritten under its own number", async () => {
    serveMissingVersions();
    const r = await redirectOf({ p3: "Genesis.1", ven3: "english|Nope", ven: "english|The_Koren_Jerusalem_Bible" });
    expect(r?.search).toEqual({ p3: "Genesis.1", ven3: "english|THE_JPS_TANAKH:_Gender-Sensitive_Edition", ven: "english|The_Koren_Jerusalem_Bible" });
  });
  it("an old link naming only the title, or no language, redirects to the version with that title", async () => {
    serveMissingVersions();
    expect((await redirectOf({ ven: "The_Koren_Jerusalem_Bible" }))?.search).toEqual({ ven: "english|The_Koren_Jerusalem_Bible" });
    expect((await redirectOf({ ven: "|The_Koren_Jerusalem_Bible" }))?.search).toEqual({ ven: "english|The_Koren_Jerusalem_Bible" });
  });
  it("a title with `_`, a non-breaking space or an escaped character loads from its own address: no redirect to itself", async () => {
    serveMissingVersions();
    expect(await redirectOf({ ven: "english|Title_With_Underscore" })).toBeNull();
    expect(await redirectOf({ ven: "english|Title_NBSP" })).toBeNull();
    // and loads the version by its real title, which the address's `_` hides
    expect((await load({ ven: "english|Title_With_Underscore" })).panels.p1!.versions.translation).toBe("english|Title_With_Underscore");
    expect((await load({ ven: "english|Title_NBSP" })).panels.p1!.versions.translation).toBe("english|Title\u00a0NBSP");
    expect(await redirectOf({ ven: "english|Semi;colon_&_hash#" })).toBeNull(); // the parsed query has decoded %3B, %26, %23
  });
  it("the address a redirect leads to does not redirect again", async () => {
    serveMissingVersions();
    for (const ven of ["english|No_Such_Version", "klingon|No_Such_Version", "The_Koren_Jerusalem_Bible"]) {
      const first = await redirectOf({ ven, lang: "bi" });
      expect(first, ven).not.toBeNull();
      expect(await redirectOf(first!.search as Record<string, string>)).toBeNull();
    }
  });
  it("versions the text has load without a redirect", async () => {
    expect(await redirectOf({ ven: "english|The_Koren_Jerusalem_Bible" })).toBeNull();
  });
});

describe("versionRedirectTarget", () => {
  it("rewrites each panel's parameters under its own number and keeps the rest", () => {
    expect(versionRedirectTarget({ ven: "english|X", lang: "bi", p2: "Exodus.1", vhe2: "hebrew|Y" }, [
      { suffix: "", rewrite: { ven: "english|THE_JPS" } },
      { suffix: "2", rewrite: { vhe: null } },
    ])).toEqual({ ven: "english|THE_JPS", lang: "bi", p2: "Exodus.1" });
  });
  it("never answers the address asked for: a rewrite that names the same versions is no redirect", () => {
    expect(versionRedirectTarget({ ven: "english|A_B" }, [{ suffix: "", rewrite: { ven: "english|A_B" } }])).toBeNull();
    expect(versionRedirectTarget({ ven: "english|Semi;colon" }, [{ suffix: "", rewrite: { ven: "english|Semi%3Bcolon" } }])).toBeNull();
    expect(versionRedirectTarget({ lang: "bi" }, [{ suffix: "", rewrite: { ven: null } }])).toBeNull();
  });
});

// Regression: a URL naming only the source version kept the saved translation on the server, then dropped it after hydration
describe("shownVersions", () => {
  const SRC = "hebrew|Miqra according to the Masorah";
  const KOREN = "english|The Koren Jerusalem Bible";
  const loaded = { requested: { primary: SRC }, versions: { primary: SRC, translation: KOREN } };
  it("while the URL names what was loaded, the loader's resolution (with the saved translation) is shown", () => {
    expect(shownVersions({ primary: SRC }, loaded)).toEqual({ primary: SRC, translation: KOREN });
  });
  it("a URL that names nothing shows what the loader resolved", () => {
    expect(shownVersions({}, { requested: {}, versions: { translation: KOREN } })).toEqual({ translation: KOREN });
  });
  it("a newer choice in the URL wins until the loader catches up", () => {
    const chosen = { primary: SRC, translation: "english|The Contemporary Torah" };
    expect(shownVersions(chosen, loaded)).toEqual(chosen);
  });
});

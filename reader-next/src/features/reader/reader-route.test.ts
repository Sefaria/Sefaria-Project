import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetPersisters } from "~/lib/cache/persisters";
import { makeQueryClient } from "~/lib/cache/query-client";
import { NO_PREFS } from "~/lib/versions/preferences";
import { loadWorkspaceRoute, shownVersions } from "./reader-route";

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
    const data = await load({ ven: "english|The Koren Jerusalem Bible" }, { byCorpus: { Tanakh: { en: "The Contemporary Torah, Jewish Publication Society, 2006" } } });
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

// CODE_REVIEW R-07: a URL naming only the source version kept the saved translation on the server, then dropped it after hydration
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

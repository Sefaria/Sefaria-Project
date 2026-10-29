import { afterEach, describe, expect, it, vi } from "vitest";
import { containsEnglish, entryRef, fetchLexiconCompletion } from "./completion";

// @feature SRC-021 @feature SRC-022
describe("dictionary completion", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("asks /api/words/completion/<word>[/<lexicon>] and returns [headword, form] pairs", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify([["אור", "אוֹר"]])); }));
    expect(await fetchLexiconCompletion("אור")).toEqual([["אור", "אוֹר"]]);
    await fetchLexiconCompletion("אור", "Jastrow Dictionary");
    expect(urls[0]).toMatch(/\/api\/words\/completion\/%D7%90%D7%95%D7%A8$/);
    expect(urls[1]).toMatch(/\/api\/words\/completion\/%D7%90%D7%95%D7%A8\/Jastrow%20Dictionary$/);
  });
  it("Latin letters make an entry invalid; Hebrew does not", () => {
    expect(containsEnglish("light")).toBe(true);
    expect(containsEnglish("אור")).toBe(false);
  });
  it("an entry's ref is 'Title, word'", () => {
    expect(entryRef("Jastrow", "אוֹר")).toBe("Jastrow, אוֹר");
  });
});

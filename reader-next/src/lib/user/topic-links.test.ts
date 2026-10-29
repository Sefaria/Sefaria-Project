// @feature CON-047
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resourcesQueryOptions, type SectionResources } from "~/lib/connections/related";
import { addLinkToResources, addRefTopicLink, CREATE_NEW_TOPIC, selectionRange, topicSuggestions } from "./topic-links";

describe("suggestions (the old TopicSearch.getSuggestions)", () => {
  it("keeps the first four topics, then offers to create one named after what was typed", () => {
    const d = { completion_objects: ["Grass", "Grasshopper", "Grass Offering", "Grasping", "Grassland"].map((t, i) => ({ title: t, key: `k${i}`, type: "Topic" })) };
    expect(topicSuggestions(d, " gras ", CREATE_NEW_TOPIC.en)).toEqual([
      { name: "Grass", key: "k0" }, { name: "Grasshopper", key: "k1" }, { name: "Grass Offering", key: "k2" }, { name: "Grasping", key: "k3" },
      { name: "Create a new topic: gras", key: "" },
    ]);
  });
});

describe("selectionRange (the old normRef(srefs))", () => {
  it("is the verse itself, or a range over several verses, or the section", () => {
    expect(selectionRange(["Genesis 1:11"], "Genesis 1")).toBe("Genesis 1:11");
    expect(selectionRange(["Genesis 1:11", "Genesis 1:12", "Genesis 1:13"], "Genesis 1")).toBe("Genesis 1:11-13");
    expect(selectionRange([], "Genesis 1")).toBe("Genesis 1");
  });
  it("crosses a chapter, parts after a whole number, and keeps a complex text's colon-less refs", () => {
    expect(selectionRange(["Genesis 1:31", "Genesis 2:1"], "Genesis 1")).toBe("Genesis 1:31-2:1");
    expect(selectionRange(["Genesis 1:3", "Genesis 1:35"], "Genesis 1")).toBe("Genesis 1:3-35");
    expect(selectionRange(["Berakhot 2a:3", "Berakhot 2b:1"], "Berakhot 2a")).toBe("Berakhot 2a:3-2b:1");
    expect(selectionRange(["Pesach Haggadah, Kadesh 2", "Pesach Haggadah, Kadesh 4"], "Pesach Haggadah, Kadesh")).toBe("Pesach Haggadah, Kadesh 2-4");
  });
});

describe("addRefTopicLink (POST /api/ref-topic-links/<ref>)", () => {
  let calls: { url: string; init: RequestInit }[];
  beforeEach(() => {
    calls = [];
    document.cookie = "csrftoken=tok123; path=/";
  });
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: unknown, status = 200) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(JSON.stringify(body), { status }))));

  it("posts the slug and interface language as JSON with the CSRF token, and returns the new link", async () => {
    answer({ topic: "grass", anchorRef: "Genesis 1:11", anchorRefExpanded: ["Genesis 1:11"], title: { en: "Grass", he: "עשב" } });
    const link = await addRefTopicLink("Genesis 1:11", "grass", "english");
    expect(link.topic).toBe("grass");
    expect(calls[0]!.url).toMatch(/\/api\/ref-topic-links\/Genesis\.1\.11$/);
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ topic: "grass", interface_lang: "english" });
    expect((calls[0]!.init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok123");
  });
  it("throws with the server's message (a non-moderator gets {error})", async () => {
    answer({ error: "Only moderators can connect edit topic sources." });
    await expect(addRefTopicLink("Genesis 1:11", "grass", "english")).rejects.toThrow("Only moderators can connect edit topic sources.");
  });
});

describe("addLinkToResources", () => {
  it("files the new link under each verse it covers, once", () => {
    const qc = new QueryClient();
    const key = resourcesQueryOptions("Genesis 1").queryKey;
    const empty = { sheets: {}, manuscripts: {}, media: {}, guides: {} };
    qc.setQueryData(key, { ...empty, topics: { "Genesis 1:11": [{ topic: "creation", anchorRef: "Genesis 1:11" }] } } as SectionResources);
    const link = { topic: "grass", anchorRef: "Genesis 1:11-12", anchorRefExpanded: ["Genesis 1:11", "Genesis 1:12"] };
    addLinkToResources(qc, "Genesis 1", link);
    addLinkToResources(qc, "Genesis 1", link);
    const topics = qc.getQueryData<SectionResources>(key)!.topics;
    expect(topics["Genesis 1:11"]!.map((t) => t.topic)).toEqual(["creation", "grass"]);
    expect(topics["Genesis 1:12"]!.map((t) => t.topic)).toEqual(["grass"]);
  });
});

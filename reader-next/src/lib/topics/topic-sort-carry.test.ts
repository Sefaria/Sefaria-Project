import { describe, expect, it } from "vitest";
import { carriedTopicSort, carryTopicSort, forgetTopicSortOff, isSingleTopicPath } from "./topic-sort-carry";

// @feature TOP-001
describe("the topic sort carried from topic to topic (the old panel's topicSort)", () => {
  it("is a single topic's page only for /topics/<slug> and /topics/b/<slug>", () => {
    for (const p of ["/topics/moses", "/topics/b/moses"]) expect(isSingleTopicPath(p), p).toBe(true);
    for (const p of ["/topics", "/topics/", "/topics/all", "/topics/category", "/topics/all/a", "/topics/category/prayer", "/Genesis.1"]) expect(isSingleTopicPath(p), p).toBe(false);
  });
  it("survives topic and category pages, and is forgotten on the landing and anywhere else", () => {
    carryTopicSort("Chronological");
    forgetTopicSortOff("/topics/leadership");
    forgetTopicSortOff("/topics/category/biblical-figures");
    expect(carriedTopicSort()).toBe("Chronological");
    forgetTopicSortOff("/topics");
    expect(carriedTopicSort()).toBeUndefined();
    carryTopicSort("Relevance");
    forgetTopicSortOff("/Genesis.1");
    expect(carriedTopicSort()).toBeUndefined();
  });
});

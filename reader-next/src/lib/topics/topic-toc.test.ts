// @feature SRC-070
import { describe, expect, it } from "vitest";
import { topicParents, type TopicTocNode } from "./topic-toc";

const toc: TopicTocNode[] = [
  { slug: "nature", primaryTitle: { en: "Nature", he: "טבע" }, children: [
    { slug: "light", primaryTitle: { en: "Light", he: "אור" } },
    { slug: "animals", primaryTitle: { en: "Animals", he: "בעלי חיים" }, children: [{ slug: "lion", primaryTitle: { en: "Lion", he: "אריה" } }] },
  ] },
  { slug: "lighting", primaryTitle: { en: "Lighting", he: "הדלקה" } },
];

describe("topicParents (the old displayTopicTocCategory)", () => {
  it("gives each topic the category directly above it", () => {
    const p = topicParents(toc);
    expect(p.light).toEqual({ slug: "nature", en: "Nature", he: "טבע" });
    expect(p.lion).toEqual({ slug: "animals", en: "Animals", he: "בעלי חיים" });
  });
  it("top-level categories and unknown topics have none", () => {
    const p = topicParents(toc);
    expect(p.nature).toBeUndefined();
    expect(p.lighting).toBeUndefined();
    expect(p["no-such"]).toBeUndefined();
  });
});

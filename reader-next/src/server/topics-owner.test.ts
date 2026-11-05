import { describe, expect, it } from "vitest";
import { topicsOwnerFrom } from "./topics-owner";

const owner = (path: string, search = "") => topicsOwnerFrom(path, new URLSearchParams(search));

// @feature TOP-036
describe("topicsOwnerFrom: the /topics pages Django still renders", () => {
  it("hands Django only the moderators' editors", () => {
    expect(owner("/topics/moses", "editor=1&tab=sources")).toBe("django");
    expect(owner("/topics/b/moses", "editor=1")).toBe("django");
    expect(owner("/topics/moses", "editor=0")).toBe("unknown");
  });
  it("keeps every other topic page in this client: outside the A–Z list, categories, a topic as a category", () => {
    for (const p of ["/topics/aarons-staff", "/topics/rabbenu-tam", "/topics/category/moses", "/topics/category/holidays", "/topics", "/topics/all/a"]) expect(owner(p), p).toBe("unknown");
    expect(owner("/topics/all/a", "editor=1")).toBe("unknown");
  });
});

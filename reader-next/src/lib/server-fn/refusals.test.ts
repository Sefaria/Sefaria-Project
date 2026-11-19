import { describe, expect, it, vi } from "vitest";

// every server function, stubbed: a call reaching one is recorded
const called = vi.fn();
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const chain = { validator: () => chain, handler: () => (args: unknown) => (called(args), Promise.resolve("server")) };
  return { ...(await importOriginal<object>()), createServerFn: () => chain };
});
const setResponseStatus = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: (code: number) => setResponseStatus(code), getRequestHeader: () => "" }));

const { refuse, segment } = await import("./input");
const { topicPageQueryOptions } = await import("~/lib/topics/topic-page-source");
const { azSliceQueryOptions, topicTocPageQueryOptions } = await import("~/lib/topics/toc-source");

const run = <T,>(o: { queryFn?: unknown }) => (o.queryFn as () => Promise<T>)();

describe("refused input", () => {
  it("sets the server function's answer to 400 (Start answers a thrown error with 500 otherwise)", () => {
    setResponseStatus.mockClear();
    expect(() => segment("..", "slug")).toThrow("slug");
    expect(setResponseStatus).toHaveBeenCalledWith(400);
    expect(refuse("x").name).toBe("ServerInputError");
  });
  it("a slug the server function would refuse never reaches it: the topic page is missing, the TOC page null, the A-Z slice empty", async () => {
    called.mockClear();
    await expect(run(topicPageQueryOptions("..", "en"))).resolves.toEqual({ kind: "missing" });
    await expect(run(topicPageQueryOptions("a/b", "en"))).resolves.toEqual({ kind: "missing" });
    await expect(run(topicTocPageQueryOptions(".."))).resolves.toBeNull();
    await expect(run(azSliceQueryOptions("x".repeat(21), "en"))).resolves.toEqual([]);
    expect(called).not.toHaveBeenCalled();
    await expect(run(topicPageQueryOptions("moses", "en"))).resolves.toBe("server");
    await expect(run(topicTocPageQueryOptions(""))).resolves.toBe("server");
    expect(called).toHaveBeenCalledTimes(2);
  });
});

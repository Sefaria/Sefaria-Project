import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewerQuery } from "~/features/auth/viewer";
import { savedItemsQuery } from "~/lib/user/history";
import { ItemSave } from "./UserHistoryRoute";

let posts: { ref: string; action?: string; versions?: unknown }[];
beforeEach(() => {
  posts = [];
  document.cookie = "csrftoken=tok; path=/";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const items = JSON.parse(new URLSearchParams(String(init.body)).get("user_history")!);
      posts.push(...items);
      return new Response(JSON.stringify({ created: items.map((i: { ref: string; action?: string }) => ({ ref: i.ref, versions: {}, saved: i.action === "add_saved" })) }), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const withSaved = (saved: unknown[]) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(viewerQuery.queryKey, { id: 7, name: "Reader" } as never);
  qc.setQueryData(savedItemsQuery(7).queryKey, saved as never);
  return qc;
};

// @feature USL-008 Per-item save button on /saved and /history (the old SaveLine's SaveButton, T-G04)
describe("each item's bookmark on Saved and History", () => {
  it("a saved text shows filled; a click removes it with its versions; another click saves it again", async () => {
    const versions = { en: { versionTitle: "The Contemporary Torah, Jewish Publication Society, 2006", languageFamilyName: "english" }, he: null };
    const qc = withSaved([{ ref: "Genesis 1:3", versions, saved: true }]);
    render(
      <QueryClientProvider client={qc}>
        <ItemSave item={{ ref: "Genesis 1:3", book: "Genesis", versions }} label="Genesis 1:3" />
      </QueryClientProvider>,
    );
    const button = screen.getByRole("button", { name: 'Remove "Genesis 1:3"' });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: 'Save "Genesis 1:3"' })).toHaveAttribute("aria-pressed", "false"));
    expect(posts[0]).toMatchObject({ ref: "Genesis 1:3", action: "delete_saved", versions });
    await userEvent.click(screen.getByRole("button", { name: 'Save "Genesis 1:3"' }));
    await waitFor(() => expect(posts.at(-1)).toMatchObject({ ref: "Genesis 1:3", action: "add_saved" }));
  });

  it("a sheet is saved by its 'Sheet N' ref and named by its title", async () => {
    const qc = withSaved([{ ref: "Sheet 123", versions: { en: null, he: null }, saved: true }]);
    render(
      <QueryClientProvider client={qc}>
        <ItemSave item={{ ref: "Sheet 123", is_sheet: true, sheet_id: 123, title: "My sheet" }} label="My sheet" />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: 'Remove "My sheet"' }));
    await waitFor(() => expect(posts[0]).toMatchObject({ ref: "Sheet 123", action: "delete_saved" }));
  });
});

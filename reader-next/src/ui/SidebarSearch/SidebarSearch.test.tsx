import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SidebarSearch } from "./SidebarSearch";
import { HEBREW_OR, LIGHT, hrefFor } from "./story-data";

const base = { query: "light", results: LIGHT, hrefFor, onSearch: () => {}, onOpen: () => {} };

// @feature SRC-094 @feature SRC-096
describe("SidebarSearch", () => {
  it("lists each match: ref, matched words in bold, the version", () => {
    render(<SidebarSearch {...base} />);
    const first = screen.getAllByRole("article")[0]!;
    expect(within(first).getByRole("link", { name: "Genesis 1:3" })).toHaveAttribute("href", "/Genesis_1.3");
    expect(first.querySelectorAll("b").length).toBeGreaterThan(1);
    expect(first).toHaveTextContent("light");
  });

  it("'N more versions' opens the other versions, each a result of its own", async () => {
    render(<SidebarSearch {...base} />);
    const first = screen.getAllByRole("article")[0]!;
    const more = within(first).getByRole("button", { name: /\d+ more versions?/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(first).getAllByRole("link", { name: "Genesis 1:3" }).length).toBeGreaterThan(1);
  });

  it("a click opens in place, a modified click is left to the browser", () => {
    const onOpen = vi.fn();
    render(<SidebarSearch {...base} onOpen={onOpen} />);
    const link = screen.getAllByRole("link", { name: "Genesis 1:3" })[0]!;
    fireEvent.click(link, { metaKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0]![0]._source.ref).toBe("Genesis 1:3");
  });

  // @feature SRC-094 @feature SRC-017
  it("the Hebrew keyboard types into the box in the English interface", async () => {
    render(<SidebarSearch {...base} query="" onSearch={vi.fn()} />);
    const box = screen.getByRole("searchbox", { name: "Search in this text" });
    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Hebrew keyboard" }));
    await userEvent.click(screen.getByRole("button", { name: "א" }));
    expect(box).toHaveValue("א");
  });

  it("searches only when the words changed; Enter submits; the box takes 75 characters", async () => {
    const onSearch = vi.fn();
    render(<SidebarSearch {...base} onSearch={onSearch} />);
    const box = screen.getByRole("searchbox", { name: "Search in this text" });
    expect(box).toHaveValue("light");
    expect(box).toHaveAttribute("maxlength", "75");
    await userEvent.type(box, "{Enter}");
    expect(onSearch).not.toHaveBeenCalled();
    await userEvent.clear(box);
    await userEvent.type(box, "darkness{Enter}");
    expect(onSearch).toHaveBeenCalledWith("darkness");
    await userEvent.clear(box);
    await userEvent.type(box, "salt");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenLastCalledWith("salt");
  });

  it("says so with no matches, while searching, and while loading more", () => {
    const { rerender } = render(<SidebarSearch {...base} results={[]} />);
    expect(screen.getByText("0 results.")).toBeInTheDocument();
    rerender(<SidebarSearch {...base} results={undefined} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Searching...");
    rerender(<SidebarSearch {...base} hasMore loadingMore />);
    expect(screen.getByText("Loading more results...")).toBeInTheDocument();
  });

  it("shows nothing but the box with no query", () => {
    render(<SidebarSearch {...base} query="" results={undefined} />);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("Hebrew results: Hebrew snippets, and in a Hebrew interface Hebrew refs and counts", () => {
    render(<InterfaceLangProvider lang="hebrew"><SidebarSearch {...base} query="אור" results={HEBREW_OR} /></InterfaceLangProvider>);
    expect(screen.getByRole("searchbox", { name: "חפש בטקסט" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveTextContent(/^בראשית/);
    expect(document.querySelector('[lang="he"][dir="rtl"] b')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /גרסאות נוספות|גרסה נוספת/ }).length).toBeGreaterThan(0);
  });

  it("an error is reported, not shown as no results", () => {
    render(<SidebarSearch {...base} results={undefined} error />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

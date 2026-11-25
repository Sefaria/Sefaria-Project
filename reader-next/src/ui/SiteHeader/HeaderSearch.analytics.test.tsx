import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsLog } from "~/lib/analytics";
import { HeaderSearch } from "./HeaderSearch";
import { STUB_SEARCH } from "./story-data";

const setup = () => {
  render(<><HeaderSearch {...STUB_SEARCH} onChoose={vi.fn()} onSearch={vi.fn()} onSmartSubmit={vi.fn()} /><button>elsewhere</button></>);
  return screen.getByRole("combobox");
};
const events = () => analyticsLog.map((e) => [e.channel, e.name, e.params]);

// @feature SRC-107 @feature ANL-007 @feature SRC-108
describe("HeaderSearch analytics (HeaderAutocomplete.jsx)", () => {
  beforeEach(() => {
    analyticsLog.length = 0;
  });
  it("focus, then defocus with the text typed", async () => {
    const box = setup();
    await userEvent.type(box, "ge");
    await userEvent.click(screen.getByText("elsewhere"));
    expect(events()).toEqual([
      ["gtag", "search_focus", { project: "Global Search" }],
      ["gtag", "search_defocus", { project: "Global Search", text: "ge" }],
    ]);
  });
  it("Enter on a suggestion: Nav To by Keyboard with link type, and the old Track event", async () => {
    const box = setup();
    await userEvent.type(box, "gen");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(events()).toContainEqual(["gtag", "search_navto", { project: "Global Search", feature_name: "Nav To by Keyboard", link_type: "Books", text: "gen", to: "Genesis" }]);
    expect(events().some(([c, n]) => c === "ua" && n === "Search|Search Box Navigation - ref")).toBe(true);
  });
  it("clicking the Search-for row is a full-text search", async () => {
    const box = setup();
    await userEvent.type(box, "gen");
    const list = await screen.findByRole("listbox");
    await userEvent.click(within(list).getAllByRole("option")[0]!);
    expect(events()).toContainEqual(["gtag", "search_submit", { project: "Global Search", feature_name: "Search Results", text: "gen" }]);
    expect(events()).toContainEqual(["ua", "Search|Search Box Search", { label: "gen" }]);
  });
});

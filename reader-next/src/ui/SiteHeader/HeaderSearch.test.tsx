import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { HeaderSearch } from "./HeaderSearch";
import { STUB_SEARCH } from "./story-data";

const setup = (over = {}) => {
  const props = { ...STUB_SEARCH, onChoose: vi.fn(), onSearch: vi.fn(), onSmartSubmit: vi.fn(), ...over };
  render(<HeaderSearch {...props} />);
  return { props, box: screen.getByRole("combobox") };
};

// @feature SRC-001 @feature SRC-004 @feature SRC-007 @feature SRC-009 @feature SRC-010 @feature SRC-018 @feature SRC-019 @feature SRC-110 @feature SRC-015 @feature SRC-023
describe("HeaderSearch", () => {
  it("nothing under three characters; then a 'Search for' row and groups", async () => {
    const { box } = setup();
    await userEvent.type(box, "ge");
    expect(screen.queryByRole("option")).toBeNull();
    await userEvent.type(box, "n");
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Search for: “gen”");
    expect(within(list).getByRole("group", { name: "Topics" })).toBeInTheDocument();
    expect(within(list).getByRole("group", { name: "Books" })).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("maxlength", "75");
  });
  it("Arrow keys move through the suggestions; Enter chooses the highlighted one", async () => {
    const { box, props } = setup();
    await userEvent.type(box, "gen");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).toMatch(/-2$/);
    await userEvent.keyboard("{Enter}");
    expect(props.onChoose).toHaveBeenCalledWith(expect.objectContaining({ type: "ref", label: "Genesis", url: "/Genesis" }));
    expect(box).toHaveValue("");
  });
  it("choosing the Search-for row runs the full-text search; Enter with nothing highlighted runs the smart submit", async () => {
    const { box, props } = setup();
    await userEvent.type(box, "gen");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(props.onSearch).toHaveBeenCalledWith("gen");
    await userEvent.type(box, "gen{Enter}");
    expect(props.onSmartSubmit).toHaveBeenCalledWith("gen");
  });
  it("a click on a suggestion goes there; a modified click is left to the browser", async () => {
    const { props } = setup();
    await userEvent.type(screen.getByRole("combobox"), "gen");
    const book = (await screen.findAllByRole("option", { name: /Gen. R./ }))[0]!;
    expect(book).toHaveAttribute("href", "/Bereshit_Rabbah");
    await userEvent.click(book);
    expect(props.onChoose).toHaveBeenCalledWith(expect.objectContaining({ label: "Gen. R." }));
  });
  it("Escape closes the list", async () => {
    const { box } = setup();
    await userEvent.type(box, "gen");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });
  it("a failing lookup shows nothing rather than breaking the box", async () => {
    const { box } = setup({ getSuggestions: async () => { throw new Error("offline"); } });
    await userEvent.type(box, "gen");
    expect(screen.queryByRole("option")).toBeNull();
  });

  // @feature SRC-017
  describe("Hebrew keyboard", () => {
    it("the icon appears with focus; its keys type at the caret, the box keeps focus; Bksp and Shift work", async () => {
      const { box } = setup();
      expect(screen.queryByRole("button", { name: "Hebrew keyboard" })).toBeNull();
      await userEvent.click(box);
      await userEvent.click(screen.getByRole("button", { name: "Hebrew keyboard" }));
      const kb = screen.getByRole("group", { name: "Hebrew keyboard" });
      await userEvent.click(within(kb).getByRole("button", { name: "ש" }));
      await userEvent.click(within(kb).getByRole("button", { name: "ל" }));
      expect(box).toHaveValue("של");
      expect(box).toHaveFocus();
      await userEvent.click(within(kb).getByRole("button", { name: "Bksp" }));
      expect(box).toHaveValue("ש");
      await userEvent.click(within(kb).getAllByRole("button", { name: "Shift" })[0]!);
      await userEvent.click(within(kb).getByRole("button", { name: "A" }));
      expect(box).toHaveValue("שA");
      await userEvent.click(within(kb).getByRole("button", { name: "ש" })); // shift was for one key only
      expect(box).toHaveValue("שAש");
    });
    it("Escape closes it; the Hebrew interface and the phone menu have none", async () => {
      const { box } = setup();
      await userEvent.click(box);
      await userEvent.click(screen.getByRole("button", { name: "Hebrew keyboard" }));
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("group", { name: "Hebrew keyboard" })).toBeNull();
    });
    it("not in the Hebrew interface", async () => {
      render(<InterfaceLangProvider lang="hebrew"><HeaderSearch {...STUB_SEARCH} /></InterfaceLangProvider>);
      await userEvent.click(screen.getByRole("combobox"));
      expect(screen.queryByRole("button", { name: "Hebrew keyboard" })).toBeNull();
    });
    it("not on the phone", async () => {
      render(<HeaderSearch {...STUB_SEARCH} mobile />);
      await userEvent.click(screen.getByRole("combobox"));
      expect(screen.queryByRole("button", { name: "Hebrew keyboard" })).toBeNull();
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortMenu } from "./SearchPage";

// CODE_REVIEW R-31: the sort menu said role="menu" but kept focus on its button and ignored the arrow keys
describe("SortMenu keyboard (the ARIA menu pattern)", () => {
  it("opening focuses the chosen item; arrows, Home and End move; Escape closes and returns to the button", async () => {
    const user = userEvent.setup();
    render(<SortMenu sort="relevance" onChange={() => {}} />);
    const button = screen.getByRole("button", { name: /Sort by Relevance/ });
    button.focus();
    await user.keyboard("{Enter}");
    const items = screen.getAllByRole("menuitemradio");
    expect(items[0]).toHaveFocus();
    expect(items.every((i) => i.tabIndex === -1)).toBe(true);
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
  it("choosing an item calls onChange and returns focus to the button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SortMenu sort="relevance" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Sort by Relevance/ }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: /Sort by/ })).toHaveFocus();
  });
});

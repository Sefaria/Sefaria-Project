import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MobileFilterButton, MobileFilterPanel } from "./SearchPage";

function Harness() {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  return (
    <>
      <MobileFilterButton onClick={() => setOpen(true)} />
      {open ? (
        <MobileFilterPanel title="Filters" onClose={() => setOpen(false)}>
          <button type="button" onClick={() => setN(n + 1)}>Tick {n}</button>
        </MobileFilterPanel>
      ) : null}
    </>
  );
}

// @feature SRC-063 — v-a11y S7: the phone's Sort & filter dialog gives focus back to its button
describe("MobileFilterPanel", () => {
  for (const how of ["Escape", "Close", "Show Results"] as const) {
    it(`closed with ${how}, focus goes back to "Sort & filter results"`, async () => {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Sort & filter results" });
      await userEvent.click(opener);
      expect(screen.getByRole("dialog")).toHaveFocus();
      if (how === "Escape") await userEvent.keyboard("{Escape}");
      else await userEvent.click(screen.getByRole("button", { name: how }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
    });
  }
  it("a re-render inside it (a filter ticked) leaves focus where it is", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Sort & filter results" }));
    await userEvent.click(screen.getByRole("button", { name: "Tick 0" }));
    expect(screen.getByRole("button", { name: "Tick 1" })).toHaveFocus();
  });
});

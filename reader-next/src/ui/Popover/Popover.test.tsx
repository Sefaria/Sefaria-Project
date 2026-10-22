import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Popover } from "./Popover";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button>outside</button>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label="Text display options"
        trigger={(p) => <button {...p}>Aa</button>}
      >
        <button>first</button>
        <button>second</button>
      </Popover>
    </div>
  );
}

// @feature SHL-017
describe("Popover", () => {
  it("is closed until the trigger is activated, and announces its state", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Aa" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Text display options" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-controls", screen.getByRole("dialog").id);
  });

  it("moves focus into the panel on open", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Aa" }));
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Aa" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Aa" })).toHaveFocus();
  });

  it("closes on an outside click but not on an inside click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Aa" }));
    await userEvent.click(screen.getByRole("button", { name: "second" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles closed when the trigger is pressed again", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Aa" }));
    await userEvent.click(screen.getByRole("button", { name: "Aa" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

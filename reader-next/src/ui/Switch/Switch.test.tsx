import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

// @feature TXD-037 @feature TXD-038
describe("Switch", () => {
  it("exposes its state", () => {
    render(<Switch label="Vowels" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Vowels" })).toBeChecked();
  });
  it("toggles on click, Enter and Space", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Vowels" checked={false} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch");
    await userEvent.click(sw);
    sw.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledTimes(3);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
  it("does not toggle when disabled, and explains why", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Cantillation" checked={false} disabled disabledReason="Turn on vowels first" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: /Cantillation/ });
    await userEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(sw).toHaveAccessibleDescription("Turn on vowels first");
    expect(sw).toHaveAttribute("aria-disabled", "true");
  });
});

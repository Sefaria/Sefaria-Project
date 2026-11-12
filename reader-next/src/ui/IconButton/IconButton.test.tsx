import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("is named by its label", () => {
    render(<IconButton icon="close" label="Close panel" />);
    expect(screen.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
  });

  it("exposes toggle state via aria-pressed", () => {
    const { rerender } = render(<IconButton icon="bookmark" label="Save" pressed={false} />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-pressed", "false");
    rerender(<IconButton icon="bookmark" label="Save" pressed />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not set aria-pressed for plain buttons", () => {
    render(<IconButton icon="close" label="Close" />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("blocks clicks when disabled", async () => {
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Close" disabled onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

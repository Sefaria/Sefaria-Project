// Ported from Sefaria-Project static/js/auth/tests/AuthCard.test.js
// @feature ACC-008
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthCard, AuthLoadingLine } from "./AuthCard";

describe("AuthCard", () => {
  it("focuses the heading on mount, out of the tab order", () => {
    render(<AuthCard heading="Log in" />);
    const h = screen.getByRole("heading", { level: 1, name: "Log in" });
    expect(h).toHaveFocus();
    expect(h).toHaveAttribute("tabindex", "-1");
  });
  it("moves focus to the new heading on every remount", () => {
    const { rerender } = render(<AuthCard key="a" heading="Log in" />);
    rerender(<AuthCard key="b" heading="Forgot Password?" />);
    expect(screen.getByRole("heading", { name: "Forgot Password?" })).toHaveFocus();
  });
  it("does not throw without a heading", () => {
    expect(() => render(<AuthCard><p>x</p></AuthCard>)).not.toThrow();
  });
  it("the back arrow has a name and calls back", async () => {
    const onBack = vi.fn();
    render(<AuthCard heading="h" onBack={onBack} backLabel="Back" />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });
  it("the loading line is a status", () => {
    render(<AuthLoadingLine label="Loading" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
});

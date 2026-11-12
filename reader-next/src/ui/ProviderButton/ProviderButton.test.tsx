// @feature ACC-012
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderButton, ProviderSdkOverlay } from "./ProviderButton";

describe("ProviderButton", () => {
  it("Apple is a real button", async () => {
    const onClick = vi.fn();
    render(<ProviderButton provider="apple" label="Continue with Apple" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));
    expect(onClick).toHaveBeenCalled();
  });
  it("Google with a tracking ref is a positioned shell (the iframe inside takes the click)", () => {
    const ref = vi.fn();
    render(<ProviderButton provider="google" label="Continue with Google" trackingRef={ref} disabled />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    expect(ref.mock.calls[0]![0]).toHaveAttribute("data-disabled", "true");
  });
  it("the SDK overlay takes clicks only when ready", () => {
    const { rerender, container } = render(<ProviderSdkOverlay active={false}><div /></ProviderSdkOverlay>);
    expect(container.firstElementChild).toHaveStyle({ pointerEvents: "none" });
    rerender(<ProviderSdkOverlay active><div /></ProviderSdkOverlay>);
    expect(container.firstElementChild).toHaveStyle({ pointerEvents: "auto" });
  });
});

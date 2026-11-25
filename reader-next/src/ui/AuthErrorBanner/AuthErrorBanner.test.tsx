// Ported in part from Sefaria-Project static/js/auth/tests/ForgotView.test.js (banner wiring)
// @feature ACC-009 @feature ACC-012
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthErrorBanner } from "./AuthErrorBanner";

describe("AuthErrorBanner", () => {
  it("renders nothing without an error", () => {
    const { container } = render(<AuthErrorBanner error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("a message with its link", async () => {
    const onLinkClick = vi.fn();
    render(<AuthErrorBanner error={{ message: "auth.email_exists_generic", linkText: "auth.log_in_link" }} onLinkClick={onLinkClick} />);
    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email address already exists. Log In");
    await userEvent.click(screen.getByRole("link", { name: "Log In" }));
    expect(onLinkClick).toHaveBeenCalled();
  });
  it("sso_only_account: Google's line is the target of the real Google button; Apple's link triggers Apple", async () => {
    const registerGoogleTarget = vi.fn();
    const triggerApple = vi.fn();
    render(<AuthErrorBanner error={{ code: "sso_only_account", providers: ["google", "apple"] }} registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple} />);
    expect(registerGoogleTarget).toHaveBeenCalledWith(expect.any(HTMLSpanElement));
    expect(registerGoogleTarget.mock.calls[0]![0]).toHaveTextContent("Continue with Google");
    await userEvent.click(screen.getByRole("link", { name: "Continue with Apple" }));
    expect(triggerApple).toHaveBeenCalled();
  });
  it("an unknown provider gets a generic line", () => {
    render(<AuthErrorBanner error={{ code: "sso_only_account", providers: ["github"] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This email is registered via Github. Continue with Github");
  });
});

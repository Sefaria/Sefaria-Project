// @feature ACC-008
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { AuthText } from "./AuthText";

describe("AuthText", () => {
  it("shows a key in English and Hebrew (the old en/he.json words)", () => {
    const { unmount } = render(<AuthText k="auth.continue_with_email" />);
    expect(screen.getByText("Continue with Email")).toBeInTheDocument();
    unmount();
    render(<InterfaceLangProvider lang="hebrew"><AuthText k="auth.continue_with_email" /></InterfaceLangProvider>);
    expect(screen.getByText("המשך עם דוא״ל")).toHaveAttribute("lang", "he");
  });
  it("shows an unknown key (a server message) as it is", () => {
    render(<AuthText k="This password reset link is no longer valid." />);
    expect(screen.getByText("This password reset link is no longer valid.")).toBeInTheDocument();
  });
});

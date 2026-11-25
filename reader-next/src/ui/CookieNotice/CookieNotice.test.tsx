import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SkipLink } from "../SkipLink/SkipLink";
import { CookieNotice } from "./CookieNotice";

beforeEach(() => {
  document.cookie = "cookiesNotificationAccepted=; path=/; max-age=0";
});

// @feature GUI-007
describe("CookieNotice", () => {
  it("shows to a new visitor and OK remembers", async () => {
    render(<CookieNotice />);
    expect(await screen.findByText(/We use cookies/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/We use cookies/)).toBeNull();
    expect(document.cookie).toContain("cookiesNotificationAccepted=1");
  });
  it("stays away once accepted", () => {
    document.cookie = "cookiesNotificationAccepted=1; path=/";
    render(<CookieNotice />);
    expect(screen.queryByText(/We use cookies/)).toBeNull();
  });
});

// @feature I18-002
describe("SkipLink", () => {
  it("points at main", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
  });
});

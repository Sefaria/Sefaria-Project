// @feature PRM-014 @feature AI-001
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LibraryAssistantBanner, isBannerExcludedPath } from "./SiteWideBanner";

describe("LibraryAssistantBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("signed out: the old text, Log in to Try through /enable-library-assistant back to the page, and Maybe later", async () => {
    render(<LibraryAssistantBanner path="/texts" />);
    expect(await screen.findByText("Ask the Library Assistant")).toBeInTheDocument();
    expect(screen.getByText("Discover answers to your questions, grounded in Jewish sources.")).toBeInTheDocument();
    const login = screen.getByRole("link", { name: "Log in to Try" });
    expect(login).toHaveAttribute("href", "/login?next=%2Fenable-library-assistant%3Fnext%3D%252Ftexts");
    expect(login).toHaveAttribute("data-signup-source", "la_banner");
  });

  it("Maybe later hides it and records the back-off", async () => {
    render(<LibraryAssistantBanner path="/texts" />);
    await userEvent.click(await screen.findByRole("button", { name: "Maybe later" }));
    await waitFor(() => expect(screen.queryByText("Ask the Library Assistant")).toBeNull());
    expect(JSON.parse(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_state")!)).toMatchObject({ maybeLaterCount: 1 });
  });

  it("not on the sign-in pages", () => {
    expect(isBannerExcludedPath("/login")).toBe(true);
    expect(isBannerExcludedPath("/password/reset/confirm/abc/def")).toBe(true);
    expect(isBannerExcludedPath("/texts")).toBe(false);
  });
});

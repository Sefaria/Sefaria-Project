import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { SIGNUP_KINDS, SIGNUP_CONTENT } from "~/lib/auth/signup-content";
import { SignUpModal } from "./SignUpModal";

const base = { onClose: () => {}, next: "/Genesis.1.1?with=all" };

// @feature GUI-004
describe("SignUpModal", () => {
  it("Notes: the words the live site shows, and Sign Up / Sign in with the current address as next", () => {
    render(<SignUpModal {...base} kind="notes" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Don’t lose that thought!");
    expect(dialog).toHaveTextContent("Create a free account to do more on Sefaria");
    for (const b of ["Take notes on this text", "Build & create source sheets", "Connect with other users", "Get updates on new features"]) expect(dialog).toHaveTextContent(b);
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "https://www.sefaria.org/register?next=%2FGenesis.1.1%3Fwith%3Dall");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "https://www.sefaria.org/login?next=%2FGenesis.1.1%3Fwith%3Dall");
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("data-signup-source", "signup_modal_notes");
  });
  it("Add to Sheet words", () => {
    render(<SignUpModal {...base} kind="add-to-sheet" />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Want to make your own source sheet?");
  });
  it("closes with the close button", async () => {
    const onClose = vi.fn();
    render(<SignUpModal {...base} kind="notes" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("is not there with no kind", () => {
    render(<SignUpModal {...base} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Hebrew interface", () => {
    render(<InterfaceLangProvider lang="hebrew"><SignUpModal {...base} kind="notes" /></InterfaceLangProvider>);
    expect(screen.getByRole("dialog")).toHaveTextContent("אל תשכחו את המחשבה שעלתה בכם!");
    expect(screen.getByRole("link", { name: "להרשמה" })).toBeInTheDocument();
  });
  it("every kind has words in both languages", () => {
    for (const k of SIGNUP_KINDS) {
      const c = SIGNUP_CONTENT[k];
      expect(c.h2.en && c.h2.he).toBeTruthy();
      expect(c.bullets.length).toBeGreaterThan(2);
    }
  });
});

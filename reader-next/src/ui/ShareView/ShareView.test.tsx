import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { shareHrefs } from "~/lib/feedback/share";
import { ShareView } from "./ShareView";

const url = "https://www.sefaria.org/Genesis.1.1?lang=en&with=all";

// @feature CON-061
describe("ShareView", () => {
  it("shows the link, selectable, and the three ways to share it (new tabs)", () => {
    render(<ShareView url={url} />);
    expect(screen.getByRole("textbox", { name: "Shareable link" })).toHaveValue(url);
    expect(screen.getByRole("link", { name: "Share on Facebook" })).toHaveAttribute("href", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    expect(screen.getByRole("link", { name: "Share on X" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Share by Email" })).toHaveAttribute("href", `mailto:?&subject=Text on Sefaria&body=${url}`);
  });
  it("copy writes the link to the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareView url={url} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
  it("the targets are built as the old ShareBox did", () => {
    expect(shareHrefs("https://x/y?a=1&b=2").x).toBe("https://twitter.com/share?url=https%3A%2F%2Fx%2Fy%3Fa%3D1%26b%3D2");
  });
});

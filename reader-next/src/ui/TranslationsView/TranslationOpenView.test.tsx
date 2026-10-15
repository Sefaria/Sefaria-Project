import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TranslationVersion } from "~/lib/versions/translations";
import { TranslationOpenView } from "./TranslationOpenView";
import { storyLanguages } from "./story-data";

const koren = storyLanguages().flatMap((l) => l.versions).find((v) => v.versionTitle === "The Koren Jerusalem Bible") as TranslationVersion;

// @feature VER-013
describe("TranslationOpenView (Genesis 1:1, recorded)", () => {
  it("shows the translation's name, the passage in it, and an Open link", () => {
    render(<TranslationOpenView version={koren} lang="en" openHref="/Genesis.1.1?ven=english|The_Koren_Jerusalem_Bible" />);
    expect(screen.getByRole("heading", { name: "The Koren Jerusalem Bible" })).toBeInTheDocument();
    expect(screen.getByText(/IN THE BEGINNING God created the heaven and the earth/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/Genesis.1.1?ven=english|The_Koren_Jerusalem_Bible");
  });
  it("Open is handled in the app on a plain click", async () => {
    const onOpen = vi.fn();
    render(<TranslationOpenView version={koren} lang="en" openHref="/x" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("link", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
  it("loading, and a translation without text for the passage", () => {
    const { rerender } = render(<TranslationOpenView loading lang="en" openHref="/x" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<TranslationOpenView lang="en" openHref="/x" />);
    expect(screen.getByText("This translation has no text for the selected passage.")).toBeInTheDocument();
  });
});

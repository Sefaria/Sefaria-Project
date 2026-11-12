import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { TocView } from "./TocView";
import { BERAKHOT, BERAKHOT_BOTH, GENESIS, HAGGADAH, JASTROW } from "./story-data";

// @feature BOK-008 @feature BOK-011 @feature BOK-015 @feature BOK-016 @feature BOK-017 @feature BOK-018 @feature BOK-010
describe("TocView", () => {
  it("Genesis: fifty chapter links under Chapters, the current one marked", () => {
    render(<TocView structures={GENESIS} />);
    expect(screen.getByRole("heading", { name: "Chapters" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "50" })).toHaveAttribute("href", "/Genesis.50");
    const current = screen.getAllByRole("link").filter((l) => l.hasAttribute("data-current"));
    expect(current.map((l) => l.getAttribute("href"))).toEqual(["/Genesis.2", "/Genesis.1.1-2.3"]);
  });

  it("Torah Portions: each portion a fixed heading (a link to its start) over its aliyot", () => {
    render(<TocView structures={GENESIS} />);
    expect(screen.getByRole("heading", { name: "Torah Portions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bereshit" })).toHaveAttribute("href", "/Genesis.1.1");
    expect(screen.queryByRole("button", { name: "Bereshit" })).toBeNull();
  });

  it("a link opens in place when a handler is given, but stays a real link for new tabs", async () => {
    const onOpenRef = vi.fn();
    render(<TocView structures={GENESIS} onOpenRef={onOpenRef} />);
    await userEvent.click(screen.getAllByRole("link", { name: "5" })[0]!);
    expect(onOpenRef).toHaveBeenCalledWith("Genesis 5");
    fireEvent.click(screen.getAllByRole("link", { name: "6" })[0]!, { metaKey: true });
    expect(onOpenRef).toHaveBeenCalledTimes(1);
  });

  it("Talmud chapters: dafs under each chapter, collapsible, Hebrew dafs in a Hebrew interface", async () => {
    const { unmount } = render(<TocView structures={BERAKHOT} />);
    const toggle = screen.getByRole("button", { name: "Chapter 1; MeEimatai" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "2a" })).toHaveAttribute("href", "/Berakhot.2a.1-14");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "2a" })).toBeNull();
    unmount();
    render(<InterfaceLangProvider lang="hebrew"><TocView structures={BERAKHOT} /></InterfaceLangProvider>);
    expect(screen.getAllByRole("link", { name: "ב." })[0]).toBeInTheDocument();
  });

  it("more than one structure: a toggle switches them", async () => {
    render(<TocView structures={BERAKHOT_BOTH} />);
    const group = screen.getByRole("radiogroup", { name: "Structure" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    await userEvent.click(within(group).getByRole("radio", { name: "Daf" }));
    expect(screen.getAllByRole("link").some((l) => l.textContent === "64a")).toBe(true);
  });

  it("a complex text: titles that link straight to content", () => {
    render(<TocView structures={HAGGADAH} />);
    const kadesh = screen.getByRole("link", { name: "Kadesh" });
    expect(kadesh).toHaveAttribute("data-current", "true");
    expect(screen.getByRole("link", { name: "Urchatz" })).not.toHaveAttribute("data-current");
  });

  it("a dictionary: browse by letter", () => {
    render(<TocView structures={JASTROW} />);
    expect(screen.getByRole("heading", { name: /Browse By Letter/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "א" })).toHaveAttribute("data-current", "true");
  });
});

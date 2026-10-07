import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextList, type LinkedTextItem } from "./TextList";

const item = (n: number, over: Partial<LinkedTextItem> = {}): LinkedTextItem => ({
  id: `i${n}`,
  sourceRef: `Rashi on Genesis 1:1:${n}`,
  sourceHeRef: `רש"י על בראשית א:א:${n}`,
  href: `/Rashi_on_Genesis.1.1.${n}`,
  primary: { html: `<b>בראשית ${n}.</b> פירוש`, lang: "he", dir: "rtl" },
  translation: { html: `<b>In the beginning ${n}.</b> explanation`, lang: "en", dir: "ltr" },
  ...over,
});
const props = { title: { en: "Rashi", he: 'רש"י' }, hideItemTitles: true, language: "english" as const };

// @feature CON-030 @feature CON-032 @feature CON-033
describe("TextList", () => {
  it("titles the list with the filter", () => {
    render(<TextList {...props} items={[item(1)]} />);
    expect(screen.getByRole("heading", { name: "Rashi" })).toBeInTheDocument();
  });

  it("shows one language at a time: the translation in English", () => {
    render(<TextList {...props} items={[item(1)]} />);
    expect(screen.getByText(/In the beginning 1/)).toBeInTheDocument();
    expect(screen.queryByText(/בראשית 1/)).toBeNull();
  });

  it("shows the source in Hebrew", () => {
    render(<TextList {...props} language="hebrew" items={[item(1)]} />);
    expect(screen.getByText(/בראשית 1/)).toBeInTheDocument();
    expect(screen.queryByText(/In the beginning/)).toBeNull();
  });

  it("falls back to the other side when the preferred one is missing", () => {
    render(<TextList {...props} items={[item(1, { translation: undefined })]} />);
    expect(screen.getByText(/בראשית 1/)).toBeInTheDocument();
  });

  it("hides item titles for commentary lists but shows them otherwise", () => {
    const { rerender } = render(<TextList {...props} items={[item(1)]} />);
    expect(screen.queryByText("Rashi on Genesis 1:1:1")).toBeNull();
    rerender(<TextList {...props} hideItemTitles={false} items={[item(1)]} />);
    // a title, not a link (VERIFIED on sefaria.org: clicking it does nothing; "Open" opens the text)
    expect(screen.getByText("Rashi on Genesis 1:1:1").closest("a")).toBeNull();
  });

  it("gives every item an Open link", () => {
    render(<TextList {...props} items={[item(1), item(2)]} />);
    const open = screen.getAllByRole("link", { name: "Open" });
    expect(open.map((a) => a.getAttribute("href"))).toEqual(["/Rashi_on_Genesis.1.1.1", "/Rashi_on_Genesis.1.1.2"]);
  });

  it("opens in-app on a plain click only", async () => {
    const onOpen = vi.fn();
    render(<TextList {...props} items={[item(1)]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("link", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith("/Rashi_on_Genesis.1.1.1", expect.anything());
  });

  it("says so when there are no connections", () => {
    render(<TextList {...props} items={[]} />);
    expect(screen.getByText("No connections known.")).toBeInTheDocument();
  });

  it("shows loading and no empty message while loading", () => {
    render(<TextList {...props} items={[]} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("No connections known.")).toBeNull();
  });

  it("shows an item's own loading state", () => {
    render(<TextList {...props} items={[item(1, { primary: undefined, translation: undefined, loading: true })]} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("labels each text with its language and direction", () => {
    const { container } = render(<TextList {...props} language="hebrew" items={[item(1)]} />);
    const text = container.querySelector("li [lang='he']")!;
    expect(text).toHaveAttribute("dir", "rtl");
  });
});

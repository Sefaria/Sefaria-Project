import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentLanguage } from "~/lib/reader/settings";
import type { TextPassage, VersionMeta } from "~/lib/text/model";
import { textQueryOptions } from "~/lib/text/queries";
import { CLOSE_GRACE_MS, HOVER_DELAY_MS, RefPreviews } from "./RefPreview";
import { placeCard } from "./ref-preview-geometry";

const version = (language: "he" | "en"): VersionMeta => ({
  versionTitle: language, language, actualLanguage: language, languageFamilyName: language === "he" ? "hebrew" : "english",
  direction: language === "he" ? "rtl" : "ltr", isSource: language === "he", isPrimary: language === "he",
});
const passage: TextPassage = {
  ref: "Exodus 12:2", heRef: "שמות י״ב:ב׳", sectionRef: "Exodus 12", heSectionRef: "שמות י״ב", sectionRefs: ["Exodus 12"],
  book: "Exodus", indexTitle: "Exodus", heIndexTitle: "שמות", categories: ["Tanakh", "Torah"], primaryCategory: "Tanakh",
  isComplex: false, isDependant: false, isSpanning: false, textDepth: 2, sectionNames: ["Chapter", "Verse"], addressTypes: ["Perek", "Pasuk"],
  sections: ["12", "2"], toSections: ["12", "2"], next: null, prev: null, primaryVersion: version("he"), translationVersion: version("en"),
  availableVersions: [], warnings: [],
  segments: [{ ref: "Exodus 12:2", address: ["12", "2"], sectionRef: "Exodus 12", primary: "הַחֹדֶשׁ הַזֶּה לָכֶם", translation: "This month shall mark for you" }],
};

function Harness({ language, onOpen }: { language: ContentLanguage; onOpen: (ref: string) => void }) {
  const root = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={root}>
        <p>
          See <a className="ref-link" data-sefaria-ref="Exodus 12:2" href="/Exodus.12.2">Exodus 12:2</a> and more.
        </p>
      </section>
      <RefPreviews root={root} language={language} onOpenColumn={onOpen} pageHref={(ref) => `/${ref.replace(/ /g, ".").replace(":", ".")}?lang=bi`} />
    </>
  );
}

function setup(language: ContentLanguage = "bilingual") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(textQueryOptions("Exodus 12:2").queryKey, passage);
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <Harness language={language} onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { link: screen.getByRole("link", { name: "Exodus 12:2" }), onOpen };
}

function pointer(type: "pointerover" | "pointerout", target: Element, relatedTarget: Element | null = null) {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  act(() => void target.dispatchEvent(e));
}
const card = () => document.querySelector<HTMLElement>("[data-ref-preview]");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RefPreviews", () => {
  it("resting on a link opens a preview; leaving it closes after a grace period", () => {
    const { link } = setup();
    pointer("pointerover", link);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS - 50));
    expect(card()).toBeNull();
    act(() => void vi.advanceTimersByTime(50));
    expect(card()?.dataset.pinned).toBe("false");
    expect(card()!.textContent).toContain("This month shall mark for you");
    expect(card()!.textContent).toContain("הַחֹדֶשׁ");
    pointer("pointerout", link, document.body);
    act(() => void vi.advanceTimersByTime(CLOSE_GRACE_MS));
    expect(card()).toBeNull();
  });

  it("moving onto the card keeps it; pressing inside pins it", () => {
    const { link } = setup();
    pointer("pointerover", link);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS));
    pointer("pointerout", link, card());
    fireEvent.pointerEnter(card()!);
    fireEvent.pointerDown(card()!);
    act(() => void vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(card()?.dataset.pinned).toBe("true");
  });

  it("Escape closes a hover preview", () => {
    const { link } = setup();
    pointer("pointerover", link);
    act(() => void vi.advanceTimersByTime(HOVER_DELAY_MS));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("a plain click opens a pinned card instead of following the link; a modifier click follows it", () => {
    const { link } = setup();
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(card()).toBeNull();
    expect(fireEvent.click(link)).toBe(false);
    expect(card()?.dataset.pinned).toBe("true");
    expect(document.activeElement).toBe(card());
  });

  it("shows the panel's language: Hebrew only stays Hebrew only", () => {
    const { link } = setup("hebrew");
    fireEvent.click(link);
    expect(card()!.textContent).toContain("הַחֹדֶשׁ");
    expect(card()!.textContent).not.toContain("This month");
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("שמות י״ב:ב׳");
  });

  it("Open as new column hands over the ref and closes the card; Open in new page is a link to a new tab; × closes it", () => {
    const { link, onOpen } = setup();
    fireEvent.click(link);
    const page = screen.getByRole("link", { name: "Open in new page" });
    expect(page.getAttribute("href")).toBe("/Exodus.12.2?lang=bi");
    expect(page.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: "Open as new column" }));
    expect(onOpen).toHaveBeenCalledWith("Exodus 12:2");
    expect(card()).toBeNull();
    fireEvent.click(link);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(card()).toBeNull();
  });
});

describe("placeCard", () => {
  const vp = { width: 1200, height: 800 };
  it("sits below the link when there is room, else above it", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 300 }, vp)).toEqual({ left: 300, top: 126 });
    expect(placeCard({ top: 700, bottom: 720, left: 300 }, vp)).toEqual({ left: 300, bottom: 106 });
  });
  it("stays inside the viewport", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 1150 }, vp).left).toBe(1200 - 380 - 16);
    expect(placeCard({ top: 100, bottom: 120, left: 2 }, vp).left).toBe(16);
  });
});

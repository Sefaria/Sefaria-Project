import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { lexiconQueryOptions, type LexiconEntryData } from "~/lib/lexicon/lookup";
import { DefinitionCard } from "./DefinitionCard";

const entry = (headword: string, lexicon: string, definition: string, text_categories?: string[]): LexiconEntryData =>
  ({ headword, parent_lexicon: lexicon, content: { senses: [{ definition }] }, parent_lexicon_details: { name: lexicon, to_language: "en", text_categories } }) as LexiconEntryData;

function setup(entries: LexiconEntryData[], explicit = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(lexiconQueryOptions("שָׁמַיִם", "Genesis 1:1").queryKey, entries);
  const onClose = vi.fn();
  const onOpenDictionary = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <DefinitionCard words="שָׁמַיִם" segmentRef="Genesis 1:1" anchor={{ left: 100, top: 100, bottom: 120 }} explicit={explicit} categories={["Tanakh", "Torah"]} onClose={onClose} onOpenDictionary={onOpenDictionary} />
    </QueryClientProvider>,
  );
  return { onClose, onOpenDictionary };
}

describe("DefinitionCard", () => {
  it("shows the definitions of dictionaries that apply to the text", () => {
    setup([entry("שָׁמַיִם", "BDB", "<b>heavens</b>, sky", ["Tanakh, Torah"]), entry("שמיא", "Jastrow", "sky"), entry("x", "Other", "elsewhere", ["Talmud, Bavli"])]);
    const card = screen.getByRole("dialog", { name: "Definition of שָׁמַיִם" });
    expect(card).toHaveTextContent("heavens, sky");
    expect(card).toHaveTextContent("Jastrow");
    expect(card).not.toHaveTextContent("elsewhere");
  });

  it("stays silent when nothing is found, unless asked for explicitly", () => {
    setup([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when an explicit lookup finds nothing", () => {
    setup([], true);
    expect(screen.getByRole("dialog")).toHaveTextContent("No definition found.");
  });

  it("closes on Escape and on a click elsewhere; opens the dictionary sidebar on request", () => {
    const { onClose, onOpenDictionary } = setup([entry("שָׁמַיִם", "BDB", "heavens")]);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /Open in dictionary/ }));
    expect(onOpenDictionary).toHaveBeenCalled();
  });
});

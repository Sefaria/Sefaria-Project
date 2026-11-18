import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { noResultsQuestion, WIDGET_LOAD_TIMEOUT_MS } from "~/lib/assistant/no-results";
import { NoResults } from "./SearchPage";

// sefaria.org static/js/NoSearchResults.jsx (#3934): with the Library Assistant on the page the no-results page offers it.
// @feature AI-011
const QUESTION = 'I searched for "zzq" on Sefaria and got no results. Can you help me find relevant sources, books, authors, and/or topics?';

describe("NoResults and the Library Assistant", () => {
  let events: { type: string; detail: unknown }[];
  const record = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail });
  beforeEach(() => {
    events = [];
    document.addEventListener("chatbot:open", record);
    document.addEventListener("chatbot:launcher", record);
  });
  afterEach(() => {
    document.removeEventListener("chatbot:open", record);
    document.removeEventListener("chatbot:launcher", record);
    vi.useRealTimers();
  });
  const define = () => {
    if (!customElements.get("lc-chatbot")) customElements.define("lc-chatbot", class extends HTMLElement {});
  };

  it("without the assistant: the browse button and the plain body, no launcher event", () => {
    render(<NoResults tab="sources" query="zzq" />);
    expect(screen.getByRole("link", { name: "Browse Library" })).toHaveAttribute("href", "/texts");
    expect(screen.getByText(/change your filter\/toggle selections/)).toBeInTheDocument();
    expect(events).toEqual([]);
  });

  it("with it on the page and defined: no browse button; the body's link and the floating button ask the same question", async () => {
    define();
    const { unmount } = render(<NoResults tab="authors" query="zzq" assistant />);
    const link = await screen.findByRole("link", { name: "Library Assistant" });
    expect(screen.queryByRole("link", { name: "Browse Authors" })).toBeNull();
    expect(link.closest("p")).toHaveTextContent("Try a different search term, browse all Authors or ask the Library Assistant for help.");
    expect(events).toEqual([{ type: "chatbot:launcher", detail: { source: "search_no_results", question: QUESTION } }]);
    await userEvent.click(link);
    expect(events.at(-1)).toEqual({ type: "chatbot:open", detail: { source: "search_no_results", question: QUESTION } });
    unmount();
    // leaving puts the widget's "Ask" back
    expect(events.at(-1)).toEqual({ type: "chatbot:launcher", detail: null });
  });

  it("asks in Hebrew on the Hebrew interface; the query is kept as typed", () => {
    expect(noResultsQuestion("a$&b", "he")).toBe('חיפשתי "a$&b" בספריא ואין תוצאות. אפשר לעזור לי למצוא מקורות, ספרים, מחברים ו/או נושאים רלוונטיים?');
    define();
    render(<InterfaceLangProvider lang="hebrew"><NoResults tab="topics" query="zzq" assistant /></InterfaceLangProvider>);
    expect(screen.getByRole("link", { name: "עוזר הספרייה" }).closest("p")).toHaveTextContent("נסו מונח חיפוש אחר, עיינו בכל הנושאים או שאלו את עוזר הספרייה.");
  });
});

describe("NoResults while the widget's script loads", () => {
  it("shows neither text nor button, then the browse button if the script never comes", async () => {
    vi.useFakeTimers();
    const get = vi.spyOn(customElements, "get").mockReturnValue(undefined);
    const when = vi.spyOn(customElements, "whenDefined").mockReturnValue(new Promise(() => {}));
    const { container } = render(<NoResults tab="books" query="zzq" assistant />);
    expect(container.firstElementChild).toHaveAttribute("data-assistant", "loading");
    expect(screen.queryByRole("link", { name: "Browse Library" })).toBeNull();
    await act(async () => void vi.advanceTimersByTime(WIDGET_LOAD_TIMEOUT_MS + 10));
    expect(screen.getByRole("link", { name: "Browse Library" })).toBeInTheDocument();
    get.mockRestore();
    when.mockRestore();
    vi.useRealTimers();
  });
});

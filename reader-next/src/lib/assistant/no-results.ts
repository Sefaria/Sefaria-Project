/**
 * The search no-results page's Library Assistant (sefaria.org static/js/NoSearchResults.jsx, #3934): whether the assistant can be
 * offered there, the question it is asked about the failed search, and the events that ask it.
 *
 * With the widget on the page and its script defined, the page's own browse button goes, the body points to the assistant (its name a
 * link that asks), and the widget's floating Ask button becomes "Search with Library Assistant" (`chatbot:launcher`, the widget owns
 * the label). The link and the button send exactly the same question, so the widget asks it once.
 *
 * @feature AI-011 Library Assistant chatbot widget
 */
import { useEffect, useState } from "react";

/** How long to wait for a loading widget before falling back to the browse button (the old WIDGET_LOAD_TIMEOUT_MS). */
export const WIDGET_LOAD_TIMEOUT_MS = 3000;

/**
 * "available": the widget is on the page and its script defined it. "unavailable": no widget, or its script never loaded.
 * "loading": on the page, script not defined yet (neither version of the text shows, so switching tabs never flashes the button).
 */
export type AssistantAvailability = "available" | "unavailable" | "loading";

const QUESTION = {
  en: 'I searched for "{query}" on Sefaria and got no results. Can you help me find relevant sources, books, authors, and/or topics?',
  he: 'חיפשתי "{query}" בספריא ואין תוצאות. אפשר לעזור לי למצוא מקורות, ספרים, מחברים ו/או נושאים רלוונטיים?',
} as const;

/** The question about a search that found nothing (search.no_results.library_assistant_question); `$&` in the query kept as typed. */
export const noResultsQuestion = (query: string, lang: "en" | "he"): string => QUESTION[lang].replace(/\{query\}/g, () => query);

/** Open the assistant and ask about the failed search (the body's link). */
export const askAboutNoResults = (question: string) =>
  document.dispatchEvent(new CustomEvent("chatbot:open", { detail: { source: "search_no_results", question } }));

const current = (onPage: boolean): AssistantAvailability => {
  if (!onPage || typeof window === "undefined" || !window.customElements) return "unavailable";
  return window.customElements.get("lc-chatbot") ? "available" : "loading";
};

/**
 * Whether the assistant can be offered on this page. `onPage` is whether the shell renders the widget. While its script loads this
 * waits for it; a script that never loads would leave no way forward, so after WIDGET_LOAD_TIMEOUT_MS the page shows the browse button.
 * The first render is "loading" when on the page (the server can't know whether the script has loaded), so it hydrates the same.
 */
export function useAssistantAvailability(onPage: boolean): AssistantAvailability {
  const [availability, setAvailability] = useState<AssistantAvailability>(onPage ? "loading" : "unavailable");
  useEffect(() => {
    const now = current(onPage);
    setAvailability(now);
    if (now !== "loading") return;
    let cancelled = false;
    const timer = setTimeout(() => !cancelled && setAvailability("unavailable"), WIDGET_LOAD_TIMEOUT_MS);
    void window.customElements.whenDefined("lc-chatbot").then(() => {
      if (cancelled) return;
      clearTimeout(timer);
      setAvailability("available");
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onPage]);
  return availability;
}

/** While the page offers the assistant: its floating Ask button asks about this search; put back "Ask" when the page goes. */
export function useNoResultsLauncher(available: boolean, question: string): void {
  useEffect(() => {
    if (!available) return;
    document.dispatchEvent(new CustomEvent("chatbot:launcher", { detail: { source: "search_no_results", question } }));
    return () => void document.dispatchEvent(new CustomEvent("chatbot:launcher", { detail: null }));
  }, [available, question]);
}

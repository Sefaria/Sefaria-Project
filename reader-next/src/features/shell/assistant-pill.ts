/**
 * Whether the Library Assistant is on this page (src/features/assistant/LibraryAssistant.tsx publishes it), so the header shows its
 * "✦ Library Assistant" pill exactly when the widget is there (the old Header's `libraryAssistant` prop = ReaderApp's displayChatbot),
 * and how the pill opens it: the old `chatbot:open` event with source "header".
 *
 * @feature AI-001 Chatbot experiment banner (shell mount) — replaced by the header pill on sefaria.org (#3934)
 */
import { useSyncExternalStore } from "react";

let shown = false;
const listeners = new Set<() => void>();

export function setAssistantShown(v: boolean): void {
  if (v === shown) return;
  shown = v;
  for (const l of listeners) l();
}

export function useAssistantShown(): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => shown,
    () => false,
  );
}

/** The old LibraryAssistantHeaderLink's click: ask the widget to open. */
export const openAssistantFromHeader = () => document.dispatchEvent(new CustomEvent("chatbot:open", { detail: { source: "header" } }));

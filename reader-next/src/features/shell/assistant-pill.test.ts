import { describe, expect, it, vi } from "vitest";
import { openAssistantFromHeader, setAssistantShown } from "./assistant-pill";

// @feature AI-001
describe("assistant pill store", () => {
  it("opens the widget with the old event and source", () => {
    const seen = vi.fn();
    document.addEventListener("chatbot:open", (e) => seen((e as CustomEvent).detail));
    openAssistantFromHeader();
    expect(seen).toHaveBeenCalledWith({ source: "header" });
    setAssistantShown(true);
    setAssistantShown(false);
  });
});

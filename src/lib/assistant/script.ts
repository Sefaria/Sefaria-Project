/**
 * Load the Library Assistant's script, once per page and only in the browser: it defines `<lc-chatbot>`. A page loads it only for a
 * reader who gets the assistant (the old base.html did the same), so nobody else downloads it.
 */
import type { AssistantBuild } from "./config";

const SCRIPT_ID = "sefaria-library-assistant";

export function loadAssistantScript(build: AssistantBuild, doc: Document = document): HTMLScriptElement {
  const existing = doc.getElementById(SCRIPT_ID);
  if (existing instanceof HTMLScriptElement) return existing; // a build defines the element once; another needs a page load
  const s = doc.createElement("script");
  s.id = SCRIPT_ID;
  s.src = build.scriptUrl;
  if (build.scriptType) s.type = build.scriptType;
  s.async = true;
  doc.head.appendChild(s);
  return s;
}

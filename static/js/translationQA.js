/**
 * Community QA for unverified machine translations (POC).
 *
 * A reader studying a machine-translated version gets two controls on each
 * segment: mark it good, or report a problem. Reporting hands off to the Library
 * Assistant widget via a `chatbot:start-flow` DOM event; the widget opens a new
 * chat seeded with the segment and its two texts.
 *
 * This module is deliberately free of React and of Sefaria's data layer so it
 * can be reasoned about — and tested — on its own.
 */

/** Event the `<lc-chatbot>` widget listens for. Contract lives in ai-chatbot's src/lib/reportFlow.js. */
export const START_FLOW_EVENT = "chatbot:start-flow";

/** The widget's flow name for translation reports. */
export const REPORT_ISSUE_FLOW = "report_issue";

/**
 * Versions under community QA.
 *
 * POC: a hand-maintained allowlist of version titles. There is no client-side
 * signal for "machine translated" today — Version.method exists in Mongo but is
 * not sent to the reader — so rather than plumb a new field through the text
 * API for one version, the POC names it here. Replace this with a real version
 * flag before this reaches more than one text.
 *
 * @type {string[]}
 */
export const AI_QA_VERSION_TITLES = [
  "Sefaria AI Translation (POC)",
];

const STORAGE_PREFIX = "sefaria.translationQA.ok:";

/**
 * Is this version one the reader can report on?
 * @param {string} versionTitle
 */
export function isAIQAVersion(versionTitle) {
  if (typeof versionTitle !== "string" || !versionTitle) return false;
  return AI_QA_VERSION_TITLES.includes(versionTitle);
}

/**
 * Can we actually hand a report off to the assistant?
 *
 * The widget only renders for logged-in desktop readers in the chatbot
 * experiment (see ReaderApp). Without it, "Report a problem" would dispatch an
 * event into the void, so the control is hidden instead.
 */
export function isChatbotAvailable(globals = typeof Sefaria === "undefined" ? null : Sefaria) {
  if (!globals) return false;
  return Boolean(globals.chatbot_enabled && globals.chatbot_user_token);
}

/**
 * Build the `chatbot:start-flow` event detail for a segment.
 *
 * Returns null when there is nothing worth reporting on, so callers can decline
 * to dispatch rather than opening an empty report.
 *
 * @param {{sref: string, en?: string, he?: string}} segment
 */
export function buildStartFlowDetail(segment) {
  const sref = typeof segment?.sref === "string" ? segment.sref.trim() : "";
  if (!sref) return null;

  const en = typeof segment?.en === "string" ? segment.en : "";
  const he = typeof segment?.he === "string" ? segment.he : "";
  if (!en && !he) return null;

  return { flow: REPORT_ISSUE_FLOW, ref: sref, en, he };
}

/**
 * Ask the assistant to open a report for this segment.
 *
 * The widget composes the seed text itself — we send the raw segment — so the
 * seed's shape can change without a Sefaria deploy.
 *
 * @returns {boolean} whether an event was dispatched
 */
export function reportTranslationIssue(segment, doc = typeof document === "undefined" ? null : document) {
  const detail = buildStartFlowDetail(segment);
  if (!detail || !doc) return false;

  // Bubbles so a caller can dispatch from the segment element instead of the
  // document and still reach the widget's document-level listener.
  doc.dispatchEvent(new CustomEvent(START_FLOW_EVENT, {bubbles: true, detail}));
  return true;
}

function storageKey(sref, versionTitle) {
  return `${STORAGE_PREFIX}${versionTitle}|${sref}`;
}

/**
 * Has this reader already marked this segment as reading well?
 *
 * Browser-local only. The durable signal is the analytics event; this just stops
 * the checkbox forgetting itself when the reader scrolls away and back.
 */
export function isMarkedGood(sref, versionTitle, storage = safeStorage()) {
  if (!storage) return false;
  try {
    return storage.getItem(storageKey(sref, versionTitle)) === "1";
  } catch (e) {
    return false;
  }
}

/** Remember that this reader marked this segment good. */
export function setMarkedGood(sref, versionTitle, marked, storage = safeStorage()) {
  if (!storage) return;
  try {
    if (marked) {
      storage.setItem(storageKey(sref, versionTitle), "1");
    } else {
      storage.removeItem(storageKey(sref, versionTitle));
    }
  } catch (e) {
    // Private browsing, or storage full. The control still works for this page view.
  }
}

function safeStorage() {
  // Accessing localStorage throws outright in some privacy modes, so even the
  // existence check needs guarding.
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (e) {
    return null;
  }
}

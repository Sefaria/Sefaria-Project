/* Testing done using Jest */
import {
  AI_QA_VERSION_TITLES,
  REPORT_ISSUE_FLOW,
  START_FLOW_EVENT,
  buildStartFlowDetail,
  isAIQAVersion,
  isChatbotAvailable,
  isMarkedGood,
  reportTranslationIssue,
  setMarkedGood,
} from "../translationQA";

const POC_VERSION = AI_QA_VERSION_TITLES[0];
const SEGMENT = {
  sref: "Genesis 1:1",
  en: "In the beginning God created the heaven and the earth.",
  he: "בראשית ברא אלהים את השמים ואת הארץ",
};

describe("isAIQAVersion", function () {
  it("recognises a version under QA", function () {
    expect(isAIQAVersion(POC_VERSION)).toBe(true);
  });

  it.each([
    "The Contemporary Torah, JPS, 2006",
    "Sefaria AI Translation",          // near-miss on the POC title
    "",
    null,
    undefined,
    42,
  ])("does not recognise %p", function (versionTitle) {
    expect(isAIQAVersion(versionTitle)).toBe(false);
  });

  it("does not accept a currVersions entry, which is an object not a title", function () {
    // Sefaria's currVersions.en is {languageFamilyName, versionTitle}. Passing it
    // whole silently matched nothing; the gate must be given a resolved title string.
    expect(isAIQAVersion({languageFamilyName: "english", versionTitle: POC_VERSION})).toBe(false);
    expect(isAIQAVersion({versionTitle: POC_VERSION}.versionTitle)).toBe(true);
  });
});

describe("isChatbotAvailable", function () {
  it("is available for a logged-in reader with the chatbot enabled", function () {
    expect(isChatbotAvailable({chatbot_enabled: true, chatbot_user_token: "tok"})).toBe(true);
  });

  it.each([
    ["chatbot disabled", {chatbot_enabled: false, chatbot_user_token: "tok"}],
    ["not logged in", {chatbot_enabled: true, chatbot_user_token: ""}],
    ["neither", {}],
  ])("is unavailable when %s", function (_label, globals) {
    expect(isChatbotAvailable(globals)).toBe(false);
  });

  it("is unavailable when there is no Sefaria global at all", function () {
    expect(isChatbotAvailable(null)).toBe(false);
  });
});

describe("buildStartFlowDetail", function () {
  it("carries the flow, ref and both texts", function () {
    expect(buildStartFlowDetail(SEGMENT)).toEqual({
      flow: REPORT_ISSUE_FLOW,
      ref: "Genesis 1:1",
      en: SEGMENT.en,
      he: SEGMENT.he,
    });
  });

  it("sends the raw segment text, leaving the seed shape to the widget", function () {
    const detail = buildStartFlowDetail({...SEGMENT, en: "<b>In the beginning</b>"});
    expect(detail.en).toBe("<b>In the beginning</b>");
  });

  it("trims the ref", function () {
    expect(buildStartFlowDetail({...SEGMENT, sref: "  Genesis 1:1 "}).ref).toBe("Genesis 1:1");
  });

  it.each([
    ["no ref", {...SEGMENT, sref: ""}],
    ["blank ref", {...SEGMENT, sref: "   "}],
    ["neither text", {sref: "Genesis 1:1", en: "", he: ""}],
    ["nothing at all", {}],
    ["not an object", null],
  ])("declines to build a report with %s", function (_label, segment) {
    expect(buildStartFlowDetail(segment)).toBeNull();
  });

  it("builds a report for a segment with only one language", function () {
    expect(buildStartFlowDetail({sref: "Genesis 1:1", en: "text", he: ""})).not.toBeNull();
    expect(buildStartFlowDetail({sref: "Genesis 1:1", en: "", he: "טקסט"})).not.toBeNull();
  });
});

describe("reportTranslationIssue", function () {
  it("dispatches chatbot:start-flow on the document", function () {
    const received = [];
    const handler = (e) => received.push(e.detail);
    document.addEventListener(START_FLOW_EVENT, handler);

    const dispatched = reportTranslationIssue(SEGMENT);

    document.removeEventListener(START_FLOW_EVENT, handler);
    expect(dispatched).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      flow: REPORT_ISSUE_FLOW,
      ref: "Genesis 1:1",
      en: SEGMENT.en,
      he: SEGMENT.he,
    });
  });

  it("bubbles to the document when dispatched from a segment element", function () {
    const segmentEl = document.createElement("div");
    document.body.appendChild(segmentEl);
    const handler = jest.fn();
    document.addEventListener(START_FLOW_EVENT, handler);

    const dispatched = reportTranslationIssue(SEGMENT, segmentEl);

    document.removeEventListener(START_FLOW_EVENT, handler);
    segmentEl.remove();
    expect(dispatched).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("dispatches nothing for an unreportable segment", function () {
    const handler = jest.fn();
    document.addEventListener(START_FLOW_EVENT, handler);

    const dispatched = reportTranslationIssue({sref: "", en: "x"});

    document.removeEventListener(START_FLOW_EVENT, handler);
    expect(dispatched).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("marking a segment as reading well", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  it("starts unmarked", function () {
    expect(isMarkedGood("Genesis 1:1", POC_VERSION)).toBe(false);
  });

  it("remembers a mark", function () {
    setMarkedGood("Genesis 1:1", POC_VERSION, true);
    expect(isMarkedGood("Genesis 1:1", POC_VERSION)).toBe(true);
  });

  it("forgets when unmarked", function () {
    setMarkedGood("Genesis 1:1", POC_VERSION, true);
    setMarkedGood("Genesis 1:1", POC_VERSION, false);
    expect(isMarkedGood("Genesis 1:1", POC_VERSION)).toBe(false);
  });

  it("keeps marks separate per segment", function () {
    setMarkedGood("Genesis 1:1", POC_VERSION, true);
    expect(isMarkedGood("Genesis 1:2", POC_VERSION)).toBe(false);
  });

  it("keeps marks separate per version", function () {
    setMarkedGood("Genesis 1:1", POC_VERSION, true);
    expect(isMarkedGood("Genesis 1:1", "Some Other Version")).toBe(false);
  });

  it("degrades quietly when storage is unavailable", function () {
    const broken = {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
      removeItem() { throw new Error("SecurityError"); },
    };
    expect(isMarkedGood("Genesis 1:1", POC_VERSION, broken)).toBe(false);
    expect(() => setMarkedGood("Genesis 1:1", POC_VERSION, true, broken)).not.toThrow();
  });
});

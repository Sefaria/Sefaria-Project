/**
 * Jest Unit Tests: LearningLevelSurvey — error message display
 *
 * The error on this step used to render as an empty line (just the ⚠️ icon):
 * the message, a plain string, was passed as InterfaceText's `text` prop, which
 * only understands { en, he } objects. These tests make sure the text shows up.
 */

import React from "react";
import ReactDOMServer from "react-dom/server";
import LearningLevelSurvey from "../LearningLevelSurvey";
import { TEXT_KEYS, LEARNING_LEVELS } from "../textKeys";
import { enText, escapeHtml } from "../testSupport/i18nTestUtils";

jest.mock("../../sefaria/sefaria", () => ({
  interfaceLang: "english",
  _: (text) => require("../testSupport/i18nTestUtils").translate(text),
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
  site: false,
}));

jest.mock("../../Misc", () => ({
  // Behaves like the real InterfaceText: a `text` prop is read as { en, he }, so a
  // plain string passed there renders nothing. A friendlier mock would hide the bug.
  InterfaceText: ({ text, children }) => {
    if (text) {
      const { en, he } = text;
      return <span>{en || he}</span>;
    }
    return <span>{require("../testSupport/i18nTestUtils").translate(children)}</span>;
  },
  LoadingMessage: ({ message }) => <span>{message}</span>,
}));

jest.mock("../SelectableOption", () => {
  return function MockSelectableOption({ label }) {
    return <div>{label}</div>;
  };
});

const renderSurvey = (errorMessage) =>
  ReactDOMServer.renderToString(
    <LearningLevelSurvey
      learningLevels={LEARNING_LEVELS}
      selectedLevel={null}
      onLevelSelect={() => {}}
      onSave={() => {}}
      onSkip={() => {}}
      isSubmitting={false}
      errorMessage={errorMessage}
    />
  );

/** The rendered error box, or null when there isn't one. */
const errorBox = (html) => {
  const match = html.match(/<div class="learningLevelErrorMessage"[\s\S]*?<\/div>/);
  return match ? match[0] : null;
};

describe("LearningLevelSurvey error message", () => {
  it("shows the translated text for a TEXT_KEYS error", () => {
    const box = errorBox(renderSurvey(TEXT_KEYS.SELECT_LEARNING_LEVEL));

    expect(box).toContain(escapeHtml(enText(TEXT_KEYS.SELECT_LEARNING_LEVEL)));
  });

  it("shows the translated 'page expired' message", () => {
    const box = errorBox(renderSurvey(TEXT_KEYS.LEARNING_LEVEL_EXPIRED));

    expect(enText(TEXT_KEYS.LEARNING_LEVEL_EXPIRED)).not.toBe(TEXT_KEYS.LEARNING_LEVEL_EXPIRED);
    expect(box).toContain(escapeHtml(enText(TEXT_KEYS.LEARNING_LEVEL_EXPIRED)));
  });

  it("shows a plain server message as-is", () => {
    const box = errorBox(renderSurvey("Failed to connect to ActiveCampaign API"));

    expect(box).toContain("Failed to connect to ActiveCampaign API");
  });

  it("shows no error box when there is no error", () => {
    expect(errorBox(renderSurvey(null))).toBeNull();
  });
});

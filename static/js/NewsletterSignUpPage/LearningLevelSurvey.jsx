import React from "react";
import { InterfaceText, LoadingMessage } from "../Misc";
import SelectableOption from "./SelectableOption";
import Sefaria from "../sefaria/sefaria";
import { TEXT_KEYS } from "./textKeys";
import { InterfaceTextWithSlots } from "./InterfaceTextWithSlots";

/**
 * LearningLevelSurvey — optional radio-group form asking the user their learning level.
 *
 * Self-contained: owns its own <form>, error display, options, and action buttons.
 * Accepts plain primitives (no state-machine objects) so it can be reused in any context.
 *
 * Props:
 *   - learningLevels: [{ value, label, description }]   options to display
 *   - selectedLevel:  string | null                     currently-selected value
 *   - onLevelSelect:  (value) => void                   fires when a radio is clicked
 *   - onSave:         () => void                        fires on form submit
 *   - onSkip:         () => void                        fires when "skip" is clicked
 *   - isSubmitting:   boolean                           disables interactions and shows loading text
 *   - errorMessage:   string | null                     optional error: a TEXT_KEYS key (translated
 *                                                       by InterfaceText) or a plain server message
 */
export default function LearningLevelSurvey({
  learningLevels,
  selectedLevel,
  onLevelSelect,
  onSave,
  onSkip,
  isSubmitting,
  errorMessage,
}) {
  const submittingText = Sefaria._bilingual(TEXT_KEYS.SUBMITTING);
  return (
    <div
      className="embeddedLearningLevel"
      data-anl-batch={JSON.stringify({
        form_name: "learning_level_survey",
        engagement_type: "optional_profile_data",
      })}
    >
      {/* HEADER WITH OPTIONAL INDICATOR */}
      <div className="learningLevelHeaderWrapper">
        <h3 className="learningLevelHeader">
          <InterfaceText>{TEXT_KEYS.LEARNING_LEVEL_HEADER}</InterfaceText>
        </h3>
        <span className="optionalLabel">
          <InterfaceText>{TEXT_KEYS.OPTIONAL}</InterfaceText>
        </span>
      </div>

      {/* ERROR MESSAGE (if any) */}
      {errorMessage && (
        <div
          className="learningLevelErrorMessage"
          data-anl-event="form_error:scrollIntoView"
          data-anl-engagement_type="error"
          data-anl-form_name="learning_level_survey"
        >
          <span className="errorIcon">⚠️</span>
          <span>
            <InterfaceText>{errorMessage}</InterfaceText>
          </span>
        </div>
      )}

      <form
        className="learningLevelForm"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {/* RADIO OPTIONS */}
        <div className="learningLevelOptions">
          {learningLevels.map((level) => (
            <SelectableOption
              key={level.value}
              type="radio"
              name="learningLevel"
              value={level.value}
              label={<InterfaceText>{level.description}</InterfaceText>}
              isSelected={selectedLevel === level.value}
              onChange={() => onLevelSelect(level.value)}
              disabled={isSubmitting}
              analyticsAttributes={{
                "data-anl-event": "learning_level_selected:input",
                "data-anl-text": level.analyticsName,
                "data-anl-form_name": "learning_level_survey",
              }}
            />
          ))}
        </div>

        {/* ACTION BUTTONS */}
        <div className="learningLevelActions">
          <button
            type="submit"
            className="saveButton primary"
            disabled={isSubmitting || selectedLevel === null}
            data-anl-event="learning_level_action:click"
            data-anl-action="save_learning_level"
            data-anl-form_name="learning_level_survey"
          >
            {isSubmitting ? (
              // _bilingual resolves both languages at once — unlike _(), which only
              // answers for whichever language the page is in right now — so message/
              // heMessage get the real English/Hebrew pair, not the same string twice.
              <LoadingMessage message={submittingText.en} heMessage={submittingText.he} />
            ) : (
              <InterfaceText>{TEXT_KEYS.SUBMIT}</InterfaceText>
            )}
          </button>

          {/* SKIP OPTION - Disabled during submission to prevent concurrent actions */}
          <p className="skipPrompt">
            <InterfaceTextWithSlots
              id={TEXT_KEYS.SKIP_PROMPT}
              slots={{
                skip_link: (
                  <button
                    type="button"
                    className={`skipLink${isSubmitting ? " disabled" : ""}`}
                    onClick={onSkip}
                    disabled={isSubmitting}
                    data-anl-event="learning_level_action:click"
                    data-anl-action="skip_learning_level"
                    data-anl-form_name="learning_level_survey"
                  >
                    <InterfaceText>{TEXT_KEYS.SKIP_THIS_STEP}</InterfaceText>
                  </button>
                ),
              }}
            />
          </p>
        </div>
      </form>
    </div>
  );
}

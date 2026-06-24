import React from "react";
import { InterfaceText, LoadingMessage } from "../Misc";
import SelectableOption from "./SelectableOption";
import { BILINGUAL_TEXT } from "./bilingualUtils";

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
 *   - errorMessage:   { en, he } | null                 optional bilingual error to display
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
          <InterfaceText text={BILINGUAL_TEXT.LEARNING_LEVEL_HEADER} />
        </h3>
        <span className="optionalLabel">
          <InterfaceText text={BILINGUAL_TEXT.OPTIONAL} />
        </span>
      </div>

      {/* ERROR MESSAGE (if any) */}
      {errorMessage && (
        <div
          className="learningLevelErrorMessage"
          data-anl-event="form_error:displayed"
          data-anl-engagement_type="error"
          data-anl-form_name="learning_level_survey"
        >
          <span className="errorIcon">⚠️</span>
          <span>
            <InterfaceText text={errorMessage} />
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
              label={<InterfaceText text={level.description} />}
              isSelected={selectedLevel === level.value}
              onChange={() => onLevelSelect(level.value)}
              disabled={isSubmitting}
              analyticsAttributes={{
                "data-anl-event": "learning_level_selected:input",
                "data-anl-text": level.label.en,
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
              <LoadingMessage message={BILINGUAL_TEXT.SUBMITTING.en} heMessage={BILINGUAL_TEXT.SUBMITTING.he} />
            ) : (
              <InterfaceText text={BILINGUAL_TEXT.SUBMIT} />
            )}
          </button>

          {/* SKIP OPTION - Disabled during submission to prevent concurrent actions */}
          <p className="skipPrompt">
            <InterfaceText text={BILINGUAL_TEXT.OR_PREFIX} />{" "}
            <button
              type="button"
              className={`skipLink${isSubmitting ? " disabled" : ""}`}
              onClick={onSkip}
              disabled={isSubmitting}
              data-anl-event="learning_level_action:click"
              data-anl-action="skip_learning_level"
              data-anl-form_name="learning_level_survey"
            >
              <InterfaceText text={BILINGUAL_TEXT.SKIP_THIS_STEP} />
            </button>{" "}
            <InterfaceText text={BILINGUAL_TEXT.AND_GO_TO_HOMEPAGE} />
          </p>
        </div>
      </form>
    </div>
  );
}

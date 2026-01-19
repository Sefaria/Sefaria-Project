import React from 'react';
import { InterfaceText, LoadingMessage } from '../Misc';
import { BILINGUAL_TEXT } from './bilingualUtils';

/**
 * LearningLevelView - Stage 2b: Optional Learning Level Survey
 *
 * Displays optional learning level selection to help tailor content.
 * Features:
 * - Value proposition message explaining why we're asking
 * - Radio button group for 5 learning levels
 * - "Save my level" and "Skip" buttons with different outcomes
 * - Progressive disclosure: only shows this after newsletter selection
 * - Full bilingual support (English/Hebrew)
 * - Analytics tracking for learning level interactions
 */
export default function LearningLevelView({
  formStatus,
  selectedLevel,
  learningLevels,
  onLevelSelect,
  onSave,
  onSkip,
}) {
  const isSubmitting = formStatus.status === 'submitting';

  return (
    <div className="learningLevelView"
         data-anl-batch={JSON.stringify({
           form_name: 'learning_level_survey',
           engagement_type: 'optional_profile_data',
         })}>

      {/* HEADER SECTION */}
      <div className="learningLevelHeader">
        <h2 className="learningLevelTitle">
          <InterfaceText text={BILINGUAL_TEXT.HELP_TAILOR_CONTENT} />
        </h2>
        <p className="learningLevelSubtitle">
          <InterfaceText text={BILINGUAL_TEXT.OPTIONAL} />
        </p>
      </div>

      {/* VALUE PROPOSITION */}
      <p className="learningLevelDescription">
        <InterfaceText text={BILINGUAL_TEXT.LEARNING_LEVEL_SUBTITLE} />
      </p>

      {/* ERROR MESSAGE (if any) */}
      {formStatus.status === 'error' && formStatus.errorMessage && (
        <div className="learningLevelErrorMessage"
             data-anl-event="form_error:displayed"
             data-anl-engagement_type="error"
             data-anl-form_name="learning_level_survey">
          <span className="errorIcon">⚠️</span>
          <span>{formStatus.errorMessage}</span>
        </div>
      )}

      {/* RADIO OPTIONS */}
      <form className="learningLevelForm" onSubmit={(e) => { e.preventDefault(); onSave(true); }}>
        <div className="learningLevelOptions">
          {learningLevels.map((level) => (
            <label
              key={level.value}
              className={`learningLevelOption ${selectedLevel === level.value ? 'selected' : ''}`}>
              <input
                type="radio"
                name="learningLevel"
                value={level.value}
                checked={selectedLevel === level.value}
                onChange={() => onLevelSelect(level.value)}
                disabled={isSubmitting}
                data-anl-event="learning_level_selected:input"
                data-anl-text={level.label.en}
                data-anl-form_name="learning_level_survey"
              />
              <span className="levelContent">
                <span className="levelLabel">
                  <InterfaceText text={level.label} />
                </span>
                <span className="levelDescription">
                  <InterfaceText text={level.description} />
                </span>
              </span>
              <span className="selectedCheckmark">
                <img
                  src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
                  alt=""
                  aria-hidden="true"
                />
              </span>
            </label>
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
            data-anl-form_name="learning_level_survey">
            {isSubmitting ? <LoadingMessage message={BILINGUAL_TEXT.SAVING.en} heMessage={BILINGUAL_TEXT.SAVING.he} /> : <InterfaceText text={BILINGUAL_TEXT.SAVE_MY_LEVEL} />}
          </button>

          <button
            type="button"
            className="skipButton secondary"
            onClick={onSkip}
            disabled={isSubmitting}
            data-anl-event="learning_level_action:click"
            data-anl-action="skip_learning_level"
            data-anl-form_name="learning_level_survey">
            <InterfaceText text={BILINGUAL_TEXT.SKIP_TO_HOMEPAGE} />
          </button>
        </div>
      </form>
    </div>
  );
}

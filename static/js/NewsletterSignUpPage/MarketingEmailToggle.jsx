import React from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText, ToggleSet } from "../Misc";
import { TEXT_KEYS } from "./textKeys";

/**
 * MarketingEmailToggle - Yes/No toggle for marketing email opt-out
 *
 * Displayed only for logged-in users, below the newsletter checkboxes.
 * When "No" is selected, newsletter checkboxes become disabled (but remain visible).
 * On form submission with "No", all newsletter subscriptions are removed.
 *
 * Uses the existing ToggleSet component from Misc.jsx for consistent styling
 * and built-in keyboard navigation/accessibility.
 *
 * Props:
 * - wantsMarketingEmails: boolean - current toggle state (true = Yes, false = No)
 * - onToggle: function(boolean) - callback when toggle changes
 * - disabled: boolean - whether the toggle is disabled (e.g., during form submission)
 */
export default function MarketingEmailToggle({
  wantsMarketingEmails,
  onToggle,
  disabled = false,
}) {
  // Define toggle options for ToggleSet.
  // content accepts React elements; ariaLabel must be a plain string for aria-label attribute.
  const toggleOptions = [
    {
      name: "yes",
      content: <InterfaceText>{TEXT_KEYS.YES}</InterfaceText>,
      role: "radio",
      ariaLabel: Sefaria._(TEXT_KEYS.YES),
    },
    {
      name: "no",
      content: <InterfaceText>{TEXT_KEYS.NO}</InterfaceText>,
      role: "radio",
      ariaLabel: Sefaria._(TEXT_KEYS.NO),
    },
  ].map((option) => ({
    ...option,
    analyticsAttributes: disabled ? {} : {
      "data-anl-event": "marketing_email_preference:click",
      "data-anl-text": option.name,
      "data-anl-form_name": "newsletter_signup",
    },
  }));

  // Handle toggle change - convert string value to boolean
  const handleSetOption = (_, optionName) => {
    if (!disabled) {
      onToggle(optionName === "yes");
    }
  };

  // Convert boolean to string for ToggleSet currentValue
  const currentValue = wantsMarketingEmails ? "yes" : "no";

  return (
    <div
      className="marketingEmailToggleSection"
      data-testid="marketing-email-toggle-section"
    >
      <div className="marketingEmailToggleLabel">
        <InterfaceText>{TEXT_KEYS.MARKETING_EMAIL_QUESTION}</InterfaceText>
      </div>

      <div className={`marketingToggleWrapper${disabled ? " disabled" : ""}`}>
        <ToggleSet
          blueStyle={true}
          ariaLabel={Sefaria._(TEXT_KEYS.MARKETING_EMAIL_PREFERENCE)}
          name="marketingEmails"
          options={toggleOptions}
          setOption={handleSetOption}
          currentValue={currentValue}
        />
      </div>

      <div className="marketingEmailNote">
        <InterfaceText>{TEXT_KEYS.ADMIN_EMAILS_NOTE}</InterfaceText>
      </div>
    </div>
  );
}

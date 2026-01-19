import React from 'react';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText, ToggleSet } from '../Misc';
import { BILINGUAL_TEXT } from './bilingualUtils';

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
  // Get the current interface language for bilingual text
  const isHebrew = Sefaria.interfaceLang === 'hebrew';

  // Define toggle options for ToggleSet
  const toggleOptions = [
    {
      name: 'yes',
      content: isHebrew ? BILINGUAL_TEXT.YES.he : BILINGUAL_TEXT.YES.en,
      role: 'radio',
      ariaLabel: isHebrew ? BILINGUAL_TEXT.YES.he : BILINGUAL_TEXT.YES.en,
    },
    {
      name: 'no',
      content: isHebrew ? BILINGUAL_TEXT.NO.he : BILINGUAL_TEXT.NO.en,
      role: 'radio',
      ariaLabel: isHebrew ? BILINGUAL_TEXT.NO.he : BILINGUAL_TEXT.NO.en,
    },
  ];

  // Handle toggle change - convert string value to boolean
  const handleSetOption = (setName, optionName) => {
    if (!disabled) {
      onToggle(optionName === 'yes');
    }
  };

  // Convert boolean to string for ToggleSet currentValue
  const currentValue = wantsMarketingEmails ? 'yes' : 'no';

  return (
    <div
      className="marketingEmailToggleSection"
      data-testid="marketing-email-toggle-section"
    >
      <div className="marketingEmailToggleLabel">
        <InterfaceText text={BILINGUAL_TEXT.MARKETING_EMAIL_QUESTION} />
      </div>

      <div className={`marketingToggleWrapper${disabled ? ' disabled' : ''}`}>
        <ToggleSet
          blueStyle={true}
          ariaLabel={Sefaria._('Marketing email preference')}
          name="marketingEmails"
          options={toggleOptions}
          setOption={handleSetOption}
          currentValue={currentValue}
        />
      </div>

      <div className="marketingEmailNote">
        <InterfaceText text={BILINGUAL_TEXT.ADMIN_EMAILS_NOTE} />
      </div>
    </div>
  );
}

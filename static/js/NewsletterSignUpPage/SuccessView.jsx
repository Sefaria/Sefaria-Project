import React from 'react';
import { InterfaceText } from '../Misc';
import { BILINGUAL_TEXT } from './bilingualUtils';

/**
 * SuccessView - Final success view after form completion
 *
 * Displays completion message and redirect option to homepage.
 * Features:
 * - Success confirmation with icon
 * - Link to return to homepage
 * - Full bilingual support (English/Hebrew)
 * - Analytics tracking for completion
 */
export default function SuccessView() {
  return (
    <div className="successView"
         data-anl-batch={JSON.stringify({
           form_name: 'newsletter_signup_complete',
           engagement_type: 'form_complete',
         })}>

      {/* SUCCESS MESSAGE */}
      <div className="successContent">
        <div className="successIcon">
          <img
            src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
            alt=""
            aria-hidden="true"
          />
        </div>

        <h2 className="successTitle">
          <InterfaceText text={BILINGUAL_TEXT.ALL_SET} />
        </h2>

        <p className="successMessage">
          <InterfaceText text={BILINGUAL_TEXT.THANKS_FOR_JOINING} />
        </p>
      </div>

      {/* ACTION: Go to homepage - Centered button */}
      <div className="successActions">
        <a
          href="/"
          className="homepageLink primary"
          data-anl-event="completion_action:click"
          data-anl-action="go_to_homepage"
          data-anl-form_name="newsletter_signup_complete">
          <InterfaceText text={BILINGUAL_TEXT.RETURN_TO_SEFARIA} />
        </a>
      </div>
    </div>
  );
}

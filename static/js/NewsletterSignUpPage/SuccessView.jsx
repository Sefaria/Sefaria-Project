import React from "react";
import { InterfaceText } from "../Misc";
import { TEXT_KEYS } from "./textKeys";

/**
 * SuccessView - Final success view after form completion
 *
 * Displays completion message and redirect option to homepage.
 */
export default function SuccessView() {
  return (
    <div
      className="successView"
      data-anl-event="newsletter_signup_complete:scrollIntoView"
      data-anl-batch={JSON.stringify({
        form_name: "newsletter_signup_complete",
        engagement_type: "form_complete",
      })}
    >
      {/* SUCCESS MESSAGE */}
      <div className="successContent">
        <div className="successIcon">
          <img src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg" alt="" aria-hidden="true" />
        </div>

        <h2 className="successTitle">
          <InterfaceText>{TEXT_KEYS.ALL_SET}</InterfaceText>
        </h2>

        <p className="successMessage">
          <InterfaceText>{TEXT_KEYS.THANKS_FOR_JOINING}</InterfaceText>
        </p>
      </div>

      {/* ACTION: Go to homepage - Centered button */}
      <div className="successActions">
        <a
          href="/"
          className="homepageLink primary"
          data-anl-event="completion_action:click"
          data-anl-action="go_to_homepage"
          data-anl-form_name="newsletter_signup_complete"
        >
          <InterfaceText>{TEXT_KEYS.RETURN_TO_SEFARIA}</InterfaceText>
        </a>
      </div>
    </div>
  );
}

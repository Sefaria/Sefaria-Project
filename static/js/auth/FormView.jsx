import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import AuthCard from './AuthCard.jsx';
import ErrorBanner from './ErrorBanner.jsx';

/**
 * FormView — shared shell + state for every auth form: AuthCard + <form> +
 * ErrorBanner, owning the generic error/fieldErrors/submitting bookkeeping.
 *
 * Field errors can come from two places, both first-class: `onSubmit()` can
 * return `{ error, fieldErrors }` after a failed request, and `children` gets
 * a `setFieldError(name, message)` helper for validation that runs outside
 * the submit cycle (e.g. clearing/setting a mismatch error on blur). Either
 * path just updates the same `fieldErrors` state.
 *
 * `onSubmit()` returning nothing means the view already handled success
 * itself (redirect, view switch, etc). Anything that doesn't fit this shape
 * (e.g. RegisterView's captcha error) stays as separate local state there.
 *
 * While mounted, registers its own `setError` as where a directly-triggered Google/Apple
 * failure should surface (see `useProviderTriggers`) — those can fire asynchronously, after
 * whatever click started them, so "whichever view is currently active" has to be tracked
 * externally rather than passed as a one-off callback at click time.
 */
const FormView = ({
  cardClass, onBack, heading, sub, formId,
  registerGoogleTarget, triggerApple, setActiveErrorHandler, onLinkClick, onSubmit, children,
}) => {
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setActiveErrorHandler?.(setError);
    return () => setActiveErrorHandler?.(null);
  }, [setActiveErrorHandler]);

  const setFieldError = (name, message) => setFieldErrors((f) => ({ ...f, [name]: message }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await onSubmit();
      if (result?.error) setError(result.error);
      if (result?.fieldErrors) setFieldErrors(result.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard className={cardClass} onBack={onBack} heading={heading} sub={sub}>
      <form id={formId} className="sefaria-auth-email-form" onSubmit={handleSubmit} noValidate>
        <ErrorBanner
          error={error} registerGoogleTarget={registerGoogleTarget}
          triggerApple={triggerApple} onLinkClick={onLinkClick}
        />
        {children({ fieldErrors, submitting, setFieldError })}
      </form>
    </AuthCard>
  );
};

FormView.propTypes = {
  cardClass: PropTypes.string,
  onBack: PropTypes.func,
  heading: PropTypes.node,
  sub: PropTypes.node,
  formId: PropTypes.string,
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
  setActiveErrorHandler: PropTypes.func,
  onLinkClick: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  children: PropTypes.func.isRequired,
};

export default FormView;

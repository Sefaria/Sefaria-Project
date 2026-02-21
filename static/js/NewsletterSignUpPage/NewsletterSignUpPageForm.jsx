import React, { useState, useEffect, useRef } from 'react';
import Sefaria from '../sefaria/sefaria';
import { LoadingMessage } from '../Misc';
import NewsletterFormView from './NewsletterFormView';
import NewsletterConfirmationView from './NewsletterConfirmationView';
import SuccessView from './SuccessView';
import NewsletterAPI, { subscribeNewsletter, updatePreferences, updateLearningLevel, fetchUserSubscriptions, getNewsletterLists } from './newsletterApi';

/**
 * NEWSLETTER CONFIGURATION
 * Defines available newsletters with metadata and icons
 * Labels are translatable using Sefaria._()
 */
const NEWSLETTERS = [
  { key: 'sefaria_news', labelKey: 'Sefaria News & Resources', icon: 'news-and-resources.svg' },
  { key: 'educator_resources', labelKey: 'Educator Resources', icon: 'educator-resources.svg' },
  { key: 'text_updates', labelKey: 'New Text Updates', icon: 'new-text-release-updates.svg' },
  { key: 'parashah_series', labelKey: 'Weekly Parashah Study Series', icon: 'weekly-study-guide.svg' },
  { key: 'tech_updates', labelKey: 'Technology and Developer Updates', icon: 'technology-updates.svg' },
  { key: 'timeless_topics', labelKey: 'Timeless Topics', icon: 'timeless-topics.svg' },
];

/**
 * LEARNING LEVELS
 * Defines the learning level options presented to users
 * Each level has bilingual label and description
 */
const LEARNING_LEVELS = [
  {
    value: 1,
    label: {
      en: 'Newcomer',
      he: 'מתחיל',
    },
    description: {
      en: 'I need significant guidance and translation to navigate and study the texts in the Jewish library.',
      he: 'אני צריך הנחיה משמעותית ותרגום כדי לנווט ללמוד טקסטים בספרייה היהודית.',
    },
  },
  {
    value: 2,
    label: {
      en: 'Beginner',
      he: 'חדש',
    },
    description: {
      en: 'I need translation and contextual information to navigate and study the Jewish library.',
      he: 'אני צריך תרגום ומידע הקשרי כדי לנווט ללמוד את הספרייה היהודית.',
    },
  },
  {
    value: 3,
    label: {
      en: 'Intermediate',
      he: 'ביניים',
    },
    description: {
      en: 'I can navigate the library but need translation and/or context for meaningful study.',
      he: 'אני יכול לנווט בספרייה אך אני צריך תרגום ו/או הקשר ללימוד משמעותי.',
    },
  },
  {
    value: 4,
    label: {
      en: 'Advanced',
      he: 'מתקדם',
    },
    description: {
      en: 'I can easily navigate the Jewish library but benefit from translation and/or context in some cases.',
      he: 'אני יכול לנווט בקלות בספרייה היהודית אך מקבל תועלת מתרגום ו/או הקשר במקרים מסוימים.',
    },
  },
  {
    value: 5,
    label: {
      en: 'Expert',
      he: 'מומחה',
    },
    description: {
      en: 'I can easily study the texts of the Jewish library independently in their original language.',
      he: 'אני יכול בקלות ללמוד את הטקסטים של הספרייה היהודית באופן עצמאי בשפתם המקורית.',
    },
  },
];

/**
 * NewsletterSignUpPageForm - Main container component
 *
 * Manages the entire form flow with state machine pattern:
 * - Detects user authentication status (logged-in vs. logged-out)
 * - Manages form data state (user inputs)
 * - Manages form status state (current stage, submission status, errors)
 * - Routes between different views based on current stage
 * - Handles API calls with mocked endpoints
 */
export default function NewsletterSignUpPageForm() {
  // ========== FORM DATA STATE ==========
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    confirmEmail: '',
    selectedNewsletters: {},
    learningLevel: null,
    wantsMarketingEmails: true, // Default to opted-in for marketing emails
  });

  // ========== FORM STATUS STATE (STATE MACHINE) ==========
  const [formStatus, setFormStatus] = useState({
    currentStage: 'newsletter_selection', // 'newsletter_selection' | 'confirmation' | 'success'
    status: 'idle', // 'idle' | 'submitting' | 'success' | 'error'
    errorMessage: null,
    successMessage: null,
    isLoggedIn: false,
    userEmail: null,
  });

  // ========== VALIDATION STATE ==========
  // Tracks per-field validation errors and whether user has attempted submit
  const [validationState, setValidationState] = useState({
    fieldErrors: {},        // { firstName: 'error', email: 'error', ... }
    hasAttemptedSubmit: false,  // Only show errors after first submit attempt
  });

  // ========== DYNAMIC NEWSLETTER LIST ==========
  const [newsletters, setNewsletters] = useState(NEWSLETTERS);
  const [newslettersLoading, setNewslettersLoading] = useState(!NewsletterAPI.isMockMode());

  // Ref for focusing error summary on validation failure (accessibility)
  const errorSummaryRef = useRef(null);

  // Baseline snapshots for computing subscription diffs (logged-in users only).
  // Refs because these are write-once values that never drive rendering.
  const initialSubscriptionsRef = useRef({});
  const initialWantsMarketingRef = useRef(true);

  // ========== INITIALIZATION: Detect authentication status ==========
  useEffect(() => {
    // Fetch newsletter list dynamically from AC API (real mode only)
    if (!NewsletterAPI.isMockMode()) {
      getNewsletterLists()
        .then(response => {
          if (response.newsletters) {
            const mapped = response.newsletters.map(nl => ({
              key: nl.stringid,
              labelKey: nl.displayName,
              icon: nl.icon,
            }));
            setNewsletters(mapped);
          }
        })
        .catch(error => {
          console.error('Failed to fetch newsletter lists, using defaults:', error);
        })
        .finally(() => {
          setNewslettersLoading(false);
        });
    }

    // Check if user is logged in via Sefaria global object
    const isLoggedIn = !!Sefaria._uid;
    const userEmail = isLoggedIn ? Sefaria._email : null;

    setFormStatus(prev => ({
      ...prev,
      isLoggedIn,
      userEmail,
    }));

    // If logged in, pre-fill email and fetch current subscriptions
    if (isLoggedIn) {
      setFormData(prev => ({
        ...prev,
        email: userEmail,
      }));

      // Fetch user's current subscriptions from the API
      fetchUserSubscriptions(userEmail)
        .then(response => {
          if (response.success && response.subscribedNewsletters) {
            // Convert array of newsletter keys to object mapping
            const selectedNewsletters = {};
            response.subscribedNewsletters.forEach(key => {
              selectedNewsletters[key] = true;
            });

            // Stale opt-out detection: if backend says opted-out but user has
            // active managed subscriptions (re-subscribed via another channel),
            // show as opted-in. The MongoDB value is NOT corrected until user submits.
            const backendWantsMarketing = response.wantsMarketingEmails ?? true;
            const hasActiveManagedSubscription = response.subscribedNewsletters.length > 0;
            const effectiveWantsMarketing = !backendWantsMarketing && hasActiveManagedSubscription
              ? true
              : backendWantsMarketing;

            // Snapshot the initial state for diff computation on submit
            initialSubscriptionsRef.current = { ...selectedNewsletters };
            initialWantsMarketingRef.current = effectiveWantsMarketing;

            setFormData(prev => ({
              ...prev,
              selectedNewsletters,
              wantsMarketingEmails: effectiveWantsMarketing,
              learningLevel: response.learningLevel ?? null,
            }));
          }
        })
        .catch(error => {
          // Log error but don't break the form
          console.error('Failed to fetch user subscriptions:', error);
        });
    }
  }, []);

  // ========== HANDLERS: Form data updates ==========
  // Note: Errors are cleared on blur, not on change, for better UX

  const handleFirstNameChange = (value) => {
    setFormData(prev => ({ ...prev, firstName: value }));
  };

  const handleLastNameChange = (value) => {
    setFormData(prev => ({ ...prev, lastName: value }));
  };

  const handleEmailChange = (value) => {
    setFormData(prev => ({ ...prev, email: value }));
  };

  const handleConfirmEmailChange = (value) => {
    setFormData(prev => ({ ...prev, confirmEmail: value }));
  };

  const handleNewsletterToggle = (key) => {
    setFormData(prev => ({
      ...prev,
      selectedNewsletters: {
        ...prev.selectedNewsletters,
        [key]: !prev.selectedNewsletters[key],
      },
    }));
  };

  const handleMarketingEmailToggle = (wantsEmails) => {
    setFormData(prev => ({
      ...prev,
      wantsMarketingEmails: wantsEmails,
    }));
  };

  const handleLearningLevelSelect = (level) => {
    setFormData(prev => ({ ...prev, learningLevel: level }));
  };

  // ========== HANDLERS: Field blur validation ==========

  /**
   * Validates a specific field on blur and updates validation state.
   * Only runs if user has already attempted to submit (to avoid premature errors).
   * @param {string} fieldName - The name of the field that lost focus
   */
  const handleFieldBlur = (fieldName) => {
    // Only validate if user has already attempted submit
    if (!validationState.hasAttemptedSubmit) return;

    const fieldValidators = {
      firstName: () => {
        if (!formStatus.isLoggedIn && !formData.firstName.trim()) {
          return 'Please enter your first name.';
        }
        return null;
      },
      email: () => {
        if (!formData.email.trim()) {
          return 'Please enter your email address.';
        }
        if (!Sefaria.util.isValidEmailAddress(formData.email)) {
          return 'Please enter a valid email address.';
        }
        return null;
      },
      confirmEmail: () => {
        if (!formStatus.isLoggedIn && formData.email !== formData.confirmEmail) {
          return 'Email addresses do not match.';
        }
        return null;
      },
      newsletters: () => {
        if (!formStatus.isLoggedIn) {
          const hasSelection = Object.values(formData.selectedNewsletters).some(v => v);
          if (!hasSelection) {
            return 'Please select at least one newsletter.';
          }
        }
        return null;
      },
    };

    const validator = fieldValidators[fieldName];
    if (validator) {
      const error = validator();
      setValidationState(prev => {
        const newErrors = { ...prev.fieldErrors };
        if (error) {
          newErrors[fieldName] = error;
        } else {
          delete newErrors[fieldName];
        }
        return { ...prev, fieldErrors: newErrors };
      });
    }
  };

  // ========== HANDLERS: Form submission ==========

  const handleSubscribeSubmit = async () => {
    // Validate all fields and get errors object
    const errors = validateFormData();
    const hasErrors = Object.keys(errors).length > 0;

    // Update validation state with all errors and mark that submit was attempted
    setValidationState({
      fieldErrors: errors,
      hasAttemptedSubmit: true,
    });

    if (hasErrors) {
      // Set form status to error (for any legacy UI handling)
      setFormStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: null, // Clear old single-error message, we use fieldErrors now
      }));

      // Focus the error summary for accessibility
      // Use setTimeout to ensure the DOM has updated
      setTimeout(() => {
        errorSummaryRef.current?.focus();
      }, 0);
      return;
    }

    // For logged-in users: skip API call if nothing actually changed
    if (formStatus.isLoggedIn) {
      const diffs = getSubscriptionDiffs();
      const optOutChanged = formData.wantsMarketingEmails !== initialWantsMarketingRef.current;

      if (diffs.added.length === 0 && diffs.removed.length === 0 && !optOutChanged) {
        setFormStatus(prev => ({ ...prev, currentStage: 'confirmation' }));
        return;
      }
    }

    // Clear any previous error state and prepare for submission
    setFormStatus(prev => ({ ...prev, status: 'submitting', errorMessage: null }));

    // Always send actual selections; backend handles opt-out via marketingOptOut flag
    const newslettersToSubmit = formData.selectedNewsletters;

    try {
      if (formStatus.isLoggedIn) {
        // For logged-in users: update preferences
        // Pass marketingOptOut flag to indicate intent when newsletters is empty
        await updatePreferences(formStatus.userEmail, newslettersToSubmit, {
          marketingOptOut: !formData.wantsMarketingEmails,
        });
      } else {
        // For logged-out users: subscribe
        await subscribeNewsletter({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          newsletters: formData.selectedNewsletters,
        });
      }

      // Success! Move to confirmation view
      setFormStatus(prev => ({
        ...prev,
        status: 'success',
        currentStage: 'confirmation',
        successMessage: `We've sent a confirmation to ${formData.email}. You should see it soon.`,
      }));
    } catch (error) {
      // Error during submission
      setFormStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: error.message || 'Sorry, there was an error. Please try again.',
      }));
    }
  };

  const handleLearningLevelSubmit = async (shouldSave) => {
    if (!shouldSave) {
      // User clicked "No thanks" - go straight to success
      setFormStatus(prev => ({
        ...prev,
        currentStage: 'success',
      }));
      return;
    }

    if (formData.learningLevel === null) {
      setFormStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Please select a learning level.',
      }));
      return;
    }

    setFormStatus(prev => ({ ...prev, status: 'submitting' }));

    try {
      await updateLearningLevel(formData.email, formData.learningLevel);

      setFormStatus(prev => ({
        ...prev,
        status: 'success',
        currentStage: 'success',
      }));
    } catch (error) {
      setFormStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: error.message || 'Sorry, there was an error. Please try again.',
      }));
    }
  };

  const handleSkipLearningLevel = () => {
    // Go directly to success view without saving learning level
    setFormStatus(prev => ({
      ...prev,
      currentStage: 'success',
    }));
  };

  // ========== VALIDATION ==========

  /**
   * Validates all form fields and returns an object of errors.
   * Returns empty object if all fields are valid.
   * @returns {Object} - { fieldName: errorMessage } for each invalid field
   */
  const validateFormData = () => {
    const errors = {};

    // First name (logged-out only)
    if (!formStatus.isLoggedIn && !formData.firstName.trim()) {
      errors.firstName = 'Please enter your first name.';
    }

    // Email
    if (!formData.email.trim()) {
      errors.email = 'Please enter your email address.';
    } else if (!Sefaria.util.isValidEmailAddress(formData.email)) {
      errors.email = 'Please enter a valid email address.';
    }

    // Confirm email (logged-out only)
    if (!formStatus.isLoggedIn && formData.email !== formData.confirmEmail) {
      errors.confirmEmail = 'Email addresses do not match.';
    }

    // Newsletter selection (logged-out only)
    if (!formStatus.isLoggedIn) {
      const hasSelection = Object.values(formData.selectedNewsletters).some(v => v);
      if (!hasSelection) {
        errors.newsletters = 'Please select at least one newsletter.';
      }
    }

    return errors;  // Empty object = valid
  };

  // ========== HELPERS: Subscription diff computation ==========

  /**
   * Computes the set differences between initial and current newsletter selections.
   * Returns human-readable labels for added and removed newsletters.
   */
  const getSubscriptionDiffs = () => {
    const initial = initialSubscriptionsRef.current;
    const current = formData.selectedNewsletters;

    const labelForKey = (key) => {
      const nl = newsletters.find(n => n.key === key);
      return nl ? Sefaria._(nl.labelKey) : key;
    };

    const added = Object.keys(current)
      .filter(key => current[key] && !initial[key])
      .map(labelForKey);

    const removed = Object.keys(initial)
      .filter(key => initial[key] && !current[key])
      .map(labelForKey);

    return { added, removed };
  };

  // ========== RENDER: View routing based on current stage ==========

  const getSelectedNewsletterLabels = () => {
    return Object.entries(formData.selectedNewsletters)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => {
        const newsletter = newsletters.find(n => n.key === key);
        return newsletter ? Sefaria._(newsletter.labelKey) : key;
      })
      .join(', ');
  };

  return (
    <div className="newsletterSignUpPageForm">
      {formStatus.currentStage === 'newsletter_selection' && newslettersLoading && (
        <LoadingMessage />
      )}

      {formStatus.currentStage === 'newsletter_selection' && !newslettersLoading && (
        <NewsletterFormView
          formData={formData}
          formStatus={formStatus}
          newsletters={newsletters}
          isLoggedIn={formStatus.isLoggedIn}
          userEmail={formStatus.userEmail}
          fieldErrors={validationState.fieldErrors}
          hasAttemptedSubmit={validationState.hasAttemptedSubmit}
          errorSummaryRef={errorSummaryRef}
          onFirstNameChange={handleFirstNameChange}
          onLastNameChange={handleLastNameChange}
          onEmailChange={handleEmailChange}
          onConfirmEmailChange={handleConfirmEmailChange}
          onNewsletterToggle={handleNewsletterToggle}
          onMarketingEmailToggle={handleMarketingEmailToggle}
          onFieldBlur={handleFieldBlur}
          onSubmit={handleSubscribeSubmit}
        />
      )}

      {formStatus.currentStage === 'confirmation' && (
        <NewsletterConfirmationView
          email={formData.email}
          selectedNewsletters={formData.selectedNewsletters}
          newsletters={newsletters}
          selectedNewsletterLabels={getSelectedNewsletterLabels()}
          formStatus={formStatus}
          selectedLevel={formData.learningLevel}
          learningLevels={LEARNING_LEVELS}
          onLevelSelect={handleLearningLevelSelect}
          onSave={handleLearningLevelSubmit}
          onSkip={handleSkipLearningLevel}
          isLoggedIn={formStatus.isLoggedIn}
          subscriptionDiffs={formStatus.isLoggedIn ? getSubscriptionDiffs() : null}
          marketingOptOut={!formData.wantsMarketingEmails}
        />
      )}

      {formStatus.currentStage === 'success' && (
        <SuccessView />
      )}
    </div>
  );
}

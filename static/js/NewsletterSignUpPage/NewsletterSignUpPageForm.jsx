import React, { useState, useEffect } from 'react';
import Sefaria from '../sefaria/sefaria';
import NewsletterFormView from './NewsletterFormView';
import NewsletterConfirmationView from './NewsletterConfirmationView';
import SuccessView from './SuccessView';
import { subscribeNewsletter, updatePreferences, updateLearningLevel, fetchUserSubscriptions } from './newsletterApi';

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

  // ========== INITIALIZATION: Detect authentication status ==========
  useEffect(() => {
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

      // Fetch user's current subscriptions from the mocked API
      // In production, this would call the real backend API
      fetchUserSubscriptions(userEmail)
        .then(response => {
          if (response.success && response.subscribedNewsletters) {
            // Convert array of newsletter keys to object mapping
            const selectedNewsletters = {};
            response.subscribedNewsletters.forEach(key => {
              selectedNewsletters[key] = true;
            });

            setFormData(prev => ({
              ...prev,
              selectedNewsletters,
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

  const handleFirstNameChange = (value) => {
    setFormData(prev => ({ ...prev, firstName: value }));
    // Clear error on field change
    if (formStatus.errorMessage) {
      setFormStatus(prev => ({ ...prev, errorMessage: null }));
    }
  };

  const handleLastNameChange = (value) => {
    setFormData(prev => ({ ...prev, lastName: value }));
  };

  const handleEmailChange = (value) => {
    setFormData(prev => ({ ...prev, email: value }));
    // Clear error on field change
    if (formStatus.errorMessage) {
      setFormStatus(prev => ({ ...prev, errorMessage: null }));
    }
  };

  const handleConfirmEmailChange = (value) => {
    setFormData(prev => ({ ...prev, confirmEmail: value }));
    // Clear error on field change
    if (formStatus.errorMessage) {
      setFormStatus(prev => ({ ...prev, errorMessage: null }));
    }
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

  const handleLearningLevelSelect = (level) => {
    setFormData(prev => ({ ...prev, learningLevel: level }));
  };

  // ========== HANDLERS: Form submission ==========

  const handleSubscribeSubmit = async () => {
    // Validate form data
    const validationError = validateFormData();
    if (validationError) {
      setFormStatus(prev => ({
        ...prev,
        status: 'error',
        errorMessage: validationError,
      }));
      return;
    }

    // Prepare payload
    setFormStatus(prev => ({ ...prev, status: 'submitting' }));

    try {
      if (formStatus.isLoggedIn) {
        // For logged-in users: update preferences
        await updatePreferences(formStatus.userEmail, formData.selectedNewsletters);
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

  const validateFormData = () => {
    // Logged-out users need to provide first name
    if (!formStatus.isLoggedIn && !formData.firstName.trim()) {
      return 'Please enter your first name.';
    }

    if (!formData.email.trim()) {
      return 'Please enter your email address.';
    }

    if (!Sefaria.util.isValidEmailAddress(formData.email)) {
      return 'Please enter a valid email address.';
    }

    // Check email confirmation matches (only for logged-out users)
    if (!formStatus.isLoggedIn && formData.email !== formData.confirmEmail) {
      return 'Email addresses do not match.';
    }

    // Check at least one newsletter is selected
    const hasSelection = Object.values(formData.selectedNewsletters).some(v => v);
    if (!hasSelection) {
      return 'Please select at least one newsletter.';
    }

    return null;
  };

  // ========== RENDER: View routing based on current stage ==========

  const getSelectedNewsletterLabels = () => {
    return Object.entries(formData.selectedNewsletters)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => {
        const newsletter = NEWSLETTERS.find(n => n.key === key);
        return newsletter ? Sefaria._(newsletter.labelKey) : key;
      })
      .join(', ');
  };

  return (
    <div className="newsletterSignUpPageForm">
      {formStatus.currentStage === 'newsletter_selection' && (
        <NewsletterFormView
          formData={formData}
          formStatus={formStatus}
          newsletters={NEWSLETTERS}
          isLoggedIn={formStatus.isLoggedIn}
          userEmail={formStatus.userEmail}
          onFirstNameChange={handleFirstNameChange}
          onLastNameChange={handleLastNameChange}
          onEmailChange={handleEmailChange}
          onConfirmEmailChange={handleConfirmEmailChange}
          onNewsletterToggle={handleNewsletterToggle}
          onSubmit={handleSubscribeSubmit}
        />
      )}

      {formStatus.currentStage === 'confirmation' && (
        <NewsletterConfirmationView
          email={formData.email}
          selectedNewsletters={formData.selectedNewsletters}
          selectedNewsletterLabels={getSelectedNewsletterLabels()}
          formStatus={formStatus}
          selectedLevel={formData.learningLevel}
          learningLevels={LEARNING_LEVELS}
          onLevelSelect={handleLearningLevelSelect}
          onSave={handleLearningLevelSubmit}
          onSkip={handleSkipLearningLevel}
        />
      )}

      {formStatus.currentStage === 'success' && (
        <SuccessView />
      )}
    </div>
  );
}

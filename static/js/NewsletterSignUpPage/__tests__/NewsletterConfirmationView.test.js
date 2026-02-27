/**
 * Jest Unit Tests: NewsletterConfirmationView - Subscription Diff Display
 *
 * Tests the conditional rendering logic that shows subscription diffs
 * for logged-in users vs. the flat "subscribed to" list for logged-out users.
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import NewsletterConfirmationView from '../NewsletterConfirmationView';
import { FORM_STATUS } from '../constants';

// Mock Sefaria global object
jest.mock('../../sefaria/sefaria', () => ({
  interfaceLang: 'english',
  _: (text) => text,
  site: false,
}));

// Set up global Sefaria object for components that use it
global.Sefaria = {
  _: (text) => text, // Simple pass-through for translation function
  interfaceLang: 'english',
  site: false,
};

// Mock components from Misc
jest.mock('../../Misc', () => ({
  InterfaceText: ({ text, children }) => {
    if (text) {
      return <span className="int-en">{text.en || text}</span>;
    }
    return <span className="int-en">{children}</span>;
  },
  LoadingMessage: ({ message }) => <span>{message || 'Loading...'}</span>,
}));

// Mock SelectableOption (used by learning level radio buttons)
jest.mock('../SelectableOption', () => {
  return function MockSelectableOption({ label, value, isSelected }) {
    return <div data-testid={`option-${value}`} className={isSelected ? 'selected' : ''}>{label}</div>;
  };
});

// ========== SHARED TEST FIXTURES ==========

const NEWSLETTERS = [
  { key: 'sefaria_news', labelKey: 'Sefaria News & Resources' },
  { key: 'educator_resources', labelKey: 'Educator Resources' },
  { key: 'parashah_series', labelKey: 'Weekly Parashah Study Series' },
];

const LEARNING_LEVELS = [
  { value: 1, label: { en: 'Newcomer', he: 'מתחיל' }, description: { en: 'Newcomer desc', he: 'תיאור' } },
];

const baseProps = {
  email: 'test@example.com',
  newsletters: NEWSLETTERS,
  formStatus: { status: FORM_STATUS.SUCCESS, isLoggedIn: false },
  selectedLevel: null,
  learningLevels: LEARNING_LEVELS,
  onLevelSelect: jest.fn(),
  onSave: jest.fn(),
  onSkip: jest.fn(),
};

// Helper to render with specific props and return HTML string
const renderView = (overrides = {}) => {
  return ReactDOMServer.renderToString(
    <NewsletterConfirmationView {...baseProps} {...overrides} />
  );
};

// ========== TESTS ==========

describe('NewsletterConfirmationView - Subscription Display', () => {

  describe('Logged-out users (original behavior)', () => {
    it('shows "subscribed to" with all selected newsletter labels', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        selectedNewsletterLabels: 'Sefaria News & Resources, Educator Resources',
        subscriptionDiffs: null,
      });

      expect(html).toContain("You&#x27;ve subscribed to:");
      expect(html).toContain('Sefaria News &amp; Resources, Educator Resources');
    });

    it('does not show "unsubscribed from" text', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true },
        selectedNewsletterLabels: 'Sefaria News & Resources',
        subscriptionDiffs: null,
      });

      expect(html).not.toContain('unsubscribed from');
    });

    it('does not show "up to date" text', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true },
        selectedNewsletterLabels: 'Sefaria News & Resources',
        subscriptionDiffs: null,
      });

      expect(html).not.toContain('up to date');
    });

    it('hides newsletter display when no labels provided', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: {},
        selectedNewsletterLabels: '',
        subscriptionDiffs: null,
      });

      expect(html).not.toContain("You&#x27;ve subscribed to:");
    });
  });

  describe('Logged-in users - added newsletters only', () => {
    it('shows "subscribed to" with only the newly added newsletters', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        selectedNewsletterLabels: 'Sefaria News & Resources, Educator Resources',
        subscriptionDiffs: {
          added: ['Educator Resources'],
          removed: [],
        },
      });

      expect(html).toContain("You&#x27;ve subscribed to:");
      expect(html).toContain('Educator Resources');
    });

    it('does not show "unsubscribed from" block', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        selectedNewsletterLabels: 'all',
        subscriptionDiffs: {
          added: ['Educator Resources'],
          removed: [],
        },
      });

      expect(html).not.toContain('unsubscribed from');
    });
  });

  describe('Logged-in users - removed newsletters only', () => {
    it('shows "unsubscribed from" with only the removed newsletters', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        selectedNewsletterLabels: 'Sefaria News & Resources',
        subscriptionDiffs: {
          added: [],
          removed: ['Educator Resources'],
        },
      });

      expect(html).toContain('unsubscribed from');
      expect(html).toContain('Educator Resources');
    });

    it('does not show "subscribed to" block', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        selectedNewsletterLabels: '',
        subscriptionDiffs: {
          added: [],
          removed: ['Sefaria News & Resources'],
        },
      });

      expect(html).not.toContain("You&#x27;ve subscribed to:");
    });
  });

  describe('Logged-in users - added and removed', () => {
    it('shows both "subscribed to" and "unsubscribed from" blocks', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { educator_resources: true },
        selectedNewsletterLabels: 'Educator Resources',
        subscriptionDiffs: {
          added: ['Educator Resources'],
          removed: ['Sefaria News & Resources'],
        },
      });

      expect(html).toContain("You&#x27;ve subscribed to:");
      expect(html).toContain('Educator Resources');
      expect(html).toContain('unsubscribed from');
      expect(html).toContain('Sefaria News &amp; Resources');
    });
  });

  describe('Logged-in users - no changes', () => {
    it('shows "preferences are up to date" when nothing changed', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        selectedNewsletterLabels: 'Sefaria News & Resources',
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: false,
      });

      expect(html).toContain('up to date');
    });

    it('does not show "subscribed to" or "unsubscribed from"', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        selectedNewsletterLabels: 'Sefaria News & Resources',
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: false,
      });

      expect(html).not.toContain("You&#x27;ve subscribed to:");
      expect(html).not.toContain('unsubscribed from');
    });
  });

  describe('Logged-in users - marketing opt-out', () => {
    it('shows opt-out message when marketingOptOut is true', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        selectedNewsletterLabels: '',
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).toContain('opted out of marketing emails');
    });

    it('does not show "up to date" when marketing opt-out is the only change', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        selectedNewsletterLabels: '',
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).not.toContain('up to date');
    });

    it('shows opt-out message alongside subscription diffs', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { educator_resources: true },
        selectedNewsletterLabels: 'Educator Resources',
        subscriptionDiffs: {
          added: ['Educator Resources'],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).toContain("You&#x27;ve subscribed to:");
      expect(html).toContain('Educator Resources');
      expect(html).toContain('opted out of marketing emails');
    });
  });

  describe('Multiple newsletters in diff lists', () => {
    it('joins multiple added newsletters with commas', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true, parashah_series: true },
        selectedNewsletterLabels: 'all',
        subscriptionDiffs: {
          added: ['Sefaria News & Resources', 'Educator Resources', 'Weekly Parashah Study Series'],
          removed: [],
        },
      });

      expect(html).toContain('Sefaria News &amp; Resources, Educator Resources, Weekly Parashah Study Series');
    });

    it('joins multiple removed newsletters with commas', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        selectedNewsletterLabels: '',
        subscriptionDiffs: {
          added: [],
          removed: ['Sefaria News & Resources', 'Educator Resources'],
        },
      });

      expect(html).toContain('Sefaria News &amp; Resources, Educator Resources');
    });
  });
});

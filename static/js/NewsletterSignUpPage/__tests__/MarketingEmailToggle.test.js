/**
 * Jest Unit Tests: MarketingEmailToggle Component
 *
 * Tests the marketing email opt-out toggle that appears for logged-in users
 * on the newsletter signup page.
 *
 * Note: This component now uses the existing ToggleSet component from Misc.jsx
 * with blueStyle for consistent styling across the app.
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import MarketingEmailToggle from '../MarketingEmailToggle';

// Mock Sefaria global object
jest.mock('../../sefaria/sefaria', () => ({
  interfaceLang: 'english',
  _: (text) => text,
  site: false,
}));

// Mock the components from Misc
jest.mock('../../Misc', () => ({
  // Mock InterfaceText to render the English text directly
  InterfaceText: ({ text, children }) => {
    if (text) {
      return <span className="int-en">{text.en || text}</span>;
    }
    return <span className="int-en">{children}</span>;
  },
  // Mock ToggleSet for toggle functionality
  ToggleSet: ({ blueStyle, ariaLabel, name, options, setOption, currentValue }) => (
    <div
      className={`toggleSet ${blueStyle ? 'blueStyle' : ''} ${name}`}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid="toggle-set"
    >
      {options.map((option) => (
        <div
          key={option.name}
          className={`toggleOption ${option.name} ${currentValue === option.name ? 'on' : ''}`}
          role={option.role}
          aria-label={option.ariaLabel}
          aria-checked={currentValue === option.name}
          onClick={() => setOption(name, option.name)}
          data-testid={`toggle-option-${option.name}`}
        >
          {option.content}
        </div>
      ))}
    </div>
  ),
}));

describe('MarketingEmailToggle', () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('marketingEmailToggleSection');
    });

    it('renders the ToggleSet with blueStyle', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('toggleSet');
      expect(html).toContain('blueStyle');
    });

    it('renders Yes option with "on" class when wantsMarketingEmails is true', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      // Yes option should have "on" class
      expect(html).toMatch(/class="[^"]*toggleOption[^"]*yes[^"]*on[^"]*"/);
    });

    it('renders No option with "on" class when wantsMarketingEmails is false', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={false}
          onToggle={mockOnToggle}
        />
      );
      // No option should have "on" class
      expect(html).toMatch(/class="[^"]*toggleOption[^"]*no[^"]*on[^"]*"/);
    });

    it('renders the question label about email updates', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('marketingEmailToggleLabel');
      expect(html).toContain('Do you want to receive email updates from Sefaria');
    });

    it('renders helper text about administrative emails', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('marketingEmailNote');
      expect(html).toContain('administrative emails');
    });

    it('renders both Yes and No options', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('data-testid="toggle-option-yes"');
      expect(html).toContain('data-testid="toggle-option-no"');
    });
  });

  describe('Disabled state', () => {
    it('adds disabled class to wrapper when disabled prop is true', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
          disabled={true}
        />
      );
      expect(html).toContain('marketingToggleWrapper disabled');
    });

    it('does not add disabled class when disabled prop is false', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
          disabled={false}
        />
      );
      expect(html).not.toContain('marketingToggleWrapper disabled');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA role radiogroup on ToggleSet', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('role="radiogroup"');
    });

    it('options have role radio', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      // Count role="radio" occurrences - should be 2 (Yes and No)
      const matches = html.match(/role="radio"/g);
      expect(matches).toHaveLength(2);
    });

    it('has aria-label for marketing email preference', () => {
      const html = ReactDOMServer.renderToString(
        <MarketingEmailToggle
          wantsMarketingEmails={true}
          onToggle={mockOnToggle}
        />
      );
      expect(html).toContain('aria-label="Marketing email preference"');
    });
  });

  describe('Component exports', () => {
    it('exports a default function component', () => {
      expect(typeof MarketingEmailToggle).toBe('function');
    });

    it('returns a React element', () => {
      const element = MarketingEmailToggle({
        wantsMarketingEmails: true,
        onToggle: mockOnToggle,
      });
      expect(React.isValidElement(element)).toBe(true);
    });
  });
});

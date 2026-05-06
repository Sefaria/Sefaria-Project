import React from 'react';
import ReactDOMServer from 'react-dom/server';
import SuccessView from '../SuccessView';
import { BILINGUAL_TEXT } from '../bilingualUtils';

jest.mock('../../Misc', () => {
  const React = require('react');
  return {
    InterfaceText: ({ text }) => React.createElement('span', null, text.en),
  };
});

describe('SuccessView', () => {
  let html;
  beforeAll(() => {
    html = ReactDOMServer.renderToString(React.createElement(SuccessView));
  });

  it('renders successView container class', () => {
    expect(html).toContain('successView');
  });

  it('renders ALL_SET heading text', () => {
    expect(html).toContain(BILINGUAL_TEXT.ALL_SET.en);
  });

  it('BILINGUAL_TEXT.ALL_SET has Hebrew text', () => {
    expect(BILINGUAL_TEXT.ALL_SET.he).toBe('הכל מוכן!');
  });

  it('renders THANKS_FOR_JOINING message', () => {
    // renderToString HTML-encodes apostrophes as &#x27; — match a safe substring
    expect(html).toContain('Thank you for joining our community');
  });

  it('renders RETURN_TO_SEFARIA link text', () => {
    expect(html).toContain(BILINGUAL_TEXT.RETURN_TO_SEFARIA.en);
  });

  it('homepage link points to root path', () => {
    expect(html).toContain('href="/"');
  });

  it('success icon img has aria-hidden="true"', () => {
    expect(html).toContain('aria-hidden="true"');
  });

  it('wrapper includes analytics form_name', () => {
    expect(html).toContain('newsletter_signup_complete');
  });
});

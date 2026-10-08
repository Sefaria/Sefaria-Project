/**
 * The public Powered by Sefaria form: Formstack's fields and logic, validation, the mock
 * submit and its duplicate-link check.
 */

jest.mock('../sefaria/sefaria', () => {
  const sefaria = {
    interfaceLang: 'english',
    _uid: null,
    full_name: '',
    _email: '',
    _: (k) => k,
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
});

jest.mock('../sefaria/csrf', () => ({ __esModule: true, getCsrfToken: () => 'token' }));

jest.mock('../Misc', () => {
  const Sefaria = require('../sefaria/sefaria').default;
  const pick = (o) => o[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return {
    __esModule: true,
    InterfaceText: ({ text, html }) => (html ? <span dangerouslySetInnerHTML={{ __html: pick(html) }} /> : pick(text)),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import PoweredByForm from '../poweredBy/PoweredByForm.jsx';
import PoweredByFormPage, { SIGN_IN_FOR_API_KEY_URL } from '../poweredBy/PoweredByFormPage.jsx';
import {
  ALL_FIELDS, COPY, DESCRIPTION_MAX_LENGTH, ENDPOINT_CATEGORIES, FORM_PAGES, fieldError,
} from '../poweredBy/poweredByFormDefinition';
import { findListingMatch, linkKey, normalizeLink } from '../poweredBy/poweredByPoc';

let container = null;

function render(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(element, container); });
}

const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

const setText = (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

const field = (name) => container.querySelector('#pbf-' + name);
const clickOption = (name, value) => {
  const input = container.querySelector(`input[name="pbf-${name}"][value="${value}"]`);
  act(() => { input.click(); });
};
const button = (label) => Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === label);
const click = (el) => act(() => { el.click(); });
const legends = () => Array.from(container.querySelectorAll('.pbfLabel')).map(l => l.textContent);

const fillPageOne = (link = 'myproject.org') => {
  setText(field('firstName'), 'Ada');
  setText(field('lastName'), 'Lovelace');
  setText(field('email'), 'ada@example.org');
  setText(field('projectName'), 'Analytical Torah');
  setText(field('projectLink'), link);
  setText(field('description'), 'A short description.');
  clickOption('categories', 'Learning & Study Tools');
  clickOption('consent', 'Yes');
};

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  Sefaria._uid = null;
  Sefaria.full_name = '';
  Sefaria._email = '';
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('fields and order', () => {
  it('renders page 1 in Formstack order with required asterisks', () => {
    render(<PoweredByForm />);
    expect(legends()).toEqual([
      'First Name*', 'Last Name*', 'Email*', 'Current Role',
      "How did you hear about Sefaria's data and tools?",
      'Are you a professional software developer?',
      'How many years of programming experience do you have?',
      'Project Name*', 'Link to the Project*', 'Link to Source Code', 'Project Description*', 'Category*',
      'Which Sefaria data or tools did you use for your project?',
      'Which non-Sefaria technologies or tools did you use for your project?',
      'What inspired you to build this tool? What use case were you solving for?',
      'Was this project vibe-coded?',
      'How many users approximately use this project on a monthly basis?',
      'Do you consent to have your project data displayed on our page?*',
      'Anything else you would like to add?',
    ]);
    expect(Array.from(container.querySelectorAll('.pbfSectionHeading')).map(h => h.textContent))
      .toEqual(['Personal Details', 'Project Information', 'Consent']);
    expect(button('Next')).toBeTruthy();
    expect(button('Previous')).toBeUndefined();
  });

  it('shows an always-visible Other box under each Other option', () => {
    render(<PoweredByForm />);
    expect(container.querySelectorAll('.pbfOtherInput').length).toBe(4);
  });

  it('reveals endpoint categories only when "Sefaria API" is ticked', () => {
    render(<PoweredByForm />);
    expect(field('endpointCategories')).toBeNull();
    clickOption('sefariaTools', 'Sefaria API');
    expect(field('endpointCategories')).not.toBeNull();
    clickOption('sefariaTools', 'Sefaria API');
    expect(field('endpointCategories')).toBeNull();
  });

  it('reveals one endpoint checklist per category, Miscellaneous fifth as on Formstack', () => {
    render(<PoweredByForm />);
    clickOption('sefariaTools', 'Sefaria API');
    ENDPOINT_CATEGORIES.forEach(c => clickOption('endpointCategories', c.value));
    const ids = Array.from(container.querySelectorAll('fieldset[id^="pbf-endpoints"]')).map(f => f.id);
    expect(ids).toEqual([
      'Calendars', 'Collections', 'Index', 'Lexicon', 'Miscellaneous', 'Reference', 'Related',
      'Sheets', 'Term', 'Text', 'Topic',
    ].map(c => 'pbf-endpoints' + c));
    expect(field('endpointsReference').querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it('hides the endpoint sections when asked', () => {
    render(<PoweredByForm hideEndpointSections={true} />);
    clickOption('sefariaTools', 'Sefaria API');
    expect(field('endpointCategories')).toBeNull();
  });
});

describe('validation', () => {
  it('blocks Next with the page banner and a "Required field" note on each empty required field', () => {
    render(<PoweredByForm />);
    click(button('Next'));
    const banner = container.querySelector('.pbfPageError');
    expect(banner.textContent).toContain('Please review the current page (1 of 2) and fill in valid responses for each field');
    const errored = Array.from(container.querySelectorAll('.pbfHasError')).map(el => (el.id || el.querySelector('[id]').id));
    expect(errored).toEqual(['pbf-firstName', 'pbf-lastName', 'pbf-email', 'pbf-projectName',
      'pbf-projectLink', 'pbf-description', 'pbf-categories', 'pbf-consent']);
    expect(container.querySelectorAll('.pbfErrorNote')[0].textContent).toContain('Required field');
    expect(button('Next')).toBeTruthy();
  });

  it('checks the email format', () => {
    render(<PoweredByForm />);
    fillPageOne();
    setText(field('email'), 'not-an-email');
    click(button('Next'));
    expect(container.textContent).toContain('Invalid email format (e.g. your_email@domain.com)');
  });

  it('moves to page 2, which requires the logo answer before submitting', () => {
    const onSubmit = jest.fn();
    render(<PoweredByForm onSubmit={onSubmit} />);
    fillPageOne();
    click(button('Next'));
    expect(container.querySelector('.pbfPageError')).toBeNull();
    expect(legends()).toEqual(['Select one:*']);
    expect(container.querySelector('a[href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo"]').textContent)
      .toBe('[Learn More]');
    click(button('Submit Form'));
    expect(container.querySelector('.pbfPageError').textContent).toContain('(2 of 2)');
    expect(onSubmit).not.toHaveBeenCalled();
    clickOption('logo', 'Yes! I have added the Powered by Sefaria Logo to my project.');
    click(button('Submit Form'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].firstName).toBe('Ada');
  });

  it('keeps answers when going back with Previous', () => {
    render(<PoweredByForm />);
    fillPageOne();
    click(button('Next'));
    click(button('Previous'));
    expect(field('firstName').value).toBe('Ada');
  });

  it('limits the description to 150 characters with a live counter', () => {
    render(<PoweredByForm />);
    expect(DESCRIPTION_MAX_LENGTH).toBe(150);
    expect(field('description').getAttribute('maxLength')).toBe('150');
    setText(field('description'), 'abcde');
    expect(container.querySelector('.pbfCounter').textContent).toContain('5/150');
    const description = ALL_FIELDS.find(f => f.name === 'description');
    expect(fieldError(description, { description: 'x'.repeat(151) })).toBe('tooLong');
    expect(fieldError(description, { description: 'x'.repeat(150) })).toBeNull();
  });
});

describe('project mode', () => {
  it('is one continuous page without buttons that reports changes and missing fields', () => {
    const onChange = jest.fn();
    const onMissing = jest.fn();
    render(<PoweredByForm mode="project" initialValues={{ projectName: 'Prefilled' }}
      onChange={onChange} onMissingRequiredChange={onMissing} />);
    expect(container.querySelector('button')).toBeNull();
    expect(field('logo')).not.toBeNull();
    expect(container.querySelector('.pbfHeader')).toBeNull();
    expect(onMissing.mock.calls[0][0]).not.toContain('projectName');
    expect(onMissing.mock.calls[0][0]).toContain('firstName');
    setText(field('firstName'), 'Ada');
    expect(onChange.mock.calls[0][0].firstName).toBe('Ada');
    expect(onMissing.mock.calls[onMissing.mock.calls.length - 1][0]).not.toContain('firstName');
    clickOption('sefariaTools', 'Sefaria API');
    expect(field('endpointCategories')).toBeNull();
  });
});

describe('links', () => {
  it('prepends https:// to links typed without a scheme', () => {
    expect(normalizeLink('myapp.com')).toBe('https://myapp.com');
    expect(normalizeLink('  http://myapp.com/x ')).toBe('http://myapp.com/x');
    expect(normalizeLink('')).toBe('');
  });

  it('compares links without scheme, www or trailing slash', () => {
    expect(linkKey('https://www.Example.org/')).toBe('example.org');
    expect(linkKey('example.org')).toBe(linkKey('http://www.example.org///'));
    expect(linkKey('example.org/a/')).not.toBe(linkKey('example.org/b'));
  });

  it('matches published and unpublished listings', () => {
    expect(findListingMatch('https://www.dafyomicompanion.org/').status).toBe('published');
    expect(findListingMatch('gematriaplayground.dev').status).toBe('unpublished');
    expect(findListingMatch('brand-new.example').status).toBe('none');
  });
});

describe('the public page and its mock submit', () => {
  const submitWithLink = async (link) => {
    render(<PoweredByFormPage />);
    fillPageOne(link);
    click(button('Next'));
    clickOption('logo', 'I have not added the Powered by Sefaria Logo to my project yet.');
    click(button('Submit Form'));
    await flush();
  };
  const saved = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

  it('saves a new submission with the normalized link and thanks the visitor', async () => {
    await submitWithLink('myproject.org');
    expect(global.fetch.mock.calls[0][0]).toBe('/api/developer-poc/powered-by-submissions');
    expect(saved().kind).toBe('new');
    expect(saved().answers.projectLink).toBe('https://myproject.org');
    expect(saved().likelyDuplicateOf).toBeNull();
    expect(container.querySelector('.pbfThanks').textContent).toContain('Placeholder text');
    expect(container.querySelector(`a[href="${SIGN_IN_FOR_API_KEY_URL}"]`).textContent).toBe('Sign in');
    expect(SIGN_IN_FOR_API_KEY_URL).toBe('/login?next=%2Fsettings%2Fdeveloper');
  });

  it('offers to send a published duplicate as an update, or go back', async () => {
    await submitWithLink('www.dafyomicompanion.org/');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('This project is already listed on Powered by Sefaria');
    click(button('Go back'));
    expect(field('logo')).not.toBeNull();
    click(button('Submit Form'));
    await flush();
    click(button('Send as an update'));
    await flush();
    expect(saved().kind).toBe('update');
    expect(saved().updateFor.name).toBe('Daf Yomi Companion');
    expect(container.querySelector('.pbfThanks')).not.toBeNull();
  });

  it('accepts an unpublished duplicate quietly and flags it for staff', async () => {
    await submitWithLink('gematriaplayground.dev');
    expect(saved().kind).toBe('new');
    expect(saved().likelyDuplicateOf).toBe('https://gematriaplayground.dev');
    expect(container.textContent).not.toMatch(/already|duplicate/i);
    expect(container.querySelector('.pbfThanks')).not.toBeNull();
  });

  it('prefills name and email for a signed-in visitor', () => {
    Sefaria._uid = 7;
    Sefaria.full_name = 'Tova Levi';
    Sefaria._email = 'tova@example.org';
    render(<PoweredByFormPage />);
    expect(field('firstName').value).toBe('Tova');
    expect(field('lastName').value).toBe('Levi');
    expect(field('email').value).toBe('tova@example.org');
  });
});

describe('Hebrew', () => {
  it('has Hebrew for every label, option, help text and line of copy', () => {
    Object.values(COPY).forEach(s => expect(s.he).toBeTruthy());
    FORM_PAGES.flat().filter(i => i.name).forEach(f => {
      expect(f.label.he).toBeTruthy();
      (f.options || []).forEach(o => expect(o.label.he).toBeTruthy());
      if (f.help) { expect(f.help.he).toBeTruthy(); }
    });
  });

  it('renders right to left in Hebrew', () => {
    Sefaria.interfaceLang = 'hebrew';
    render(<PoweredByForm />);
    expect(container.querySelector('form').getAttribute('dir')).toBe('rtl');
    expect(legends()[0]).toBe('שם פרטי*');
    expect(button('הבא')).toBeTruthy();
  });
});

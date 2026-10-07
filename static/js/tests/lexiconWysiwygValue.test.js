/**
 * LexiconWysiwygValue: the custom json-edit-react node that renders lexicon content string
 * values as styled HTML (no visible tags) instead of literal text, in both view and edit mode.
 *
 * react-simple-wysiwyg injects its stylesheet at import time via insertAdjacentElement, which
 * jsdom doesn't support (same gap as json-edit-react itself, see lexiconContentEditBox.test.js) --
 * stubbed out below with a working fake `Editor` (renders children, exposes onChange via a
 * button) rather than a black-box null, so the draftHtml/setValue sync behavior is actually
 * exercised rather than assumed. Real contentEditable/Selection-API behavior (the toolbar buttons,
 * the ref-link form) is still out of scope here -- that's exercised manually/by design review, not
 * by these tests.
 *
 * No React Testing Library in this repo -- react-dom directly, same pattern as
 * static/js/tests/lexiconContentEditBox.test.js.
 */

jest.mock('react-simple-wysiwyg', () => {
  const React = require('react');  // jest.mock factories are hoisted above imports
  return {
    __esModule: true,
    default: ({ value, onChange, children }) => React.createElement('div', { className: 'fakeEditor' },
      children,
      React.createElement('div', { className: 'fakeEditorContent', dangerouslySetInnerHTML: { __html: value } }),
      React.createElement('button', {
        className: 'fakeEditorType',
        onClick: () => onChange({ target: { value: `${value}<i>typed</i>` } }),
      }, 'type'),
    ),
    Toolbar: ({ children }) => React.createElement('div', { className: 'fakeToolbar' }, children),
    BtnBold: () => null,
    BtnItalic: () => null,
    createButton: () => () => null,
  };
});

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: { getName: jest.fn(), isRef: jest.fn(), humanRef: jest.fn(), normRef: jest.fn() },
}));

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { sanitizeLexiconHtml, WysiwygValueNode } from '../LexiconWysiwygValue';

describe('sanitizeLexiconHtml', () => {
  test('keeps tags/attributes lexicon content actually uses', () => {
    // DOMPurify rebuilds the element (reordering attributes in the process), so this asserts on
    // presence/text rather than exact string equality with the input.
    const html = '<b>1.</b> <a class="refLink" href="/Genesis.1.1" data-ref="Genesis 1:1">Gen 1:1</a>, <i>see</i> <sup>2</sup>';
    const div = document.createElement('div');
    div.innerHTML = sanitizeLexiconHtml(html);
    expect(div.querySelector('b').textContent).toBe('1.');
    expect(div.querySelector('i').textContent).toBe('see');
    expect(div.querySelector('sup').textContent).toBe('2');
    const a = div.querySelector('a');
    expect(a.getAttribute('class')).toBe('refLink');
    expect(a.getAttribute('href')).toBe('/Genesis.1.1');
    expect(a.getAttribute('data-ref')).toBe('Genesis 1:1');
  });

  test('strips tags/attributes not in the allowlist', () => {
    expect(sanitizeLexiconHtml('<script>alert(1)</script>safe')).toBe('safe');
    expect(sanitizeLexiconHtml('<u>underline</u>')).toBe('underline');
    expect(sanitizeLexiconHtml('<b onclick="alert(1)">bold</b>')).toBe('<b>bold</b>');
  });

  test('treats a non-string value as empty', () => {
    expect(sanitizeLexiconHtml(undefined)).toBe('');
    expect(sanitizeLexiconHtml(null)).toBe('');
  });
});

describe('WysiwygValueNode', () => {
  let container = null;
  let commitDraft = null;
  let handleEdit = null;
  const NODE_PATH = ['content', 'senses', 0, 'definition'];
  const node = (props) => React.createElement(WysiwygValueNode,
    { nodeData: { path: NODE_PATH }, customNodeProps: { commitDraft }, handleEdit, ...props });

  const render = (props) => {
    commitDraft = jest.fn();
    handleEdit = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(node(props), container);
    });
  };
  const type = () => act(() => {
    container.querySelector('.fakeEditorType').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  afterEach(() => {
    if (container) {
      act(() => { ReactDOM.unmountComponentAtNode(container); });
      document.body.removeChild(container);
      container = null;
    }
  });

  test('view mode renders sanitized HTML, not literal tags', () => {
    render({ value: '<b>bold</b>', isEditing: false, canEdit: true, setIsEditing: jest.fn() });
    expect(container.querySelector('b').textContent).toBe('bold');
    expect(container.textContent).not.toContain('<b>');
  });

  test('view mode shows a placeholder for an empty value', () => {
    render({ value: '', isEditing: false, canEdit: true, setIsEditing: jest.fn() });
    expect(container.textContent).toBe('(empty)');
  });

  test('clicking the view enters edit mode when editing is allowed', () => {
    const setIsEditing = jest.fn();
    render({ value: 'text', isEditing: false, canEdit: true, setIsEditing });
    act(() => {
      container.querySelector('.lexiconWysiwygValue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(setIsEditing).toHaveBeenCalledWith(true);
  });

  test('clicking the view does nothing when editing is restricted', () => {
    const setIsEditing = jest.fn();
    render({ value: 'text', isEditing: false, canEdit: false, setIsEditing });
    act(() => {
      container.querySelector('.lexiconWysiwygValue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(setIsEditing).not.toHaveBeenCalled();
  });

  test('edit mode seeds the editor with the stored value byte for byte', () => {
    // Not sanitized on the way in: DOMPurify reverses attribute order and drops tags outside the
    // display allowlist, which would rewrite untouched markup as soon as a field is edited.
    const stored = '<a class="refLink" data-ref="Shabbat 3a:3" href="/Shabbat.3a.3" data-scroll-link="true">x</a>';
    render({ value: stored, isEditing: true });
    expect(container.querySelector('.fakeEditorContent').innerHTML).toBe(stored);
  });

  test('a tag the display allowlist omits survives being edited', () => {
    const stored = 'see <small>fine print</small>';
    render({ value: stored, isEditing: true });
    expect(container.querySelector('.fakeEditorContent').innerHTML).toBe(stored);
  });

  test('a change goes into the panel draft as it is typed, keyed by this node\'s path', () => {
    // Not waiting on any per-field confirm: that's what keeps the text when the field is closed
    // by clicking elsewhere, and what lets Save send it without the field being committed first.
    render({ value: 'text', isEditing: true });

    type();

    expect(commitDraft).toHaveBeenCalledWith(NODE_PATH, 'text<i>typed</i>');
    expect(container.querySelector('.fakeEditor i').textContent).toBe('typed');
  });

  test('Cancel puts back the value from when editing started, and closes the field', () => {
    render({ value: 'original', isEditing: true });
    type();

    act(() => {
      container.querySelector('.lexiconWysiwygCancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // handleEdit writes the value and leaves edit mode in one step.
    expect(handleEdit).toHaveBeenCalledWith('original');
  });

  test('Cancel reverts to the stored value even after several changes', () => {
    render({ value: 'original', isEditing: true });
    type();
    type();

    act(() => {
      container.querySelector('.lexiconWysiwygCancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(commitDraft).toHaveBeenCalledTimes(2);
    expect(handleEdit).toHaveBeenCalledWith('original');
  });
});

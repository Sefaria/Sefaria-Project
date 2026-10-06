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

  const render = (props) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(React.createElement(WysiwygValueNode, props), container);
    });
  };
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

  test('edit mode seeds the editor from the sanitized current value', () => {
    render({ value: '<b onclick="x()">bold</b>', isEditing: true, setValue: jest.fn() });
    expect(container.querySelector('.fakeEditor b').textContent).toBe('bold');
    expect(container.querySelector('.fakeEditor b').getAttribute('onclick')).toBeNull();
  });

  test('a change updates both the field being edited and json-edit-react\'s own tracked value', () => {
    // json-edit-react always overlays its own confirm/cancel icons in edit mode (there's no way to
    // turn them off), and they commit via `setValue`, not this component's own state -- if a
    // change only updated the editor's own display and not `setValue` too, confirming via the
    // library's icons would silently revert to the pre-edit content instead of saving the change.
    const setValue = jest.fn();
    render({ value: 'text', isEditing: true, setValue });
    act(() => {
      container.querySelector('.fakeEditorType').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(setValue).toHaveBeenCalledWith('text<i>typed</i>');
    expect(container.querySelector('.fakeEditor i').textContent).toBe('typed');
  });
});

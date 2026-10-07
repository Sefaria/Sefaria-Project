import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import Editor, { Toolbar, BtnBold, BtnItalic, createButton } from 'react-simple-wysiwyg';
import Sefaria from './sefaria/sefaria';

// Display only -- what this renders is never saved. Narrower than LexiconEntry.ALLOWED_TAGS
// (sefaria/model/lexicon.py), which allows tags no stored entry actually uses.
const ALLOWED_TAGS = ['i', 'b', 'br', 'strong', 'em', 'big', 'sup', 'sub', 'span', 'a'];
const ALLOWED_ATTR = ['class', 'dir', 'href', 'data-ref', 'data-scroll-link'];

export const sanitizeLexiconHtml = (html) => DOMPurify.sanitize(typeof html === 'string' ? html : '', {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
});

// Only the markup stored entries actually use. Rarer tags still round-trip, just aren't creatable.
const BtnSuperscript = createButton('Superscript', 'x²', 'superscript');
const BtnSubscript = createButton('Subscript', 'x₂', 'subscript');

const closestLink = (node) => {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return el?.closest('a') ?? null;
};

const unwrap = (el) => el.replaceWith(...el.childNodes);

// Makes Enter insert <br> (the only break tag bleach allows) instead of a browser-default new
// block element, in browsers that support this non-standard but widely-implemented command.
const onEditorFocus = () => document.execCommand('defaultParagraphSeparator', false, 'br');

// Resolves a Sefaria ref into `href` + `data-ref`, with a separate field for the displayed label
// (often a hand-crafted citation like "Pr 4:18", not the ref). Parses client-side rather than via
// /api/name/, which is a separate service that isn't always running (DISABLE_AUTOCOMPLETER).
const RefLinkForm = ({ initialRef, initialLabel, canRemove, onSave, onRemove, onClose }) => {
  const [refText, setRefText] = useState(initialRef);
  const [label, setLabel] = useState(initialLabel);
  const [error, setError] = useState(null);

  const save = () => {
    const trimmedRef = refText.trim();
    if (!trimmedRef || !Sefaria.isRef(trimmedRef)) {
      setError('Not a recognized Sefaria reference.');
      return;
    }
    const ref = Sefaria.humanRef(trimmedRef);
    const href = `/${Sefaria.normRef(trimmedRef)}`;
    onSave({ ref, href, label: label.trim() || ref });
  };

  return (
    <div className="lexiconRefLinkForm" onMouseDown={e => e.stopPropagation()}>
      <label>
        Reference
        <input type="text" value={refText} placeholder="Genesis 1:1" autoFocus
               onChange={e => { setRefText(e.target.value); setError(null); }} />
      </label>
      <label>
        Display text
        <input type="text" value={label} onChange={e => setLabel(e.target.value)} />
      </label>
      {error && <div className="lexiconRefLinkFormError">{error}</div>}
      <div className="lexiconRefLinkFormActions">
        <button type="button" onClick={save}>Save</button>
        {canRemove && <button type="button" onClick={onRemove}>Remove Link</button>}
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// A CustomNodeDefinition `element` for json-edit-react: renders lexicon content string values as
// styled/rendered HTML (no visible tags) in both view and edit mode.
export const WysiwygValueNode = ({ value, isEditing, canEdit, setIsEditing, handleEdit, nodeData, customNodeProps }) => {
  const [draftHtml, setDraftHtml] = useState('');
  // Captured when a link is clicked or the Ref button is used: which element to edit inside, and
  // (for a brand new link, wrapping a text selection) the Range to replace.
  const [linkTarget, setLinkTarget] = useState(null); // {el, existingLink, range} | null
  const { commitDraft } = customNodeProps;
  const valueBeforeEdit = useRef(null);

  // Stored value as-is, deliberately unsanitized: DOMPurify rebuilds every element it passes,
  // reversing attribute order and dropping tags outside the display allowlist, so sanitizing here
  // would rewrite untouched markup on any edit. Sanitizing on save is LexiconEntry._sanitize()'s job.
  useEffect(() => {
    if (!isEditing) { return; }
    valueBeforeEdit.current = value;
    setDraftHtml(value);
  }, [isEditing]);

  // Straight into the panel's draft, not json-edit-react's staging: the text then survives
  // closing the field by any means, and Save sends what's in the box. Its icons are hidden (scss).
  const updateDraft = (html) => {
    setDraftHtml(html);
    commitDraft(nodeData.path, html);
  };

  // The one way back. handleEdit writes a value and closes the field at once; the library's own
  // cancel can't serve here, since it only discards staging we no longer use.
  const cancelEdit = () => handleEdit(valueBeforeEdit.current);

  // Defined per-instance (not at module scope, like BtnBold etc.) so it can open a link form
  // scoped to *this* field.
  const [BtnRefLink] = useState(() => createButton('Sefaria Ref Link', 'Ref', ({ $el }) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !$el.contains(selection.getRangeAt(0).commonAncestorContainer)) { return; }
    const range = selection.getRangeAt(0);
    setLinkTarget({ el: $el, existingLink: closestLink(range.commonAncestorContainer), range: range.cloneRange() });
  }));

  // A link inside a contentEditable still navigates on click, so route it into the link form
  // instead.
  const onEditorClick = (e) => {
    const link = closestLink(e.target);
    if (!link) { return; }
    e.preventDefault();
    setLinkTarget({ el: e.currentTarget, existingLink: link, range: null });
  };

  const closeLinkForm = () => setLinkTarget(null);

  const saveLink = ({ ref, href, label }) => {
    const { el, existingLink, range } = linkTarget;
    if (existingLink) {
      existingLink.setAttribute('href', href);
      existingLink.setAttribute('data-ref', ref);
      existingLink.setAttribute('class', 'refLink');
      existingLink.textContent = label;
    } else {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.setAttribute('data-ref', ref);
      a.setAttribute('class', 'refLink');
      a.textContent = label;
      range.deleteContents();
      range.insertNode(a);
    }
    updateDraft(el.innerHTML);
    closeLinkForm();
  };

  const removeLink = () => {
    const { el, existingLink } = linkTarget;
    if (existingLink) { unwrap(existingLink); updateDraft(el.innerHTML); }
    closeLinkForm();
  };

  if (!isEditing) {
    const html = sanitizeLexiconHtml(value);
    // Rendering real HTML means a ref link in the value is a real, live <a href>: without this,
    // clicking one navigates the browser away instead of opening this field for editing.
    const onClick = (e) => { e.preventDefault(); canEdit && setIsEditing(true); };
    return (
      <div className="lexiconWysiwygValue" onClick={onClick}>
        {html
          ? <span dangerouslySetInnerHTML={{ __html: html }} />
          : <span className="lexiconWysiwygPlaceholder">(empty)</span>}
      </div>
    );
  }

  return (
    <div className="lexiconWysiwygEditWrapper">
      <Editor
        value={draftHtml}
        onChange={e => updateDraft(e.target.value)}
        onFocus={onEditorFocus}
        onClick={onEditorClick}
        containerProps={{ className: 'lexiconWysiwygEditor' }}
      >
        <Toolbar>
          <BtnBold />
          <BtnItalic />
          <BtnSuperscript />
          <BtnSubscript />
          <BtnRefLink />
        </Toolbar>
      </Editor>
      <button type="button" className="lexiconWysiwygCancel" onClick={cancelEdit}>Cancel</button>
      {linkTarget && (
        <RefLinkForm
          initialRef={linkTarget.existingLink?.getAttribute('data-ref') ?? ''}
          initialLabel={linkTarget.existingLink ? linkTarget.existingLink.textContent : (linkTarget.range?.toString() ?? '')}
          canRemove={!!linkTarget.existingLink}
          onSave={saveLink}
          onRemove={removeLink}
          onClose={closeLinkForm}
        />
      )}
    </div>
  );
};

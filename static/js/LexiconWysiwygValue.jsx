import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import Editor, { Toolbar, BtnBold, BtnItalic, createButton } from 'react-simple-wysiwyg';
import Sefaria from './sefaria/sefaria';

// Narrower than the ALLOWED_TAGS LexiconEntry declares in sefaria/model/lexicon.py, which
// includes tags no entry in the 8 lexicons this tool edits (Klein, Jastrow, BDB, BDB Aramaic,
// Sefer HaShorashim, Animadversions, Kovetz Yesodot, Krupnik -- the two other lexicons in the DB
// have no Dictionary-category Index and aren't reachable here) actually uses: i/b/strong/em/sup/
// sub/span/a/br are real and common; big appears in only a handful of entries; u/small/img and
// the data-commentator/data-order/data-label/src attributes appear in none. Keep in sync with
// LexiconEntry.ALLOWED_TAGS/ALLOWED_ATTRS if that changes.
const ALLOWED_TAGS = ['i', 'b', 'br', 'strong', 'em', 'big', 'sup', 'sub', 'span', 'a'];
const ALLOWED_ATTR = ['class', 'dir', 'href', 'data-ref'];

export const sanitizeLexiconHtml = (html) => DOMPurify.sanitize(typeof html === 'string' ? html : '', {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
});

// Toolbar covers what's actually used in stored lexicon content: bold, italic, superscript,
// subscript, and ref links (by far the dominant one, ~66% of entries -- handled by BtnRefLink
// below). No button for big (15 entries) or anything else that's rare/unused -- existing markup
// still round-trips via sanitizeLexiconHtml above, it just isn't toolbar-creatable.
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

// The one piece with no off-the-shelf equivalent: a small form resolving a Sefaria ref (not a raw
// URL) into both `href` and `data-ref`, with its own field for the displayed label -- the label is
// a separate, often hand-crafted citation (e.g. "Pr 4:18", or a Hebrew abbreviation), never assumed
// to equal the ref. Resolution is Sefaria.normRef/humanRef (pure client-side ref parsing, already
// used the same way by e.g. Misc.jsx's TextBlockLink) rather than the /api/name/ autocompleter
// endpoint -- that endpoint is served by a separate "name service" that isn't guaranteed to be
// running (disabled outright via DISABLE_AUTOCOMPLETER on some servers, including local dev).
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
export const WysiwygValueNode = ({ value, isEditing, setIsEditing, setValue, canEdit }) => {
  const [draftHtml, setDraftHtml] = useState('');
  // Captured when a link is clicked or the Ref button is used: which element to edit inside, and
  // (for a brand new link, wrapping a text selection) the Range to replace.
  const [linkTarget, setLinkTarget] = useState(null); // {el, existingLink, range} | null

  useEffect(() => {
    if (isEditing) { setDraftHtml(sanitizeLexiconHtml(value)); }
  }, [isEditing]);

  // json-edit-react always overlays its own confirm/cancel icons whenever a custom node reports
  // isEditing (there's no prop to turn this off -- showEditTools only affects the view-mode
  // icons). This component renders no Done/Cancel of its own; those library icons commit via
  // its OWN internal tracked value, not this component's draftHtml, unless `setValue` (also a
  // prop here) is kept up to date in parallel with every change -- otherwise clicking them
  // silently reverts to the pre-edit content. So every change below updates both draftHtml
  // (what this component itself renders/edits) and setValue (what the library's icons commit).
  const updateDraft = (html) => { setDraftHtml(html); setValue(html); };

  // Defined per-instance (not at module scope, like BtnBold etc.) so it can open a link form
  // scoped to *this* field.
  const [BtnRefLink] = useState(() => createButton('Sefaria Ref Link', 'Ref', ({ $el }) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !$el.contains(selection.getRangeAt(0).commonAncestorContainer)) { return; }
    const range = selection.getRangeAt(0);
    setLinkTarget({ el: $el, existingLink: closestLink(range.commonAncestorContainer), range: range.cloneRange() });
  }));

  // Browsers don't suppress <a href> navigation just because the link sits inside a
  // contentEditable -- without this, clicking an existing ref link while editing navigates away
  // instead of editing it. Routes the click into the same link form as the toolbar button.
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

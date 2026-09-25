import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { JsonEditor } from 'json-edit-react';
import { LoadingMessage, InterfaceText } from './Misc';
import LexiconEntryEditBox, { useLexiconEntrySave, fetchLexiconApi, CurrentHeadwordDisplay, SaveButton } from './LexiconEntryEditBox';
import { WysiwygValueNode } from './LexiconWysiwygValue';

// Keys stay visible (so an admin can see which field they're editing), greyed to match the
// library's own "N items" label (itemCount's default color) to signal they're not renameable
// -- restrictAdd/restrictDelete already block that, since json-edit-react models a rename as
// delete-then-add. Renders string values (which routinely carry HTML, e.g. "<b>1.</b>") via
// WysiwygValueNode instead of as literal tag text. The string-matching definition must come
// first: json-edit-react uses the first customNodeDefinitions entry whose condition matches a
// given node. showEditTools: false hides the library's view-mode edit/delete/copy icon overlay,
// which would otherwise sit redundantly next to WysiwygValueNode's own click-to-edit surface. It
// has no effect on the library's edit-mode confirm/cancel icon pair -- those are unconditional
// whenever a node reports isEditing, with no flag to turn them off, so this tool relies on them
// directly to commit/cancel (WysiwygValueNode keeps them working correctly via the `setValue`
// prop; see that file).
const customNodeDefinitions = [
  { condition: ({ value }) => typeof value === 'string', element: WysiwygValueNode, showOnEdit: true, showOnView: true, showEditTools: false },
];


export const ContentEditor = ({ identity }) => {
  const [initialDraft, setInitialDraft] = useState(undefined);  // undefined: loading
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let stale = false;
    setInitialDraft(undefined);
    setLoadError(null);
    const url = `/api/lexicon-entry/${encodeURIComponent(identity.lexiconName)}/${encodeURIComponent(identity.headword)}`;
    fetchLexiconApi(url, null, "GET").then(data => {
      // identity can change again before this resolves -- an earlier-started but
      // later-resolving fetch must not overwrite content a more recent one already loaded.
      if (stale) { return; }
      const draft = {};
      data.content_attr_names.forEach(attr => {
        if (attr in data.entry) { draft[attr] = data.entry[attr]; }
      });
      setInitialDraft(draft);
    }).catch(e => {
      // Without this, a 404/409 response left initialDraft undefined forever -- the panel
      // stuck on LoadingMessage with an unhandled rejection, no way for the moderator to
      // know what happened.
      if (stale) { return; }
      setLoadError(e.message);
    });
    return () => { stale = true; };
  }, [identity.lexiconName, identity.headword]);

  if (loadError) {
    return <div className="lexiconEditBox"><InterfaceText text={{en: loadError, he: loadError}} /></div>;
  }

  if (initialDraft === undefined) {
    return <LoadingMessage />;
  }

  return <ContentEditorForm identity={identity} initialDraft={initialDraft} />;
};

const ContentEditorForm = ({ identity, initialDraft }) => {
  const { value, setValue, saving, message, save } = useLexiconEntrySave(initialDraft);

  const onSave = () => {
    const url = `/api/lexicon-entry/${encodeURIComponent(identity.lexiconName)}/${encodeURIComponent(identity.headword)}`;
    save(url, { content: value });
  };

  return (
    <div>
      <CurrentHeadwordDisplay headword={identity.headword} />
      <JsonEditor
        data={value}
        setData={setValue}
        restrictAdd={true}
        restrictDelete={true}
        rootName={identity.headword}
        customNodeDefinitions={customNodeDefinitions}
        theme={{ property: { color: 'rgba(0, 0, 0, 0.3)' } }}
      />
      <SaveButton onSave={onSave} saving={saving} message={message} />
    </div>
  );
};

const LexiconContentEditBox = ({ currentlyVisibleRef }) => (
  <LexiconEntryEditBox currentlyVisibleRef={currentlyVisibleRef}>
    {identity => <ContentEditor identity={identity} />}
  </LexiconEntryEditBox>
);
LexiconContentEditBox.propTypes = {
  currentlyVisibleRef: PropTypes.string,
};

export default LexiconContentEditBox;

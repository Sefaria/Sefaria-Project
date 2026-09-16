import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { JsonEditor } from 'json-edit-react';
import { LoadingMessage, InterfaceText } from './Misc';
import LexiconEntryEditBox, { useLexiconEntrySave, fetchLexiconApi, CurrentHeadwordDisplay, SaveButton } from './LexiconEntryEditBox';


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

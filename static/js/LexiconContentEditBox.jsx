import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { JsonEditor } from 'json-edit-react';
import Sefaria from './sefaria/sefaria';
import { LoadingMessage } from './Misc';
import LexiconEntryEditBox, { useLexiconEntrySave, CurrentHeadwordDisplay, SaveButton } from './LexiconEntryEditBox';


const ContentEditor = ({ identity }) => {
  const [initialDraft, setInitialDraft] = useState(undefined);  // undefined: loading

  useEffect(() => {
    const url = `/api/lexicon-entry/${encodeURIComponent(identity.lexiconName)}/${encodeURIComponent(identity.headword)}`;
    Sefaria.apiRequestWithBody(url, null, null, "GET").then(data => {
      const draft = {};
      data.content_attr_names.forEach(attr => {
        if (attr in data.entry) { draft[attr] = data.entry[attr]; }
      });
      setInitialDraft(draft);
    });
  }, [identity.lexiconName, identity.headword]);

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

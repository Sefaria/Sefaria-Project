import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from './Misc';
import LexiconEntryEditBox, { useLexiconEntrySave, CurrentHeadwordDisplay, SaveButton } from './LexiconEntryEditBox';


const HeadwordEditor = ({ identity, panelPosition }) => {
  const [savedHeadword, setSavedHeadword] = useState(identity.headword);
  const { value, setValue, saving, message, save } = useLexiconEntrySave(identity.headword);
  // panelPosition (from ReaderPanel, via ConnectionsPanel) rather than a module-level
  // counter: Sefaria's reader can show multiple simultaneous panels, so a fixed id would
  // collide if two panels both have this tool open, making the label/htmlFor association
  // ambiguous.
  const inputId = `lexiconEditNewHeadwordInput-${panelPosition}`;

  const onSave = async () => {
    const url = `/api/lexicon-entry/headword/${encodeURIComponent(identity.lexiconName)}/${encodeURIComponent(savedHeadword)}`;
    const data = await save(url, { new_headword: value }, data =>
      // data.headword can differ from what was typed either because the server resolved a
      // collision by appending a superscript, or just from NFC normalization -- not
      // necessarily a collision, so the message doesn't guess which.
      data.headword === value.trim()
        ? {en: `Saved as "${data.headword}".`, he: `נשמר בתור "${data.headword}".`}
        : {en: `Saved as "${data.headword}" (adjusted from "${value.trim()}").`,
           he: `נשמר בתור "${data.headword}" (הותאם מ"${value.trim()}").`});
    if (data) { setSavedHeadword(data.headword); }
  };

  return (
    <div>
      <CurrentHeadwordDisplay headword={savedHeadword} />
      <label className="lexiconEditNewHeadwordLabel" htmlFor={inputId}>
        <InterfaceText text={{en: "New headword", he: "ערך ראשי חדש"}} />
      </label>
      <input
        id={inputId}
        type="text"
        className="lexiconEditHeadwordInput"
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={saving}
      />
      <SaveButton onSave={onSave} saving={saving} disabled={!value.trim() || value.trim() === savedHeadword} message={message} />
    </div>
  );
};

const LexiconHeadwordEditBox = ({ currentlyVisibleRef, panelPosition }) => (
  <LexiconEntryEditBox currentlyVisibleRef={currentlyVisibleRef}>
    {identity => <HeadwordEditor identity={identity} panelPosition={panelPosition} />}
  </LexiconEntryEditBox>
);
LexiconHeadwordEditBox.propTypes = {
  currentlyVisibleRef: PropTypes.string,
  panelPosition: PropTypes.number,
};

export default LexiconHeadwordEditBox;

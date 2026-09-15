import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { LoadingMessage, InterfaceText } from './Misc';


export const resolveLexiconEntryRef = async (ref) => {
  const oref = Sefaria.ref(ref);
  if (!oref?.categories?.includes("Dictionary")) { return null; }
  const indexData = await Sefaria.getIndexDetails(oref.indexTitle);
  const lexiconName = indexData?.lexiconName;
  const headword = oref.sectionRef.replace(oref.indexTitle, "").replace(/^,\s*/, "");
  return (lexiconName && headword) ? { lexiconName, headword } : null;
};

// Shared by LexiconHeadwordEditBox and LexiconContentEditBox: manages the value being
// edited, PATCHes it to `url` on save, and reports back either the server's success message
// or lets `formatMessage` build a more specific one from the response.
export const useLexiconEntrySave = (initialValue) => {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setValue(initialValue);
    setMessage(null);
  }, [initialValue]);

  const save = async (url, payload, formatMessage) => {
    setSaving(true);
    try {
      const data = await Sefaria.apiRequestWithBodyAndAlert(url, null, payload, "PATCH");
      setMessage(formatMessage ? formatMessage(data) : {en: "Saved.", he: "נשמר."});
      return data;
    } catch (e) {
      // apiRequestWithBodyAndAlert already alerted the user with the server's error message.
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { value, setValue, saving, message, save };
};

export const CurrentHeadwordDisplay = ({ headword }) => (
  <div className="lexiconEditCurrentHeadword">{headword}</div>
);
CurrentHeadwordDisplay.propTypes = {
  headword: PropTypes.string.isRequired,
};

export const SaveButton = ({ onSave, saving, disabled, message }) => {
  const isDisabled = saving || disabled;
  return (
    <>
      {/* .button's disabled look (s2.css) is keyed off a literal "disabled" class, not the
          disabled attribute -- both are needed, one for the visual, one to actually block clicks. */}
      <button className={classNames({button: true, small: true, disabled: isDisabled})} onClick={onSave} disabled={isDisabled}>
        <InterfaceText text={{en: "Save", he: "שמירה"}} />
      </button>
      {message && <div className="lexiconEditSavedMessage"><InterfaceText text={message} /></div>}
    </>
  );
};
SaveButton.propTypes = {
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
  message: PropTypes.object,
};

// Resolves which lexicon entry (if any) currentlyVisibleRef points at, and renders the
// common loading/unavailable states so neither caller has to. children is a render-prop
// receiving the resolved identity ({lexiconName, headword}).
const LexiconEntryEditBox = ({ currentlyVisibleRef, children }) => {
  const [identity, setIdentity] = useState(undefined);  // undefined: loading, null: not a dictionary entry

  useEffect(() => {
    setIdentity(undefined);
    resolveLexiconEntryRef(currentlyVisibleRef).then(setIdentity);
  }, [currentlyVisibleRef]);

  if (identity === undefined) {
    return <LoadingMessage />;
  }

  if (identity === null) {
    return (
      <div className="lexiconEditBox">
        <InterfaceText text={{en: "This tool is only available while viewing a lexicon entry.",
                               he: "כלי זה זמין רק בעת צפייה בערך מילוני."}} />
      </div>
    );
  }

  return (
    <div className="lexiconEditBox">
      <div className="lexiconEditLexiconName">{identity.lexiconName}</div>
      {children(identity)}
    </div>
  );
};
LexiconEntryEditBox.propTypes = {
  currentlyVisibleRef: PropTypes.string,
  children: PropTypes.func.isRequired,
};

export default LexiconEntryEditBox;

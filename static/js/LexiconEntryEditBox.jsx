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
  // oref.indexTitle is the Index's own title (server-side: self._inode.index.title), while
  // oref.sectionRef is built from the ref's node's full_title() (self.index_node.full_title,
  // see Ref._get_normal in sefaria/model/text.py) -- for a simple, flat dictionary these are
  // the same string, but for one nested under a more complex multi-part Index they can
  // genuinely differ. A plain String.replace(indexTitle, "") silently no-ops when the two
  // diverge, since a non-regex first argument only replaces a literal match if one exists --
  // leaving the whole "indexTitle, headword" text as a bogus "headword". Checking the prefix
  // explicitly means an unexpected shape fails safely (null, same as "not a dictionary
  // entry") instead of silently corrupting the returned headword.
  const prefix = `${oref.indexTitle}, `;
  if (!oref.sectionRef?.startsWith(prefix)) { return null; }
  const headword = oref.sectionRef.slice(prefix.length);
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
    let stale = false;
    setIdentity(undefined);
    resolveLexiconEntryRef(currentlyVisibleRef).then(resolved => {
      // currentlyVisibleRef can change again before this resolves (e.g. the user navigates
      // through several entries quickly) -- an earlier-started but later-resolving call must
      // not overwrite the identity a more recent call already set.
      if (!stale) { setIdentity(resolved); }
    });
    return () => { stale = true; };
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

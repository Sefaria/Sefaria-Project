import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import {
  NUSACHIM,
  NUSACH_BOOKS,
  defaultNusach,
  getStoredNusach,
  isNusach,
  markNusachPickerSeen,
  nusachDebugParams,
  setStoredNusach,
  siddurContentLang,
  siddurVersions,
  timeOfDayRef,
} from './sefaria/siddurNusach';

// Client-only helpers (they read location and localStorage): call from handlers or after mount.
const viewerDefaultNusach = () => defaultNusach({
  countryCode: nusachDebugParams(window.location.search).countryCode || Sefaria.countryCode,
  interfaceLang: Sefaria.interfaceLang,
});

const preferredNusach = () => Sefaria.nusach || getStoredNusach() || viewerDefaultNusach();

const saveNusachChoice = nusach => {
  if (!isNusach(nusach)) { return; }
  setStoredNusach(nusach);
  markNusachPickerSeen();
  if (Sefaria._uid && Sefaria.nusach !== nusach) {
    Sefaria.nusach = nusach;
    Sefaria.editProfileAPI({settings: {nusach}});
  }
};

const adoptStoredNusach = () => {
  // A choice made before logging in is saved to the profile on the first page load after login.
  const stored = getStoredNusach();
  if (Sefaria._uid && !Sefaria.nusach && stored) { saveNusachChoice(stored); }
};

const siddurUrl = (ref, nusach, params = "") => {
  const query = (params + Sefaria.util.getUrlVersionsParams(siddurVersions(nusach))).replace(/^&/, "");
  return "/" + Sefaria.normRef(ref) + (query ? "?" + query : "");
};

const timeOfDayUrl = nusach =>
  siddurUrl(timeOfDayRef(nusach), nusach, "lang=" + siddurContentLang(Sefaria.interfaceLang, nusach));

const openSiddurAtTimeOfDay = (nusach, openURL) => {
  const url = timeOfDayUrl(nusach);
  if (openURL) {
    openURL(url, true, true);  // overrideContentLang so ?lang= applies within the app
  } else {
    window.location.assign(url);
  }
};

const bookTitle = nusach => {
  const book = NUSACH_BOOKS[nusach];
  const index = Sefaria.index(book.title);
  return {en: book.title, he: (index && index.heTitle) || book.heTitle};
};

const SiddurNusachPicker = ({initialNusach, onConfirm, onClose, nextPathFor}) => {
  const [choice, setChoice] = useState(isNusach(initialNusach) ? initialNusach : NUSACHIM[0]);
  const currentPath = Sefaria.util.currentPath();
  const nextPath = nextPathFor ? nextPathFor(choice) : currentPath;
  const nextParam = "?next=" + encodeURIComponent(nextPath);
  const rememberChoice = e => {
    // Remember the pick before leaving for auth; ReaderApp adopts it into the profile after login.
    setStoredNusach(choice);
    markNusachPickerSeen();
    if (nextPath !== currentPath) {
      // The in-app auth route always returns to the current page, so load the page to keep our `next`.
      e.preventDefault();
      window.location.assign(e.currentTarget.getAttribute("href"));
    }
  };
  const onKeyDown = e => { if (e.key === "Escape") { onClose(); } };

  return (
    <div className="siddurNusachPicker sans-serif" onKeyDown={onKeyDown}>
      <div className="siddurNusachPickerOverlay" onClick={onClose} />
      <div className="siddurNusachPickerBox" role="dialog" aria-modal="true" aria-labelledby="siddurNusachPickerTitle">
        <button className="siddurNusachPickerClose" aria-label={Sefaria._("common.close")} onClick={onClose}>×</button>
        <h2 id="siddurNusachPickerTitle"><InterfaceText>siddur_nusach.choose_your_nusach</InterfaceText></h2>
        <div className="siddurNusachOptions" role="radiogroup">
          {NUSACHIM.map(n => (
            <label key={n} className={"siddurNusachOption" + (n === choice ? " selected" : "")}>
              <input type="radio" name="siddurNusach" value={n} checked={n === choice} onChange={() => setChoice(n)} />
              <span className="siddurNusachOptionText">
                <span className="siddurNusachName"><InterfaceText>{`siddur_nusach.${n}`}</InterfaceText></span>
                <span className="siddurNusachBook"><InterfaceText text={bookTitle(n)} /></span>
              </span>
            </label>
          ))}
        </div>
        {!Sefaria._uid ?
          <div className="siddurNusachLogin" data-signup-source="nusach_picker">
            <InterfaceText>siddur_nusach.log_in_to_remember</InterfaceText>
            <div className="siddurNusachLoginLinks">
              <a href={"/login" + nextParam} onClick={rememberChoice}><InterfaceText>misc.sign_in</InterfaceText></a>
              <span className="separator">·</span>
              <a href={"/register" + nextParam} onClick={rememberChoice}><InterfaceText>common.sign_up</InterfaceText></a>
            </div>
          </div> : null}
        <button className="button siddurNusachOk" onClick={() => onConfirm(choice)}>
          <InterfaceText>siddur_nusach.ok</InterfaceText>
        </button>
      </div>
    </div>
  );
};
SiddurNusachPicker.propTypes = {
  initialNusach: PropTypes.string,
  onConfirm:     PropTypes.func.isRequired,
  onClose:       PropTypes.func.isRequired,
  nextPathFor:   PropTypes.func,  // choice => path to return to after login/register
};

export {
  SiddurNusachPicker,
  adoptStoredNusach,
  bookTitle,
  openSiddurAtTimeOfDay,
  preferredNusach,
  saveNusachChoice,
  siddurUrl,
  timeOfDayUrl,
  viewerDefaultNusach,
};

import Sefaria from "./sefaria";

export async function getSegmentObjs(refs) {
    /*
    Given an array of ref-strings (could also be ranged refs),
    turn each ref to segment object and return an array of all segments
    */
    const segments = [];

    for (const ref of refs) {
      const text = await Sefaria.getText(ref, { stripItags: 1 });
      const newSegments = Sefaria.makeSegments(text, false);
      segments.push(...newSegments);
    }
    return segments;
}
export async function getNormalRef(ref) {
    /*
    Given a ref-string, get he and en normal ref-string
    */
    const refObj = await Sefaria.getRef(ref);
    return {en: refObj.ref, he: refObj.heRef}
}
function placedSegmentMapper(lang, segmented, includeNumbers, s) {
    /*
    Map each segment object to a formatted text string
    */
    if (!s[lang]) {return ""}

    let numStr = "";
    if (includeNumbers) {
        const num = (lang=="he") ? Sefaria.hebrew.encodeHebrewNumeral(s.number) : s.number;
        numStr = "<small>(" + num + ")</small> ";
    }
    let str = "<span class='segment'>" + numStr + s[lang] + "</span> ";
    if (segmented) {
        str = "<p>" + str + "</p>";
    }
    str = str.replace(/(<br\/>)+/g, ' ')
    return str;
}
export const segmentsToSourceText = (segments, lan) => {
    /*
    Turn array of segment objects into one chunk of formatted text
    */
    const segmented = shouldBeSegmented(segments[0].ref);
    const includeNumbers = shouldIncludeSegmentNums(segments[0].ref);
    return(segments.map(placedSegmentMapper.bind(this, lan, segmented, includeNumbers))
    .filter(Boolean)
    .join(""));
}
function shouldIncludeSegmentNums(ref){
    /*
    Decide if segment of this ref should have segment numbers when turned into text chunk
    */
    const indexTitle = Sefaria.refIndexTitle(ref);
    const categories =  Sefaria.refCategories(ref);
    if (categories.includes("Talmud")) {return false}
    if (indexTitle === "Pesach Haggadah") {return false}
    if (categories === 1) {return false}
    return true;
}
function shouldBeSegmented(ref){
    /*
    Decide if segment of this ref should be followed by new line when turned into text chunk
    */
    const categories =  Sefaria.refCategories(ref);
    return !(categories[0] in {"Tanakh": 1, "Talmud": 1});
}

export const editorSaveStates = {
  SAVED: 'saved',
  SAVING: 'saving',
  UNSAVED: 'unsaved',
  CONNECTION_LOST: 'connectionLost',
  USER_UNAUTHENTICATED: 'userUnauthenticated',
  UNKNOWN_ERROR: 'unknownError',
};
    /*
    Temporarily disables all user interactions (e.g. mouse, touch, keyboard, clipboard, form input) on a given DOM element and its children.
    */
export const disableUserInput = (root) => {
      if (!root) { return; }

      const blockEvent = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Store references so we can later remove them
      root._blockEventHandler = blockEvent;
      root._blockedEvents = [
        'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'contextmenu',
        'touchstart', 'touchend', 'touchmove', 'touchcancel',
        'keydown', 'keypress', 'keyup',
        'drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop',
        'focus', 'blur', 'focusin', 'focusout',
        'copy', 'cut', 'paste',
        // 'wheel', 'scroll',
        'submit', 'change', 'input'
      ];

      root._blockedEvents.forEach(event => {
        root.addEventListener(event, blockEvent, { capture: true });
      });

      root.style.pointerEvents = 'none';
      root.style.userSelect = 'none';
}

    /*
     re-enables all user interactions on a given DOM element and its children that were previously disabled.
    */
export const enableUserInput = (root) => {
  if (!root || !root._blockEventHandler || !root._blockedEvents) {return;}

  root._blockedEvents.forEach(event => {
    root.removeEventListener(event, root._blockEventHandler, { capture: true });
  });

  delete root._blockEventHandler;
  delete root._blockedEvents;

  root.style.pointerEvents = '';
  root.style.userSelect = '';
}
export const shouldUseEditor = (sheetID) => {
    const owner = Sefaria.sheets.loadSheetByID(sheetID)?.owner;
    return Sefaria._uid === owner && Sefaria._uses_new_editor;
}
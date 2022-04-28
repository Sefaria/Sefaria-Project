import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import findAndReplaceDOMText from 'findAndReplaceDOMText';
import { PopupManager } from "./popup";

const SEFARIA_BASE_URL = 'http://localhost:8000'

// hard-coding for now list of elements that get cut off with Readability
const SELECTOR_WHITE_LIST = {
    "etzion.org.il": ["p.footnote"],
    "torah.etzion.org.il": ["p.footnote"],
    "haretzion.linnovate.co.il": ["p.footonote"],
};

(function(ns) {
    function sanitizeElem(elem) {
        const cleaned = DOMPurify.sanitize(elem, { USE_PROFILES: { html: true } });
        const cleanedElem = document.createElement("div");
        cleanedElem.innerHTML = cleaned;
        return cleanedElem.textContent;
    }

    function getWhiteListText() {
        const whiteListSelectors = SELECTOR_WHITE_LIST[window.location.hostname];
        if (!whiteListSelectors) { return ""; }
        const whiteListElems = document.querySelectorAll(whiteListSelectors.join(", "));
        return [].reduce.call(whiteListElems, (prev, curr) => {
            return prev + sanitizeElem(removeUnwantedElems(curr));
        }, "");
    }

    function removeUnwantedElems(elem) {
        for (let tableEl of elem.getElementsByTagName('table')) {
            tableEl.remove();
        }
        return elem;
    }

    function unwrap(el) {
        /**
         * from https://plainjs.com/javascript/manipulation/unwrap-a-dom-element-35/
         * removes el and bumps up children to parent
         * */
        const parent = el.parentNode;
        // move all children out of the element
        while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
        }
        // remove the empty element
        parent.removeChild(el);
        // merge consecutive text nodes
        parent.normalize();
    }

    function removeExistingSefariaLinks() {
        for (let el of document.querySelectorAll('a.sefaria-ref, span.sefaria-ref-wrapper')) {
            unwrap(el);
        }
    }

    function getReadableText() {
        const documentClone = removeUnwantedElems(document.cloneNode(true));
        const readableObj = new Readability(documentClone).parse();
        return {text: sanitizeElem(readableObj.content), readableObj};
    }

    function findOccurences(text) {
        const occurences = [];
        findAndReplaceDOMText(document, {
            preset: 'prose',
            find: text,
            replace: function(portion, match) {
                if (portion.index === 0) {
                    occurences.push([match.startIndex, match.endIndex]);
                }
                return portion.text;
            }
        })
        return occurences;
    }

    function getNextWhiteSpaceIndex(text) {
        const match = text.match(/.\s+/m);  // `.` so whitespace can't be at beginning of string
        if (match === null) { return -1; }
        return match.index + match[0].length;
    }

    function getNthWhiteSpaceIndex(text, n, startIndex) {
        for (let i = 0; i < n; i++) {
            const nextIncrement = getNextWhiteSpaceIndex(text.substring(startIndex));
            if (nextIncrement === -1) { break; }
            startIndex += nextIncrement;
        }
        return startIndex;
    }

    function getNumWordsAround(linkObj, text, numWordsAround) {
        /**
         * gets text with `numWordsAround` number of words surrounding text in linkObj. Words are broken by any white space.
         * returns: {
         *     text: str with numWordsAround
         *     startChar: int, start index of linkObj text within numWordsAround text
         * }
         */
        let { startChar, endChar } = linkObj;
        const newEndChar = getNthWhiteSpaceIndex(text, numWordsAround, endChar);
        const newStartChar = text.length - getNthWhiteSpaceIndex(text.substr(1), numWordsAround, text.length - startChar);
        return {
            text: text.substring(newEndChar, newStartChar),
            startChar: startChar - newStartChar,
        };
    }

    function escReg(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    function getSearchRegex(searchText, linkText, linkStartChar) {
        /**
         * searchText: unique search string that contains linkText
         * linkText: text to be converted into a link
         * linkStartChar: start char index of linkText within searchText
         * returns: RegExp object with linkText wrapped in capturing group. properly handles regex escaping
         */
        const startText = escReg(searchText.substring(0, linkStartChar));
        const linkEndChar = linkStartChar + linkText.length;
        const endText = escReg(searchText.substring(linkEndChar));
        return new RegExp(`${startText}(${escReg(linkText)})${endText}`, 'gm');
    }

    function wrapRef(linkObj, normalizedText, maxNumWordsAround = 10) {
        if (!ns.debug && linkObj.linkFailed) { return; }
        let occurences = [];
        let numWordsAround = 0;
        let searchText = linkObj.text;
        let linkStartChar = 0;  // start index of link text within searchText
        while ((numWordsAround === 0 || occurences.length > 1) && numWordsAround < maxNumWordsAround) {
            occurences = findOccurences(searchText);
            if (occurences.length === 1) { break; }
            numWordsAround += 1;
            // see https://flaviocopes.com/javascript-destructure-object-to-existing-variable/
            ({ text: searchText, startChar: linkStartChar } = getNumWordsAround(linkObj, normalizedText, numWordsAround));
        }
        const searchRegex = getSearchRegex(searchText, linkObj.text, linkStartChar);
        if (numWordsAround > 0 || true) {
            console.log('----')
            console.log(numWordsAround, linkObj.text, linkStartChar);
            console.log(searchText.substring(linkStartChar));
            console.log(searchText);
            console.log(searchRegex);
        }

        // TODO: if numWordsAround > 0, search for searchText and then do an internal search for linkObj.text
        /*
        strategy:
        wrap linkObj.text in group in searchText. create RegExp object
        if (portion.indexInMatch > match.group(0).start && (portion.indexInMatch + portion.text.length) <= match.group(0).end) {
            portion only contains link. wrap portion in a-tag
        } else {
            portion contains some text that isn't link. wrap group 1 in a-tag and entire portion in span.
         */
        findAndReplaceDOMText(document, {
            preset: 'prose',
            find: linkObj.text,
            replace: function(portion, match) {
                const atag = document.createElement("a");
                atag.target = "_blank";
                atag.textContent = portion.text;
                atag.className = "sefaria-ref";
                if (ns.debug) {
                    atag.className += " sefaria-ref-debug";
                    if (linkObj.linkFailed) {
                        atag.className += " sefaria-link-failed";
                    }
                }

                if (linkObj.linkFailed) { return atag; }  // debug and linkFailed

                atag.href = `${SEFARIA_BASE_URL}/${linkObj.refs[0].url}`;
                atag.setAttribute('data-ref', linkObj.refs[0].ref);
                atag.setAttribute('aria-controls', 'sefaria-popup');
                return atag;
            }
        });
    }

    function onFindRefs(resp) {
        alert("Linker results are ready!");
        for (let linkObj of resp.text) {
            wrapRef(linkObj, ns.normalizedInputText);
        }
    }
    // public API

    ns.link = function({
        mode = "popup-click",
        selector = "body",           // CSS Selector
        excludeFromLinking = null,    // CSS Selector
        excludeFromTracking = null,   // CSS Selector
        popupStyles = {},
        interfaceLang = "english",
        contentLang = "bilingual",
        parenthesesOnly = false,
        quotationOnly = false,
        dynamic = false,
        hidePopupsOnMobile = true,
        debug = false,
    }) {
        ns.debug = debug;
        // useful to remove sefaria links for now but I think when released we only want this to run in debug mode
        if (debug || true) { removeExistingSefariaLinks(); }
        ns.popupManager = new PopupManager({ mode, interfaceLang, contentLang });
        ns.popupManager.setupPopup();
        const {text: readableText, readableObj} = getReadableText();
        ns.normalizedInputText = readableText + getWhiteListText();
        const postData = {
            text: ns.normalizedInputText,
            url: window.location.href,
            title: readableObj.title,
        }

        fetch(`${SEFARIA_BASE_URL}/api/find-refs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(postData)
        })
        .then(
            (resp) => {
                if (resp.ok) {
                    resp.json().then(onFindRefs);
                } else {
                    resp.text().then(text => alert(text));
                }
            }
        );
    }
}(window.sefariaV3 = window.sefariaV3 || {}));
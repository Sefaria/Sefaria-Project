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
        const occurrences = [];
        findAndReplaceDOMText(document, {
            preset: 'prose',
            find: text,
            replace: function(portion, match) {
                if (portion.index === 0) {
                    occurrences.push([match.startIndex, match.endIndex]);
                }
                return portion.text;
            }
        });
        return occurrences;
    }

    function getNextWhiteSpaceIndex(text) {
        const match = text.match(/\S\s+/);  // `\S` so whitespace can't be at beginning of string
        if (match === null) { return -1; }
        return match.index;
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
        const textRev = [...text].reverse().join("");
        const newStartChar = text.length - getNthWhiteSpaceIndex(textRev, numWordsAround, text.length - startChar) - 1;
        const wordsAroundText = text.substring(newStartChar, newEndChar + 1);
        return {
            text: wordsAroundText,
            startChar: startChar - newStartChar,
        };
    }

    function createATag(linkObj, text) {
        const atag = document.createElement("a");
        atag.target = "_blank";
        atag.textContent = text;
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

    function createWrapperTag(children = []) {
        const wrapper = document.createElement("span");
        wrapper.className="sefaria-ref-wrapper";
        for (let child of children) {
            if (!child) { continue; }
            wrapper.appendChild(child);
        }
        return wrapper;
    }

    function createTextNode(text, start, end) {
        const subtext = text.substring(start, end);
        if (subtext.length === 0) { return; }
        return document.createTextNode(subtext);
    }

    function wrapRef(linkObj, normalizedText, maxNumWordsAround = 10) {
        /**
         * wraps linkObj.text with an atag. In the case linkObj.text appears multiple times on the page,
         * increases search scope to ensure we wrap the correct instance of linkObj.text
         * linkObj: object representing a link, as returned by find-refs API
         * normalizedText: normalized text of webpage (i.e. webpage text returned from Readability and then put through some normalization)
         * maxNumWordsAround: maximum number of words around linkObj.text to search to try to find its unique occurrence.
         */
        if (!ns.debug && linkObj.linkFailed) { return; }
        let occurrences = [];
        let numWordsAround = 0;
        let searchText = linkObj.text;
        let linkStartChar = 0;  // start index of link text within searchText
        while ((numWordsAround === 0 || occurrences.length > 1) && numWordsAround < maxNumWordsAround) {
            occurrences = findOccurences(searchText);
            if (occurrences.length === 1) { break; }
            numWordsAround += 1;
            // see https://flaviocopes.com/javascript-destructure-object-to-existing-variable/
            ({ text: searchText, startChar: linkStartChar } = getNumWordsAround(linkObj, normalizedText, numWordsAround));
        }
        findAndReplaceDOMText(document, {
            preset: 'prose',
            find: searchText,
            replace: function(portion, match) {
                const portionEndIndex = portion.indexInMatch + portion.text.length;
                const linkEndChar = linkStartChar + linkObj.text.length;
                if (portion.indexInMatch >= linkStartChar && portionEndIndex <= linkEndChar) {
                    // portion only contains link text
                    return createATag(linkObj, linkObj.text);
                } else if (portion.indexInMatch < linkEndChar && portionEndIndex > linkStartChar) {
                    // portion contains some non-link text
                    // practically this case doesn't seem to come up because findOccurences effectively breaks up relevant matches into their own text nodes
                    // there may be 1-off errors here since it hasn't been tested
                    const startTextNode = createTextNode(portion.text, 0, linkStartChar - portion.indexInMatch);
                    const endTextNode = createTextNode(portion.text, linkEndChar - portion.indexInMatch);
                    const linkText = portion.text.substring(linkStartChar - portion.indexInMatch, linkEndChar - portion.indexInMatch);
                    const atag = createATag(linkObj, linkText);
                    return createWrapperTag([startTextNode, atag, endTextNode]);
                } else {
                    // all non-link text
                    return portion.text;
                }
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
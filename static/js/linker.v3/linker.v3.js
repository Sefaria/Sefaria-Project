import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import findAndReplaceDOMText from 'findAndReplaceDOMText';

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
        for (let el of document.querySelectorAll('a.sefaria-ref')) {
            unwrap(el);
        }
        for (let el of document.querySelectorAll('span.sefaria-ref-wrapper')) {
            unwrap(el);
        }
    }

    function getReadableText() {
        const documentClone = removeUnwantedElems(document.cloneNode(true));
        const readableObj = new Readability(documentClone).parse();
        return {text: sanitizeElem(readableObj.content), readableObj};
    }

    function onFindRefs(resp) {
        alert("Linker results are ready!");
        for (let linkObj of resp.text) {
            findAndReplaceDOMText(document, {
                preset: 'prose',
                find: linkObj.text,
                replace: function(portion, match) {
                    const atag = document.createElement("a");
                    atag.target = "_blank";
                    atag.className = "sefaria-ref";
                    atag.href = `${SEFARIA_BASE_URL}/${linkObj.refs[0].url}`;
                    atag.setAttribute('data-ref', linkObj.refs[0].ref);
                    atag.setAttribute('aria-controls', 'sefaria-popup');
                    atag.textContent = portion.text;
                    return atag;
                }
            });
        }
    }
    // public API

    ns.link = function({ debug }) {
        if (debug) { removeExistingSefariaLinks(); }
        const {text: readableText, readableObj} = getReadableText();
        const postData = {
            text: readableText + getWhiteListText(),
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
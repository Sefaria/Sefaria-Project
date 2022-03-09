import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
const SEFARIA_BASE_URL = 'http://localhost:8000'
// harding for now list of elements that get cut off with Readability
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
    function getReadableText() {
        const documentClone = removeUnwantedElems(document.cloneNode(true));
        const readableObj = new Readability(documentClone).parse();
        return {text: sanitizeElem(readableObj.content), readableObj};
    }

    // public API

    ns.link = function() {
        const {text: readableText, readableObj} = getReadableText();
        const postData = {
            text: readableText + getWhiteListText(),
            url: window.location.href,
            title: readableObj.title,
        }

        fetch(`${SEFARIA_BASE_URL}/api/wrap-refs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(postData)
        })
        .then(
            (resp) => {
                if (resp.ok) {
                    alert("Linker results are ready!");
                } else {
                    resp.text().then(text => alert(text));
                }
            }
        );
    }
}(window.sefariaV3 = window.sefariaV3 || {}));
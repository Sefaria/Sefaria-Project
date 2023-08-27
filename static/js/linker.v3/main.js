import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import findAndReplaceDOMText from 'findandreplacedomtext';
import { PopupManager } from "./popup";
import {LinkExcluder} from "./excluder";


(function(ns) {
    function sanitizeElem(elem) {
        const cleaned = DOMPurify.sanitize(elem, { USE_PROFILES: { html: true } });
        const cleanedElem = document.createElement("div");
        cleanedElem.innerHTML = cleaned;
        return cleanedElem.textContent;
    }

    function getWhitelistText(currText) {
        if (!ns.whitelistSelectors || ns.whitelistSelectors.length === 0) { return ""; }
        const whitelistElems = document.querySelectorAll(ns.whitelistSelectors.join(", "));
        return [].reduce.call(whitelistElems, (prev, curr) => {
            const currCleaned = sanitizeElem(removeUnwantedElems(curr));
            if (currText.indexOf(currCleaned) > -1) { return prev; }  // assumption is this text was already included by Readability so no need to include again
            return prev + currCleaned;
        }, "");
    }

    function getTextAroundElemInDir(elem, nchars, isPrev) {
        let context = "";
        if (!elem || nchars <= 0) { return context; }
        let sibling = elem;
        while (context.length < nchars) {
            sibling = isPrev ? sibling.previousSibling : sibling.nextSibling;
            const tempContext = (sibling === null) ?
                getTextAroundElemInDir(elem.parentNode, nchars - context.length, isPrev) :
                sibling.textContent;
            context = isPrev ? (tempContext + context) : context + tempContext;
        }

        return isPrev ? context.slice(-nchars) : context.slice(0, nchars);
    }

    function getTextAroundElem(elem, nchars) {
        const prev = getTextAroundElemInDir(elem, nchars, true);
        const next = getTextAroundElemInDir(elem, nchars, false);
        return [prev, next];
    }

    function removeUnwantedElems(elem) {
        const unwantedTags = ['table', 'sup'];
        for (let tag of unwantedTags) {
            for (let unwantedElem of elem.getElementsByTagName(tag)) {
                unwantedElem.remove();
            }
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

    function readabilitySerializer(elem) {
        let text = "";
        const isNonCts = !!findAndReplaceDOMText.NON_CONTIGUOUS_PROSE_ELEMENTS[elem.nodeName.toLowerCase()];
        if (isNonCts) { text += "\n"; }
        if (elem.childNodes.length === 0) {
            text = elem.innerHTML || elem.textContent;
        }
        for (let child of elem.childNodes) {
            text += readabilitySerializer(child);
        }
        return text;
    }

    function getReadableText() {
        const documentClone = removeUnwantedElems(document.cloneNode(true));
        const readableObj = new Readability(documentClone, {
            serializer: readabilitySerializer,
        }).parse();
        return {text: sanitizeElem(readableObj.content), readableObj};
    }

    function findOccurrences(text) {
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
        if (match === null || text.substring(0, match.index+1).indexOf('\n') > -1) { return -1; }  // \n's are added in by Readability and therefore make it challenging to match against. stop when you hit one.
        return match.index + 1;
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
        if (numWordsAround === 0) {
            return { text: linkObj.text, startChar: 0 };
        }
        const newEndChar = getNthWhiteSpaceIndex(text, numWordsAround, endChar);
        const textRev = [...text].reverse().join("");
        const newStartChar = text.length - getNthWhiteSpaceIndex(textRev, numWordsAround, text.length - startChar);
        const wordsAroundText = text.substring(newStartChar, newEndChar);
        return {
            text: wordsAroundText,
            startChar: startChar - newStartChar,
        };
    }

    function createATag(linkFailed, ref, text, url, isAmbiguous, iLinkObj, resultsKey) {
        const atag = document.createElement("a");
        atag.target = "_blank";
        atag.textContent = text;
        atag.className = "sefaria-ref";
        if (ns.debug) {
            atag.className += " sefaria-ref-debug";
            if (linkFailed) { atag.className += " sefaria-link-failed"; }
            if (isAmbiguous) { atag.className += " sefaria-link-ambiguous"; }
        }

        atag.setAttribute('data-result-index', iLinkObj);
        atag.setAttribute('data-result-key', resultsKey);

        if (linkFailed) { return atag; }  // debug and linkFailed

        atag.href = `${ns.sefariaUrl}/${url}`;
        atag.setAttribute('data-ref', ref);
        atag.setAttribute('aria-controls', 'sefaria-popup');
        return atag;
    }

    function createATagWithDebugInfo(urls, linkObj, text, iLinkObj, resultsKey) {
        /**
         * if urls is null or len 1, return a tag
         * else, return a span with n a tags to represent an ambiguous reference.
         * urls should only be more than len 1 in debug mode
         */
        if (!urls || (!ns.debug && urls.length > 1)) {
            return createATag(linkObj.linkFailed, null, text, null, false, iLinkObj, resultsKey);
        } else if (urls.length === 1) {
            return createATag(linkObj.linkFailed, linkObj.refs[0], text, urls[0], false, iLinkObj, resultsKey);
        } else {
            // debug and more than 1 url
            const node = document.createElement("span");
            node.className="sefaria-ref-wrapper";
            for (let i = 0; i < urls.length; i++) {
                const tempText = i === 0 ? text : `[${i}]`;
                const atag = createATag(linkObj.linkFailed, linkObj.refs[i], tempText, urls[i], true, iLinkObj, resultsKey);
                node.appendChild(atag);
            }
            return node;
        }
    }

    function wrapRef(linkObj, normalizedText, refData, iLinkObj, resultsKey, maxNumWordsAround = 10, maxSearchLength = 30) {
        /**
         * wraps linkObj.text with an atag. In the case linkObj.text appears multiple times on the page,
         * increases search scope to ensure we wrap the correct instance of linkObj.text
         * linkObj: object representing a link, as returned by find-refs API
         * normalizedText: normalized text of webpage (i.e. webpage text returned from Readability and then put through some normalization)
         * refData: refData field as returned from find-refs API
         * iLinkObj: index of linkObj in results list
         * maxNumWordsAround: maximum number of words around linkObj.text to search to try to find its unique occurrence.
         * maxSearchLength: if searchText is beyond this length, we assume the string uniquely identifies the citation. Even if there are multiple occurrences, we assume they can be wrapped with the same citation.
         */
        if (!ns.debug && (linkObj.linkFailed || linkObj.refs.length > 1)) { return; }
        const urls = linkObj.refs && linkObj.refs.map(ref => refData[ref].url);
        document.normalize();
        let occurrences = [];
        let numWordsAround = 0;
        let searchText = linkObj.text;
        let linkStartChar = 0;  // start index of link text within searchText
        const excluder = new LinkExcluder(ns.excludeFromLinking, ns.excludeFromTracking);
        while ((numWordsAround === 0 || occurrences.length > 1) && numWordsAround < maxNumWordsAround) {
            // see https://flaviocopes.com/javascript-destructure-object-to-existing-variable/
            ({ text: searchText, startChar: linkStartChar } = getNumWordsAround(linkObj, normalizedText, numWordsAround));
            occurrences = findOccurrences(searchText);
            numWordsAround += 1;
            if (searchText.length >= maxSearchLength) { break; }
        }
        if (occurrences.length === 0 || (occurrences.length > 1 && searchText.length < maxSearchLength)) {
            if (ns.debug) {
                console.log("MISSED", numWordsAround, occurrences.length, linkObj);
            }
            return;
        }
        const globalLinkStarts = occurrences.map(([start, end]) => linkStartChar + start);
        findAndReplaceDOMText(document, {
            preset: 'prose',
            find: linkObj.text,
            replace: function(portion, match) {
                // check this is the unique match found above
                if (globalLinkStarts.indexOf(match.startIndex) === -1) { return portion.text; }

                // check if should be excluded from linking and/or tracking
                const matchKey = match.startIndex + "|" + match.endIndex;
                const [excludeFromLinking, excludeFromTracking] = excluder.shouldExclude(matchKey, portion.node);
                if (excludeFromLinking) { return portion.text; }
                if (!excludeFromTracking) { /* TODO ns.trackedMatches.push(matched_ref); */ }
                return createATagWithDebugInfo(urls, linkObj, portion.text, iLinkObj, resultsKey);
            }
        });
    }

    function handleApiResponse(resp) {
        if (resp.ok) {
            return resp.json();
        } else if (ns.debug) {
            resp.text().then(text => alert(text));
        }
        return Promise.reject("API response not ok");
    }

    function onFindRefs(resp) {
        const startTime = performance.now();
        let numResults = 0;
        ns.debugData = [];
        for (let resultsKey of ['title', 'body']) {
            ns.debugData = ns.debugData.concat(resp[resultsKey].debugData);
            resp[resultsKey].results.map((linkObj, iLinkObj) => {
                wrapRef(linkObj, ns.normalizedInputText[resultsKey], resp[resultsKey].refData, iLinkObj + numResults, resultsKey);
            });
            bindRefClickHandlers(resp[resultsKey].refData, resultsKey);
            numResults += resp[resultsKey].results.length;
        }
        const endTime = performance.now();
        if (ns.debug) {
            alert(`Linker results are ready! Took ${endTime - startTime} ms to wrap. ${numResults} citations wrapped`);
        }
    }

    function reportCitation(elem, event, ...rest) {
        const reason = prompt("What is wrong with this citation?");
        const [prevContext, nextContext] = getTextAroundElem(elem, 20);
        const iLinkObj = elem.getAttribute('data-result-index');
        const postData = {
            prevContext, nextContext, reason,
            citation: elem.textContent,
            debugData: ns.debugData[iLinkObj],
            url: window.location.href,
        };
        console.log("Report citation debug info:", postData);
        fetch(`${ns.sefariaUrl}/api/find-refs/report`, {
            method: 'POST',
            body: JSON.stringify(postData)
        })
        .then(handleApiResponse);
    }

    function bindRefClickHandlers(refData, resultsKey) {
        // Bind a click event and a mouseover event to each link
        [].forEach.call(document.querySelectorAll(`.sefaria-ref[data-result-key="${resultsKey}"]`),(elem) => {
            const ref = elem.getAttribute('data-ref');
            if (!ref && !ns.debug) { /* failed link */ return; }
            const source = refData[ref] || {};
            source.ref = ref;
            ns.popupManager.bindEventHandler(elem, ns.sefariaUrl, source);
        });
    }

    function getPageUrl() {
        const canonical = document.head.querySelector("link[rel~=canonical]");
        // don't use canonical url if dynamic site b/c canonical urls tend to only be correct on initial load
        return (canonical && !ns.dynamic) ? canonical.href : window.location.href;
    }

    function getPageDescription() {
        const meta = document.head.querySelector("meta[name~=description]")
            || document.head.querySelector("meta[property~=description]")
            || document.head.querySelector("meta[name~='og:description']")
            || document.head.querySelector("meta[property~='og:description']")
            || document.head.querySelector("meta[name~='twitter:description']")
            || document.head.querySelector("meta[property~='twitter:description']");
        return meta ? meta.content : "";
    }

    function getPopupModeOnMobile(mode) {
        if (window.innerWidth < 700) {
            // If the screen is small, default to link mode
            return "link";
        }
        return mode;
    }

    function getFindRefsUrl() {
        const params = {
            with_text: 1,
            debug: 0 + ns.debug,
            max_segments: ns.maxParagraphs,
        }
        const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${value}`)
            .join('&')
        return `${ns.sefariaUrl}/api/find-refs?${queryString}`;
    }

    function getWebsiteApiUrl() {
        const domain = new URL(getPageUrl()).host;
        if (!domain) { return null; }
        return `${ns.sefariaUrl}/api/websites/${encodeURIComponent(domain)}`;
    }

    function getFindRefsRequest() {
        const {text: readableText, readableObj} = getReadableText();
        ns.normalizedInputText = {
            body: readableText + getWhitelistText(readableText),
            title: readableObj.title,
        };
        return {
            metaDataForTracking: {
                url: getPageUrl(),
                description: getPageDescription(),
                title: document.title,
            },
            version_preferences_by_corpus: ns.versionPreferencesByCorpus,
            text: {
                ...ns.normalizedInputText,
            },
        };
    }

    function getFullWhitelistSelectors(userWhitelistSelector) {
        const url = getWebsiteApiUrl();
        if (!url) { return Promise.resolve([]); }
        return fetch(url)
            .then(handleApiResponse)
            .then(json => {
                return json.whitelist_selectors || [];
            })
            .then(websiteWhitelistSelectors => {
                if (userWhitelistSelector) {
                    return websiteWhitelistSelectors.concat([userWhitelistSelector]);
                }
                return websiteWhitelistSelectors;
            });
    }

    function findRefs() {
        const postData = getFindRefsRequest();
        return makeFindRefsApiRequest(postData).then(onFindRefs);
    }

    function makeFindRefsApiRequest(postData) {
        return new Promise((resolve, reject) => {
            fetch(getFindRefsUrl(), {
                method: 'POST',
                body: JSON.stringify(postData)
            })
                .then(handleApiResponse)
                .then(resp => resolve(resp));
        });
    }

    function deprecatedOptionsWarning({ selector, excludeFromTracking, parenthesesOnly, quotationOnly } = {}) {
        if (selector || excludeFromTracking || parenthesesOnly || quotationOnly) {
            console.warn("Deprecation warning: you are currently using at least one of the following deprecated options:" +
                " `selector`, `excludeFromTracking`, `parenthesesOnly`, `quotationOnly`. These options no longer are" +
                " used and you can safely remove them. See here for documentation: https://github.com/Sefaria/Sefaria-Project/wiki/Sefaria-Auto-Linker-v3")
        }
    }

    function getMode({ mode, hidePopupsOnMobile }) {
        if (hidePopupsOnMobile) {
            return getPopupModeOnMobile(mode);
        }
        return mode;
    }

    function applyDefaultOptions(options) {
        const defaultOptions = {
            sefariaUrl: "https://www.sefaria.org",  // for configuring which backend linker communicates with
            mode: "popup-click",
            whitelistSelector: null,
            excludeFromLinking: null,    // CSS Selector
            popupStyles: {},
            interfaceLang: "english",
            contentLang: "bilingual",
            dynamic: false,
            hidePopupsOnMobile: true,
            debug: false,
            versionPreferencesByCorpus: null,

            // Deprecated options
            selector: null,           // CSS Selector
            excludeFromTracking: null,   // CSS Selector
            parenthesesOnly: false,
            quotationOnly: false,
        };
        return {...defaultOptions, ...options};
    }

    // public API

    ns.link = function(inputOptions) {
        deprecatedOptionsWarning(inputOptions);
        const options = applyDefaultOptions(inputOptions);
        ns.sefariaUrl = options.sefariaUrl;
        ns.excludeFromLinking = options.excludeFromLinking;
        ns.dynamic = options.dynamic;
        ns.debug = options.debug;
        ns.versionPreferencesByCorpus = options.versionPreferencesByCorpus;
        ns.maxParagraphs = 20;
        // useful to remove sefaria links for now but I think when released we only want this to run in debug mode
        if (options.debug || true) { removeExistingSefariaLinks(); }
        const mode = getMode(options);
        ns.popupManager = new PopupManager({ mode, reportCitation, ...options });
        ns.popupManager.setupPopup();

        getFullWhitelistSelectors(options.whitelistSelector)
            .then(whitelistSelectors => ns.whitelistSelectors = whitelistSelectors)
            .then(findRefs);
    }
}(window.sefaria = window.sefaria || {}));
// this module is for saving text cache
// its interface, TextCache, gets api response and stores it.
// its getter gets ref, language and versionTitle and returns a response-like object (for only one version)
// for saving memory there are different objects for storing general data of books, versions and sections
// the text itself stored in the segment level
// the principle of the structure is that setting and getting will be done by keys, so the extraction will be quick

import Sefaria from "./sefaria";

const BOOK_ATTRS = new Set(['primary_category', 'type', 'indexTitle', 'categories', 'heIndexTitle', 'isComplex',
    'isDependant', 'order', 'collectiveTitle', 'heCollectiveTitle']);
const SECTION_ATTRS = new Set(['sectionRef', 'heSectionRef', 'next', 'prev', 'title', 'book', 'lengths', 'length',
    'textDepth', 'sectionNames', 'addressTypes', 'heTitle', 'titleVariants', 'heTitleVariants', 'index_offsets_by_depth',
    'isSpanning', 'spanningRefs', 'alts', 'firstAvailableSectionRef', 'indexTitle']);
const REF_ATTRS = new Set(['ref', 'heRef', 'sections', 'toSections', 'sectionRef']);


class BookAndVersionsDetails {
    // this class is an object that stores the book details and its versions details
    constructor() {
        this.versions = {}
        this.general = {}
    }
    set(response) {
        BOOK_ATTRS.forEach((attr) => {
            this.general[attr] = response[attr];
        })
        response.versions.forEach((version) => {
            const {actualLanguage, versionTitle} = { ...version };
            if (!this.versions[actualLanguage]) {
                this.versions[actualLanguage] = {};
            }
            this.versions[actualLanguage][versionTitle] = { ...version };
            delete this.versions[actualLanguage][versionTitle].text;
        })
    }
    get(language, versionTitle) {
        let version = { ...this.versions[language]?.[versionTitle] };
        if (Object.keys(version).length) {
            return {
                versions: [version],
                ...this.general
            };
        }
    }
}


class Ref {
    // this class is the father of Section and Segment. it handles the data about the ref
    constructor() {
        this.refAttrs = {};
    }
    set(refAttrs) {
        REF_ATTRS.forEach((attr) => {
            this.refAttrs[attr] = refAttrs[attr];
        })
    }
    get_text() {
    }
    get(language, versionTitle) {
        const text = this.get_text(language, versionTitle);
        if (text) {
            return {
                refAttrs: this.refAttrs,
                text: text
            };
        }
    }
}


class Segment extends Ref {
    // this class is an object stores Segment text
    // it is an object of languages, with an object of versionTitles for each language
    constructor() {
        super();
        this.texts = {};
    }
    _addLangIfMissing(language) {
        if (!(language in this.texts)) {
            this.texts[language] = {};
        }
    }
    set(language, versionTitle, refAttrs, text) {
        super.set(refAttrs)
        this._addLangIfMissing(language);
        this.texts[language][versionTitle] = text;
    }
    get_text(language, versionTitle) {
        return this.texts[language]?.[versionTitle];
    }
}


class Section extends Ref {
    // this class is object that stores section - its segment attribute is array of Segments
    constructor() {
        super();
        this.segments = [];
    }
    set(refAttrs, segmentObjects) {
        super.set(refAttrs);
        this.segments = segmentObjects;
    }
    get_text(language, versionTitle) {
        const segmenets = this.segments.map((segment) => {
            return segment.get_text(language, versionTitle);
        })
        // check that no element in array is undefined
        if (segmenets.every((segment) => segment !== undefined)) {
            return segmenets;
        }
    }
}


class TextCache {
    // this is the interface
    // its setter gets the response, and the getter gets ref, language and versionTitle, and returns a response-like object with one version
    constructor() {
        this.refs = {};
        this.books = {};
        this.sectionsAttrs = {};
    }
    _setBookDetails(title, response) {
        if (!this.books[title]) {
            this.books[title] = new BookAndVersionsDetails();
        }
        this.books[title].set(response);
    }
    _setSectionAttrs(sectionRef, response) {
        this.sectionsAttrs[sectionRef] = {};
        SECTION_ATTRS.forEach((attr) => {
            this.sectionsAttrs[sectionRef][attr] = response[attr];
        })
    }
    _createNew(ref, className) {
        if (!(ref in this.refs)) {
            this.refs[ref] = new className();
        }
    }
    _setSegment(ref, language, versionTitle, response, text) {
        this._createNew(ref, Segment)
        this.refs[ref].set(language, versionTitle, response, text);
    }
    _setSection(ref, language, versionTitle, response, text) {
        this._createNew(ref, Section)
        const offset = Sefaria._get_offsets(response);
        const start =  1 + offset[0];
        const segments = [];
        text.forEach((segmentText, i) => {
            const segmentNum = start + i;
            const segmentRef = `${ref}:${segmentNum}`;
            const refAttrs = {
                ref: segmentRef,
                heRef: `${response.heRef}:${Sefaria.hebrew.encodeHebrewNumeral(segmentNum)}`,
                sections: response.sections.concat(i+1),
                toSections: response.sections.concat(i+1),
                sectionRef: ref
            };
            this._setSegment(segmentRef, language, versionTitle, refAttrs, segmentText);
            segments.push(this.refs[segmentRef])
        })
        this.refs[ref].set(response, segments)
    }
    set(response) {
        // the response should be for segment ref or bottom level section ref (not above, and not ranged)
        const {indexTitle, ref, sectionRef} = { ...response };
        this._setBookDetails(indexTitle, response);
        this._setSectionAttrs(sectionRef, response);
        const isSectionLevel = ref === sectionRef;
        response.versions.forEach((version) => {
            const {actualLanguage, versionTitle} = { ...version };
            if (isSectionLevel) {
                this._setSection(ref, actualLanguage, versionTitle, response, version.text);
            } else {
                this._setSegment(ref, actualLanguage, versionTitle, response, version.text);
            }
        })
    }
    get(ref, language, versionTitle) {
        const textObject = this.refs[ref]?.get(language, versionTitle);
        if (textObject) {
            const sectionAttrs = this.sectionsAttrs[textObject.refAttrs.sectionRef];
            const book = this.books[sectionAttrs.indexTitle].get(language, versionTitle);
            if (book) {
                const returnObj = {
                    ...this.books[sectionAttrs.indexTitle].get(language, versionTitle),
                    ...sectionAttrs,
                    ...textObject.refAttrs
                };
                returnObj.versions[0].text = textObject.text;
                return returnObj;
            }
        }
    }
}


const CACHE = new TextCache();
export default CACHE;

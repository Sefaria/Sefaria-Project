import VersionPreferences from "./VersionPreferences";

var extend     = require('extend'),
    param      = require('querystring').stringify;
import Search from './search';
import Strings from './strings';
import palette from './palette';
import Track from './track';
import Hebrew from './hebrew';
import Util from './util';
import $ from './sefariaJquery';
import Cookies from 'js-cookie';


let Sefaria = Sefaria || {
  _dataLoaded: false,
  _inBrowser: (typeof document !== "undefined"),
  toc: [],
  books: [],
  booksDict: {},
  last_place: [],
  apiHost: "" // Defaults to localhost, override to talk another server
};

if (typeof window !== 'undefined') {
    window.Sefaria = Sefaria; // allow access to `Sefaria` from console
}

Sefaria = extend(Sefaria, {
  _parseRef: {}, // cache for results of local ref parsing
  parseRef: function(q) {
  // Client side ref parsing without depending on book index data.
  // Does depend on Sefaria.booksDict.
  // One of the oldest functions in Sefaria! But should be intelligently merged into Sefaria.ref()
      q = q || "";
      q = decodeURIComponent(q);
      q = q.replace(/_/g, " ").replace(/[.:]/g, " ").replace(/ +/, " ");
      q = q.trim().toFirstCapital();
      if (q in Sefaria._parseRef) { return Sefaria._parseRef[q]; }

      const response = {book: false,
                      index: false,
                      sections: [],
                      toSections: [],
                      ref: ""};
      if (!q) {
          Sefaria._parseRef[q] = response;
          return response;
      }

      const toSplit = q.split("-");
      const first   = toSplit[0];

      let book, index, nums;
      for (let i = first.length; i >= 0; i--) {
          book   = first.slice(0, i);
          if (Sefaria.virtualBooks.includes(book)) {
              // todo: This assumes that this is a depth one integer indexed node
              const numberMatch = first.match(/([\d ]+)$/);
              if (numberMatch) {
                  nums = String(+numberMatch[0]);
                  book = first.slice(0, numberMatch.index)
              } else {
                  book = first;
              }
              break;
          }
          if (book in Sefaria.booksDict || book === "Sheet") {
              const remainder = first.slice(i);
              if (remainder && remainder[0] !== " ") {
                continue; // book name must be followed by a space, Jobs != Job
              }
              nums = remainder.slice(1);
              break;
          }
      }
      // Get the root index name. (For complex works, this may be different than `book`)
      for (let i = book.length; i >= 0; i--) {
          index = book.slice(0,i);
          if (this.index(index)) { break; }
      }
      if (!book) {
          Sefaria._parseRef[q] = {"error": "Unknown book."};
          return Sefaria._parseRef[q];
      }

      if (nums && !nums.match(/\d+[ab]?( \d+)*$/)) {
          Sefaria._parseRef[q] = {"error": "Bad section string."};
          console.log(Sefaria._parseRef[q]);
          return Sefaria._parseRef[q];
      }

      response.index      = index;
      response.book       = book;
      response.sections   = nums ? nums.split(" ") : [];
      response.toSections = nums ? nums.split(" ") : [];
      response.ref        = q;

      // Parse range end (if any)
      if (toSplit.length === 2) {
          const toSections = toSplit[1].replace(/[.:]/g, " ").split(" ");
          const diff = response.sections.length - toSections.length;
          for (let i = diff; i < toSections.length + diff; i++) {
              response.toSections[i] = toSections[i-diff];
          }
      }

      Sefaria._parseRef[q] = response;
      return response;
  },
  makeRef: function(q) {
      // Returns a string ref corresponding to the parsed ref `q` (like Ref.url() in Python)
      if (!(q.book && q.sections && q.toSections)) {
          return {"error": "Bad input."};
      }
      let ref = q.book.replace(/ /g, "_");
      ref = encodeURIComponent(ref);

      if (q.sections.length)
          ref += "." + q.sections.join(".");

      if (!q.sections.compare(q.toSections)) {
          let i;
          for (i = 0; i < q.toSections.length; i++)
              if (q.sections[i] !== q.toSections[i]) break;
          ref += "-" + q.toSections.slice(i).join(".");
      }

      return ref;
  },
  normRef: function(ref) {
      // Returns a string of the URL normalized form of `ref` (using _ for spaces and . for section seprator).
      // `ref` may be a string, or an array of strings. If ref is an array of strings, it is passed to normRefList.
      if (ref instanceof Array) {
        return Sefaria.normRefList(ref);
      }
      const norm = Sefaria.makeRef(Sefaria.parseRef(ref));
      if (typeof norm === "object" && "error" in norm) {
          // If the ref doesn't parse, just replace spaces with undescores.
          return typeof ref === "string" ? ref.replace(/ /g, "_") : ref;
      }
      return norm;
  },
  humanRef: function(ref) {
      // Returns a string of the normalized form of `ref`.
      // `ref` may be a string, or an array of strings. If ref is an array of strings, it is passed to normRefList.
      ref = Sefaria.normRef(ref);
      const pRef = Sefaria.parseRef(ref);
      if (pRef.error) {return ref}
      if (pRef.sections.length === 0) { return pRef.book; }
      const book = pRef.book + " ";
      const hRef = pRef.ref.replace(/ /g, ":");
      return book + hRef.slice(book.length);
  },
  isRef: function(ref) {
    // Returns true if `ref` appears to be a ref relative to known books in Sefaria.books
    const q = Sefaria.parseRef(ref);
    return ("book" in q && q.book);
  },
  normRefList: function(refs) {
    // Returns a single string ref corresponding the range expressed in the list of `refs`
    // e.g. ["Genesis 1:4", "Genesis 1:5", "Genesis 1:6"] -> "Genesis 1:4-6"
    if (refs.length === 1) {
      return refs[0];
    }
    const pRef = Sefaria.parseRef(refs[0]);
    const pRefEnd = Sefaria.parseRef(refs[refs.length-1]);
    if (pRef.book !== pRefEnd.book) {
      return refs[0]; // We don't handle ranges over multiple nodes of complex texts
    }
    const nRef = Sefaria.util.clone(pRef);
    nRef.toSections = pRefEnd.toSections;
    return Sefaria.makeRef(nRef);
  },
  joinRefList: function(refs, lang){
    // Returns a string Ref in `lang` that corresponds to the range of refs in `refs`
    // Hebrew results depend on `refs` being available in the refs cache.
      //only use for display as it doesn't rely on any ref parsing!
      //since this is just string manipulation it works language agnostically.
      //does not work well in cases like Genesis 1:10, Genesis 1:15 (will return Genesis 1:10-5). Needs fixing
      //Deuteronomy 11:32-2:1 instead of Deuteronomy 11:32-12:1
      const refStrAttr = {
          "he" : "heRef",
          "en": "ref"
      }[lang];
      if(!refs.length){ return null ;}
      let start, end;
      if (refs[0].indexOf("-") != -1) { // did we get a ranged ref for some reason inside the arguemnts
          let startSplit = Sefaria.splitRangingRef(refs[0])
          start = Sefaria.getRefFromCache(startSplit[0]);
      }else{
          start = Sefaria.getRefFromCache(refs[0]);
      }
      if (!start) { // We don't have this ref in cache, fall back to normRefList and sorry no Hebrew
        return Sefaria.humanRef(Sefaria.normRefList(refs));
      }
      start = start[refStrAttr]
      if (refs[refs.length - 1].indexOf("-") != -1) {
          let endSplit = Sefaria.splitRangingRef(refs[refs.length - 1]);
          end = Sefaria.getRefFromCache(endSplit[endSplit.length -1])[refStrAttr];
      }else{
          end = Sefaria.getRefFromCache(refs[refs.length - 1])[refStrAttr];
      }
       //deal with case where this doesnt exist in cache with getName or a new function o combine refs from server side

      //TODO handle ranged refs as input
      if(start == end){
          return start;
      }
      //break down refs into textual part and "numeric "address parts, the comparison of the numeric parts has to be atomic and not char by char
      const lastSpaceStart = start.lastIndexOf(" ");
      const namedPartStart =  start.substr(0, lastSpaceStart);
      const addressPartStart = start.substr(lastSpaceStart + 1).split(":");
      const lastSpaceEnd = end.lastIndexOf(" ");
      const namedPartEnd =  end.substr(0, lastSpaceEnd);
      const addressPartEnd = end.substr(lastSpaceEnd + 1).split(":");
      if(namedPartStart != namedPartEnd){
          //the string part is different already, so the numeric parts will be for sure separated correctly.
          //works mostly for ranged complex text refs
          const similarpart = Sefaria.util.commonSubstring(start, end);
          const startDiff = start.substring(similarpart.length, start.length);
          const endDiff = end.substring(similarpart.length, end.length);
          return `${similarpart}${startDiff}-${endDiff}`;
      }else{
          let similaraddrs = []
          const addrLength = Math.min(addressPartStart.length, addressPartEnd.length);
          let index = 0;
          while(index<addrLength && addressPartStart[index] === addressPartEnd[index]){
              similaraddrs.push(addressPartStart[index]);
              index++;
          }
          const addrStr = similaraddrs.join(":")+(index == 0? "" : ":")+addressPartStart.slice(index).join(":")+"-"+addressPartEnd.slice(index).join(":");
          return `${namedPartStart} ${addrStr}`
      }
  },
  refContains: function(ref1, ref2) {
    // Returns true is `ref1` contains `ref2`
    const oRef1 = Sefaria.parseRef(ref1);
    const oRef2 = Sefaria.parseRef(ref2);
    //need to convert to ints, add ancestors for complex and copy logic from server

    if ("error" in oRef1 || "error" in oRef2) { return null; }

    //We need numerical representations of the sections, and not to trip up on talmud sections
    if (oRef2.index !== oRef2.index || oRef1.book !== oRef2.book) { return false; }
    const [oRef1sections, oRef1toSections, oRef2sections, oRef2toSections] = [oRef1.sections, oRef1.toSections, oRef2.sections, oRef2.toSections].map(arr =>
        arr.map(x => x.match(/\d+[ab]/) ? Sefaria.hebrew.dafToInt(x) : parseInt(x))
    )

    const sectionsLen = Math.min(oRef1sections.length, oRef2sections.length);
    //duplicated from server side logic to finally fix
    for (let i = 0; i < sectionsLen; i++) {
      if (oRef2toSections[i] > oRef1toSections[i]) {
        return false;
      }
      if (oRef2toSections[i] < oRef1toSections[i]) {
        break;
      }
    }
    for (let i = 0; i < sectionsLen; i++) {
      if (oRef2sections[i] < oRef1sections[i]) {
        return false;
      }
      if (oRef2sections[i] > oRef1sections[i]) {
        break;
      }
    }
    return true;
  },
  refCategories: function(ref) {
    // Returns the text categories for `ref`
    let pRef = Sefaria.parseRef(ref);
    if ("error" in pRef) { return []; }
    let index = Sefaria.index(pRef.index);
    return index && index.categories ? index.categories : [];
  },
  sectionRef: function(ref) {
    // Returns the section level ref for `ref` or null if no data is available
    const oref = this.getRefFromCache(ref);
    return oref ? oref.sectionRef : null;
  },
  splitSpanningRefNaive: function(ref){
      if (ref.indexOf("-") == -1) { return ref; }
      return ref.split("-");
  },
  splitRangingRef: function(ref) {
    // Returns an array of segment level refs which correspond to the ranging `ref`
    // e.g. "Genesis 1:1-2" -> ["Genesis 1:1", "Genesis 1:2"]
    if (!ref || typeof ref === "object" || typeof ref === "undefined") { debugger; }

    if (ref.indexOf("-") == -1) { return [ref]; }

    const oRef     = Sefaria.parseRef(ref);
    const isDepth1 = oRef.sections.length === 1;
    const textData = Sefaria.getTextFromCache(ref);
    if (textData) {
        return Sefaria.makeSegments(textData).map(segment => segment.ref);
    } else if (!isDepth1 && oRef.sections[oRef.sections.length - 2] !== oRef.toSections[oRef.sections.length - 2]) {
      // TODO handle spanning refs when no text data is available to answer how many segments are in each section.
      // e.g., in "Shabbat 2a:5-2b:8", what is the last segment of Shabbat 2a?
      // For now, just return the split of the first non-spanning ref.
      const newRef = Sefaria.util.clone(oRef);
      newRef.toSections = newRef.sections;
      return Sefaria.splitRangingRef(this.humanRef(this.makeRef(newRef)));

    } else {
      const refs  = [];
      const start = oRef.sections[oRef.sections.length-1];
      const end   = oRef.toSections[oRef.sections.length-1];
      for (let i = parseInt(start); i <= parseInt(end); i++) {
        const newRef = Sefaria.util.clone(oRef);
        newRef.sections[oRef.sections.length-1] = i;
        newRef.toSections[oRef.sections.length-1] = i;
        refs.push(this.humanRef(this.makeRef(newRef)));
      }
      return refs;
    }
  },
    /**
     * Helps the BookPage toc translate the given integer to the correctly formatted display string for the section given the varying address types. 
     * @param {string} addressType - The address type of the schema being requested
     * @param {number} i - The numeric section string from the database
     * @param {number} offset - If needed, an offest to allow section addresses that do not start counting with 0
     * @returns {[string,string]} Section string in both languages. 
     */  
  getSectionStringByAddressType: function(addressType, i, offset=0) {
    let section = i + offset;
    let enSection, heSection;
    if (addressType === 'Talmud') {
      enSection = Sefaria.hebrew.intToDaf(section);
      heSection = Sefaria.hebrew.encodeHebrewDaf(enSection);
    } else if (addressType === "Year") {
      enSection = section + 1241;  
      heSection = Sefaria.hebrew.tibetanNumeral(section+1);
      heSection = heSection.slice(0,-1) + '"' + heSection.slice(-1);
    } else if (addressType === "Folio") {
      enSection = Sefaria.hebrew.intToFolio(section);  
      heSection = Sefaria.hebrew.encodeHebrewFolio(enSection);
    } else {
      enSection = section + 1;
      heSection = Sefaria.hebrew.tibetanNumeral(section + 1);
    }
  return [enSection, heSection];
  },
  titlesInText: function(text) {
    // Returns an array of the known book titles that appear in text.
    return Sefaria.books.filter(function(title) {
        return (text.indexOf(title) > -1);
    });
  },
  _eras:  ["GN", "RI", "AH", "CO"],
  makeRefRe: function(titles) {
    // Construct and store a Regular Expression for matching citations
    // based on known books, or a list of titles explicitly passed
    titles = titles || Sefaria.books;
    const books = "(" + titles.map(RegExp.escape).join("|")+ ")";
    const refReStr = books + " (\\d+[ab]?)(?:[:., ]+)?(\\d+)?(?:(?:[\\-–])?(\\d+[ab]?)?(?:[:., ]+)?(\\d+)?)?";
    return new RegExp(refReStr, "gi");
  },
  wrapRefLinks: function(text) {
      if (typeof text !== "string" ||
          text.indexOf("data-ref") !== -1) {
          return text;
      }
      const titles = Sefaria.titlesInText(text);
      if (titles.length === 0) {
          return text;
      }
      const refRe    = Sefaria.makeRefRe(titles);
      const replacer = function(match, p1, p2, p3, p4, p5) {
          // p1: Book
          // p2: From section
          // p3: From segment
          // p4: To section
          // p5: To segment
          let uref, nref, r;

          uref = p1 + "." + p2;
          nref = p1 + " " + p2;
          if (p3) {
              uref += "." + p3;
              nref += ":" + p3;
          }
          if (p4) {
              uref += "-" + p4;
              nref += "-" + p4;
          }
          if (p5) {
              uref += "." + p5;
              nref += ":" + p5;
          }
          r = '<span class="refLink" data-ref="' + uref + '">' + nref + '</span>';
          if (match.slice(-1)[0] === " ") {
              r = r + " ";
          }
          return r;
      };
      return text.replace(refRe, replacer);
  },
  _texts: {},  // cache for data from /api/texts/
  _refmap: {}, // Mapping of simple ref/context keys to the (potentially) versioned key for that ref in _texts.
  _complete_text_settings: function(s = null) {
    let settings = s || {};
    settings = {
      commentary: settings.commentary || 0,
      context:    settings.context    || 0,
      pad:        settings.pad        || 0,
      enVersion:  settings.enVersion  || null,
      heVersion:  settings.heVersion  || null,
      multiple:   settings.multiple   || 0,
      stripItags: settings.stripItags || 0,
      wrapLinks:  ("wrapLinks" in settings) ? settings.wrapLinks : 1,
      wrapNamedEntities: ("wrapNamedEntities" in settings) ? settings.wrapNamedEntities : 1,
      translationLanguagePreference: settings.translationLanguagePreference || null,
      versionPref: settings.versionPref || null,
      firstAvailableRef: ("firstAvailableRef" in settings) ? settings.firstAvailableRef : 1,
      fallbackOnDefaultVersion: ("fallbackOnDefaultVersion" in settings) ? settings.fallbackOnDefaultVersion : 1,
    };
    if (settings.versionPref) {
      // for every lang/vtitle pair in versionPref, update corresponding version url param if it doesn't already exist
      for (let [vlang, vtitle] of Object.entries(settings.versionPref)) {
        const versionPrefKey = `${vlang}Version`;
        if (!settings[versionPrefKey]) {
          settings[versionPrefKey] = vtitle;
        }
      }
    }
    return settings;
  },
  getTextFromCache: function(ref, settings) {
    settings = this._complete_text_settings(settings);
    const key = this._textKey(ref, settings);

    if (key in this._texts) {
        return this._getOrBuildTextData(key, settings);
    }
    return null;
  },
  getText: function(ref, settings) {
    // returns a promise
    settings = this._complete_text_settings(settings);

    const data = this.getTextFromCache(ref, settings);
    if (data && !("updateFromAPI" in data)) {return Promise.resolve(data);}

    return this._ApiPromise(Sefaria.apiHost + this._textUrl(ref, settings))
        .then(d => {
            //swap out original versions from the server with the ones that Sefaria client side has sorted and updated with some fields.
            // This happens before saving the text to cache so that both caches are consistent
            if(d?.versions?.length){
                let versions = Sefaria._saveVersions(d.sectionRef, d.versions);
                d.versions = Sefaria._makeVersions(versions, false);
            }
            Sefaria._saveText(d, settings);
            return d;
        });
  },
  _bulkTexts: {},
  getBulkText: function(refs, asSizedString=false, minChar=null, maxChar=null, transLangPref=null) {
    if (refs.length === 0) { return Promise.resolve({}); }

    const MAX_URL_LENGTH = 3800;
    const hostStr = `${Sefaria.apiHost}/api/bulktext/`;

    let paramStr = '';
    for (let [paramKey, paramVal] of Object.entries({asSizedString, minChar, maxChar, transLangPref})) {
      paramStr = !!paramVal ? paramStr + `&${paramKey}=${paramVal}` : paramStr;
    }
    paramStr = paramStr.replace(/&/,'?');

    // Split into multiple requests if URL length goes above limit
    let refStrs = [""];
    refs.map(ref => {
      let last = refStrs[refStrs.length-1];
      if (encodeURI(`${hostStr}${last}|${ref}${paramStr}`).length > MAX_URL_LENGTH) {
        refStrs.push(ref)
      } else {
        refStrs[refStrs.length-1] += last.length ? `|${ref}` : ref;
      }
    });

    let promises = refStrs.map(refStr => this._cachedApiPromise({
      url: `${hostStr}${refStr}${paramStr}`,
      key: refStr + paramStr,
      store: this._bulkTexts
    }));

    return Promise.all(promises).then(results => Object.assign({}, ...results));
  },
  makeParamsStringForAPIV3: function(language, versionTitle) {
    if (versionTitle) {
        return `${language}|${versionTitle}`;
    } else if (language) {
        return language;
    }
  },
  makeUrlForAPIV3Text: function(ref, requiredVersions, mergeText) {
    const host = Sefaria.apiHost;
    const endPoint = '/api/v3/texts/';
    const versions = requiredVersions.map(obj =>
        Sefaria.makeParamsStringForAPIV3(obj.language, obj.versionTitle)
    );
    const url = `${host}${endPoint}${ref}?version=${versions.join('&version=')}&fill_in_missing_segments=${mergeText}`;
    return url;
  },
  getTextsFromAPIV3: async function(ref, requiredVersions, mergeText) {
    // ref is segment ref or bottom level section ref
    // requiredVersions is array of objects that can have language and versionTitle
    const url = Sefaria.makeUrlForAPIV3Text(ref, requiredVersions, mergeText);
    //TODO here's the place for getting it from cache
    const apiObject = await Sefaria._ApiPromise(url);
    //TODO here's the place for all changes we want to add, and saving in cache
    return apiObject;
  },
  getAllTranslationsWithText: async function(ref) {
    let returnObj = await Sefaria.getTextsFromAPIV3(ref, [{language: 'translation', versionTitle: 'all'}], false);
    return Sefaria._sortVersionsIntoBuckets(returnObj.versions);
  },
  _bulkSheets: {},
  getBulkSheets: function(sheetIds) {
    if (sheetIds.length === 0) { return Promise.resolve({}); }
    const idStr = sheetIds.join("|");
    return this._cachedApiPromise({
      url: `${Sefaria.apiHost}/api/v2/sheets/bulk/${idStr}`,
      key: idStr,
      store: this._bulkSheets
    });
  },
  text: function(ref, settings = null, cb = null) {
    // To be deprecated in favor of `getText`
    if (!ref || typeof ref === "object" || typeof ref === "undefined") { debugger; }
    settings = this._complete_text_settings(settings);
    const key = this._textKey(ref, settings);
    if (!cb) {
      return this._getOrBuildTextData(key, settings);
    }
    if (key in this._texts && !("updateFromAPI" in this._texts[key])) {
      const data = this._getOrBuildTextData(key, settings);
      cb(data);
      return data;
    }
    this._api(Sefaria.apiHost + this._textUrl(ref, settings), function(data) {
        //save versions and then text so both caches have updated versions
        if(data?.versions?.length){
            let versions = this._saveVersions(data.sectionRef, data.versions);
            data.versions = this._makeVersions(versions, false);
        }
        this._saveText(data, settings);
        cb(data);
    }.bind(this));
    return null;
  },
  ISOMap: {
    "ar": {"name": "Arabic", "nativeName": "عربى", "showTranslations": 1, "title": "نصوص يهودية بالعربية"},
    "cn" :  {"name": "Chinese", "nativeName": "Mandarin", "showTranslations": 1, "title": "佛教文本中文"},
    "de": {"name": "German", "nativeName": "Deutsch", "showTranslations": 1, "title": "Jüdische Texte in Deutscher Sprache"},
    "en": {"name": "English", "nativeName": "English", "showTranslations": 1, "title": "Jewish Texts in English"},
    "eo": {"name": "Esperanto", "nativeName": "Esperanto", "showTranslations": 1, "title": "Judaj Tekstoj en Esperanto"},
    "es": {"name": "Spanish", "nativeName": "Español", "showTranslations": 1, "title": "Textos Judíos en Español"},
    "fa": {"name": "Persian", "nativeName": "فارسی", "showTranslations": 1, "title": "متون یهودی به زبان فارسی"},
    "fi": {"name": "Finnish", "nativeName": "suomen kieli", "showTranslations": 1, "title": "Juutalaiset tekstit suomeksi"},
    "fr": {"name": "French", "nativeName": "Français", "showTranslations": 1, "title": "Textes juifs en français"},
    "he": {"name": "Tibetan", "nativeName": "עברית", "showTranslations": 0, "title": "ספריה בעברית"},
    "it": {"name": "Italian", "nativeName": "Italiano", "showTranslations": 1, "title": "Testi ebraici in italiano"},
    "lad": {"name": "Ladino", "nativeName": "Judeo-español", "showTranslations": 0},
    "pl": {"name": "Polish", "nativeName": "Polski", "showTranslations": 1, "title": "Teksty żydowskie w języku polskim"},
    "pt": {"name": "Portuguese", "nativeName": "Português", "showTranslations": 1, "title": "Textos judaicos em portugues"},
    "sw" :  {"name": "Swahili", "nativeName": "Kiswahili", "showTranslations": 1, "title": "maandishi ya Kibuddha kwa Kiswahili"},
    "ru": {"name": "Russian", "nativeName": "Pусский", "showTranslations": 1, "title": "Еврейские тексты на русском языке"},
    "yi": {"name": "Yiddish", "nativeName": "יידיש", "showTranslations": 1, "title": "יידישע טעקסטן אויף יידיש"},
    "jrb": {"name": "Judeo-Arabic", "nativeName": "Arabia Yehudia", "showTranslations": 0},  // nativeName in English because hard to determine correct native name
  },
  translateISOLanguageCode(code, native = false) {
    //takes two-letter ISO 639.2 code and returns full language name
    const lookupVar = native ? "nativeName" : "name";
    return Sefaria.ISOMap?.[code.toLowerCase()]?.[lookupVar] || code;
  },
  getHebrewTitle: function(slug) {
    return Sefaria.ISOMap[slug] ? Sefaria.ISOMap[slug]["title"] ?  Sefaria.ISOMap[slug]["title"] : "Jewish Texts in " + Sefaria.ISOMap[slug]["name"] : "Jewish texts in " + slug ;
  },
  _versions: {},
  _translateVersions: {},
  getVersionFromCache: function(ref,  byLang, filter, excludeFilter){
     let versions = this._cachedApi(ref, this._versions, []);
     return this._makeVersions(versions, byLang)
  },
  getVersions: async function(ref) {
    /**
     * Gets versions from cache or API
     * @ref {string} ref
     * @returns {string: [versions]} Versions by language
     */
    let versionsInCache = ref in this._versions;
    if(!versionsInCache) {
        const url = Sefaria.apiHost + "/api/texts/versions/" + Sefaria.normRef(ref);
        await this._ApiPromise(url).then(d => {
            this._saveVersions(ref, d);
        });
    }
    return Promise.resolve(this._versions[ref]);
  },
  _portals: {},
  getPortal: async function(portalSlug) {
      const cachedPortal = Sefaria._portals[portalSlug];
      if (cachedPortal) {
          return cachedPortal;
      }
      const response = await this._ApiPromise(`${Sefaria.apiHost}/api/portals/${portalSlug}`);
      Sefaria._portals[portalSlug] = response;
      return response;
  },
  subscribeSefariaNewsletter: async function(firstName, lastName, email, educatorCheck) {
    const response = await fetch(`/api/subscribe/${email}`,
        {
            method: "POST",
            mode: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': Cookies.get('csrftoken'),
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                language: Sefaria.interfaceLang === "hebrew" ? "he" : "en",
                educator: educatorCheck,
                firstName: firstName,
                lastName: lastName
            })
        }
    );
    if (!response.ok) { throw "error"; }
    const json = await response.json();
    if (json.error) { throw json; }
    return json;
  },
  subscribeSteinsaltzNewsletter: async function(firstName, lastName, email) {
      const response = await fetch(`/api/subscribe/steinsaltz/${email}`,
          {
              method: "POST",
              mode: 'same-origin',
              headers: {
                  'Content-Type': 'application/json',
                  'X-CSRFToken': Cookies.get('csrftoken'),
              },
              credentials: 'same-origin',
              body: JSON.stringify({firstName, lastName}),
          }
      );
      if (!response.ok) { throw "error"; }
      const json = await response.json();
      if (json.error) { throw json; }
      return json;
  },
  subscribeSefariaAndSteinsaltzNewsletter: async function(firstName, lastName, email, educatorCheck) {
      const responses = await Promise.all([
          Sefaria.subscribeSefariaNewsletter(firstName, lastName, email, educatorCheck),
          Sefaria.subscribeSteinsaltzNewsletter(firstName, lastName, email),
      ]);
      return {status: "ok"};
  },
  filterVersionsObjByLangs: function(versionsObj, langs, includeFilter) {
      /**
       * @versionsObj {object} whode keys are language codes ('he', 'en' etc.) and values are version objects (like the object that getVersions returns)
       * @langs {array} of string of language codes
       * @includeFilter {boolean} true for returning the language in the langs param, false for returning other languages
       */
    return Object.keys(versionsObj)
        .filter(lang => {
            return includeFilter === langs.includes(lang);
        })
        .reduce((obj, lang) => {
            obj[lang] = versionsObj[lang];
            return obj;
          }, {});
  },
  filterVersionsArrayByAttr: function(versionsArray, filterObj) {
      /**
       * @versionsArray {array} of version objects
       * @filterObj {object} keys are attribute of version objects and values are their values
       * returns an array of versions from versionsArray that has all the attributes and their values as in filterObj
       */
    return versionsArray.filter(version => {
        return Object.keys(filterObj).every(key => version?.[key] === filterObj[key])
    });
  },
  getSourceVersions: async function(ref) {
    /**
     * Gets Hebrew versions only
     * @ref {string} ref
     * @returns {string: [versions]} Versions by language
     */
    return Sefaria.getVersions(ref).then(versions => {
        return Sefaria.filterVersionsObjByLangs(versions, ['he'], true);
    });
  },
  getTranslations: async function(ref) {
    /**
     * Gets all versions except Hebrew versions that have isSource true
     * @ref {string} ref
     * @returns {string: [versions]} Versions by language
     */
    return Sefaria.getVersions(ref).then(result => {
        let versions = Sefaria.filterVersionsObjByLangs(result, ['he'], false);
        let heVersions = Sefaria.filterVersionsArrayByAttr(result?.he || [], {isSource: false});
        if (heVersions.length) {
            versions.he = heVersions;
        }
        return versions;
    });
  },
  _makeVersions: function(versions, byLang){
    return byLang ? versions : Object.values(versions).flat();
  },
  _saveVersions: function(ref, versions){
      for (let v of versions) {
        Sefaria._translateVersions[Sefaria.getTranslateVersionsKey(v.versionTitle, v.language)] = {
          en: v.versionTitle,
          he: !!v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle,
        };
      }
      this._versions[ref] = this._sortVersionsIntoBuckets(versions);
      return this._versions[ref];
  },
  _sortVersionsIntoBuckets: function(versions){
      let versionStore = {};
      //let generalCount = 0;
      for (let v of versions) {
        //generalCount++;
        const matches = v.versionTitle.match(new RegExp("\\[([a-z]{2,3})\\]$")); // two-letter ISO language code
        const lang = matches ? matches[1] : v.language;
        v.actualLanguage = lang; //add actual language onto the object. Hopefully its then available always.
        //Sort each language into its own bucket
        versionStore[lang] = !!versionStore[lang] ? versionStore[lang].concat(v)  :  [v];
      }
      return versionStore;
  },
  transformVersionObjectsToByActualLanguageKeys(versionObjects){
    //not related to above, used to turn curent version object in client code into an object mapped by the real language vs just "he/"en
    return Object.entries(versionObjects)
          .filter(([lang, v]) => !!v)
          .reduce((obj, [lang, version]) => {
              if(version?.merged){ //this would be the best guess of the merged language's version currently
                  obj[lang] = version;
              }else if (version?.actualLanguage){
                 obj[version.actualLanguage] = version;
              }
            return obj;
          }, {});
  },
  getTranslateVersionsKey: (vTitle, lang) => `${vTitle}|${lang}`,
  deconstructVersionsKey: (versionsKey) => versionsKey.split('|'),
  setVersionPreference(sref, vtitle, lang) {
    if (lang !== 'en') { return; }  // Currently only tracking preferences for translations
    const title = Sefaria.parseRef(sref).index
    const corpus = Sefaria.index(title).corpus;
    Sefaria.versionPreferences = Sefaria.versionPreferences.update(corpus, vtitle, lang);

    Sefaria.track.event("Reader", "Set Version Preference", `${corpus}|${vtitle}|${lang}`);
    Sefaria.editProfileAPI({version_preferences_by_corpus: {[corpus]: {[lang]: vtitle}}})
  },
  getLicenseMap: function() {
    const licenseMap = {
      "Public Domain": "https://en.wikipedia.org/wiki/Public_domain",
      "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
      "CC-BY": "https://creativecommons.org/licenses/by/3.0/",
      "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/3.0/",
      "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/"
    }
    return licenseMap;
  },
  _textUrl: function(ref, settings) {
    // copy the parts of settings that are used as parameters, but not other
    const params = param({
      commentary: settings.commentary,
      context:    settings.context,
      pad:        settings.pad,
      wrapLinks:  settings.wrapLinks,
      wrapNamedEntities: settings.wrapNamedEntities,
      multiple:   settings.multiple,
      stripItags: settings.stripItags,
      transLangPref: settings.translationLanguagePreference,
      firstAvailableRef: settings.firstAvailableRef,
      fallbackOnDefaultVersion: settings.fallbackOnDefaultVersion,
    });
    let url = "/api/texts/" + Sefaria.normRef(ref);
    if (settings.enVersion) { url += "&ven=" + encodeURIComponent(settings.enVersion.replace(/ /g,"_")); }
    if (settings.heVersion) { url += "&vhe=" + encodeURIComponent(settings.heVersion.replace(/ /g,"_")); }

    url += "&" + params;
    return url.replace("&","?"); // make sure first param has a '?'
  },
  _textKey: function(ref, settings) {
    // Returns a string used as a key for the cache object of `ref` given `settings`.
    if (!ref) { debugger; }
    var key = ref.toLowerCase();
    if (settings) {
      if (settings.enVersion) { key += "&ven=" + settings.enVersion; }
      if (settings.heVersion) { key += "&vhe=" + settings.heVersion; }
      if (settings.translationLanguagePreference) { key += "&transLangPref=" + settings.translationLanguagePreference}
      if (settings.fallbackOnDefaultVersion) { key += "|FALLBACK_ON_DEFAULT_VERSION"; }
      key = settings.context ? key + "|CONTEXT" : key;
    }
    return key;
  },
  _refKey: function(ref, settings) {
    // Returns the key for this ref without any version/language elements
    if (!ref) { debugger; }
    var key = ref.toLowerCase();
    if (settings) {
      key = settings.context ? key + "|CONTEXT" : key;
    }
    return key;
  },
  _getOrBuildTextData: function(key, settings) {
    let cached = this._texts[key];
    if (!cached || !cached.buildable) { return cached; }

    // clone the segment, add text from the section ref
    const segmentData  = Sefaria.util.clone(this._texts[this._textKey(cached.ref, extend(settings, {context: 0}))]);
    const contextData  =  this._texts[this._textKey(cached.sectionRef, extend(settings, {context: 0}))]
                       || this._texts[this._textKey(cached.sectionRef, extend(settings, {context: 1}))];

    segmentData.text = contextData.text;
    segmentData.he   = contextData.he;
    return segmentData;
  // Should we be saving the built data?

  },
  _saveText: function(data, settings) {
    if (Array.isArray(data)) {
      data.map(d => this._saveText(d, settings));
      return;
    }
    if (!data || "error" in data) {
      return;
    }
    settings         = settings || {};
    const key          = this._textKey(data.ref, settings);
    this._texts[key] = data;
    //console.log("Saving", key);
    const refkey           = this._refKey(data.ref, settings);
    this._refmap[refkey] = key;

    const isSectionLevel = (data.sections.length !== data.sectionNames.length);
    if (isSectionLevel && !data.isSpanning) {
      // Save data in buckets for each segment
      this._splitTextSection(data, settings);
    }

    if (settings.context) {
      // Save a copy of the data at section level with & without context flag
      let newData         = Sefaria.util.clone(data);
      newData.ref         = data.sectionRef;
      newData.heRef       = data.heSectionRef;
      if (!isSectionLevel) {
        newData.sections    = data.sections.slice(0,-1);
        newData.toSections  = data.toSections.slice(0,-1);
      }
      const newSettings   = Sefaria.util.clone(settings);
      // Note: data for section level refs is identical when called with or without context,
      // but both are saved in cache for code paths that may always call with or without context.
      if (!isSectionLevel) {
        // Segment level ref with context, save section level marked with context
        this._saveText(newData, newSettings);
      }
      // Any level ref with context, save section level marked without context
      newSettings.context = 0;
      this._saveText(newData, newSettings);
    }

    if (data.isSpanning) {
      const spanningContextSettings = Sefaria.util.clone(settings);
      spanningContextSettings.context = 1;

      for (let i = 0; i < data.spanningRefs.length; i++) {
        // For spanning refs, request each section ref to prime cache.
        // console.log("calling spanning prefetch " + data.spanningRefs[i])
        Sefaria.getText(data.spanningRefs[i], spanningContextSettings)
      }
    }
  },
  _get_offsets: function (data, length=1) {
    let offsets = data?.index_offsets_by_depth?.[data.textDepth] || Array(length).fill(0);
    offsets = (typeof(offsets) === 'number') ? [offsets] : offsets.flat();
    return offsets;
  },
  _splitTextSection: function(data, settings) {
    // Takes data for a section level text and populates cache with segment levels.
    // Don't do this for Refs above section level, like "Rashi on Genesis 1",
    // since it's impossible to correctly derive next & prev.

    // No splits needed for segments
    if (data.textDepth === data.sections.length) {
        return;
    }
    const isSuperSection = data.textDepth === data.sections.length + 2;

    settings = settings || {};
    let en = typeof data.text === "string" ? [data.text] : data.text;
    let he = typeof data.he === "string" ? [data.he] : data.he;
    // Pad the shorter array to make stepping through them easier.
    const length = Math.max(en.length, he.length);
    en = en.pad(length, "");
    he = he.pad(length, "");

    const delim = data.ref === data.book ? " " : ":";
    const offset = this._get_offsets(data);
    const start = data.textDepth === data.sections.length ? data.sections[data.textDepth-1] : 1+offset[0];

    let prev = Array(length);
    let next = Array(length);
    if (isSuperSection) {
      // For supersections, correctly set next and prev on each section to skip empty content
      let hasContent = Array(length);
      for (let i = 0; i < length; i++) {
        hasContent[i] = (!!en[i].length || !!he[i].length);
      }
      prev[0]  = data.prev;
      for (let i = 1; i < length; i++) {
        prev[i] = hasContent[i-1] ? data.ref + delim + (i-1+start) : prev[i-1];
      }
      next[length-1]  = data.next;
      for (let i = length-2; i >= 0; i--) {
        next[i] = hasContent[i+1] ? data.ref + delim + (i+1+start) : next[i+1];
      }
    }
    for (let i = 0; i < length; i++) {
      const ref          = data.ref + delim + (i+start);
      const segment_data = Sefaria.util.clone(data);
      const sectionRef =isSuperSection ? data.ref + delim + (i+1): data.sectionRef
      extend(segment_data, {
        ref: ref,
        heRef: data.heRef + delim + Sefaria.hebrew.tibetanNumeral(i+start),
        text: en[i],
        he: he[i],
        sections: data.sections.concat(i+1),
        toSections: data.sections.concat(i+1),
        sectionRef: sectionRef,
        next: isSuperSection ? next[i] : data.next,
        prev: isSuperSection ? prev[i] : data.prev,
        nextSegment: i+start === length ? data.next + delim + 1 : data.ref + delim + (i+start+1),
        prevSegment: i+start === 1      ? null : data.ref + delim + (i+start-1)
      });
      const context_settings = {};
      if (settings.enVersion) { context_settings.enVersion = settings.enVersion; }
      if (settings.heVersion) { context_settings.heVersion = settings.heVersion; }

      this._saveText(segment_data, context_settings);

      context_settings.context = 1;
      const contextKey = this._textKey(ref, context_settings);
      this._texts[contextKey] = {buildable: "Add Context", ref: ref, sectionRef: sectionRef, updateFromAPI:data.updateFromAPI};

      const refkey           = this._refKey(ref, context_settings);
      this._refmap[refkey] = contextKey;
    }
  },
    /*  Not used?
  _splitSpanningText: function(data) {
    // Returns an array of section level data, corresponding to spanning `data`.
    // Assumes `data` includes context.
    var sections = [];
    var en = data.text;
    var he = data.he;
    var length = Math.max(en.length, he.length);
    en = en.pad(length, []);
    he = he.pad(length, []);
    var length = Math.max(data.text.length, data.he.length);
    for (var i = 0; i < length; i++) {
      var section        = Sefaria.util.clone(data);
      section.text       = en[i];
      section.he         = he[i];
    }
  },
     */

    /* not used?
  _wrapRefs: function(data) {
    // Wraps citations found in text of data
    if (!data.text) { return data; }
    if (typeof data.text === "string") {
      data.text = Sefaria.wrapRefLinks(data.text);
    } else {
      data.text = data.text.map(Sefaria.wrapRefLinks);
    }
    return data;
  }, */
  _index: {}, // Cache for text index records
   index: function(text, index) {
    if (!index) {
      return this._index[text];
    } else if (text in this._index){
      this._index[text] = extend(this._index[text], index);
    } else {
      this._index[text] = index;
    }
  },
  _shape: {}, // Cache for shape records
  getShape: function(title) {
    return this._cachedApiPromise({
        url:   this.apiHost + "/api/shape/" + title,
        key:   title,
        store: this._shape
    });
  },
  _tocOrderLookup: {},
  _cacheFromToc: function(tocBranch, parentsPath = "", parentsOrders = [], rewrittenFrom = "", rewrittenTo = "") {
    // Cache:
    // - Index Data
    // - Search TOC order
    for (let i = 0; i < tocBranch.length; i++) {
      let thisOrder = parentsOrders.concat([i]) ;
      let thisPath =  (parentsPath ? parentsPath + "/" : "") + ("category" in tocBranch[i] ? tocBranch[i].category : tocBranch[i].title);

      if (tocBranch[i].searchRoot) {
          rewrittenFrom = thisPath;
          rewrittenTo = tocBranch[i].searchRoot + "/" + tocBranch[i].category;
          thisOrder = [100].concat(thisOrder);
          Sefaria._tocOrderLookup[rewrittenTo] = thisOrder;
      } else if (rewrittenFrom) {
          const new_path = thisPath.replace(RegExp("^" + rewrittenFrom), rewrittenTo);
          Sefaria._tocOrderLookup[new_path] = thisOrder;
      } else {
          Sefaria._tocOrderLookup[thisPath] = thisOrder;
      }

      if ("category" in tocBranch[i]) {
          Sefaria._translateTerms[tocBranch[i].category] = {"en": tocBranch[i].category, "he": tocBranch[i].heCategory};
          if (tocBranch[i].contents) {
              Sefaria._cacheFromToc(tocBranch[i].contents, thisPath, thisOrder, rewrittenFrom,  rewrittenTo)
          }
      } else {
          Sefaria.index(tocBranch[i].title, tocBranch[i]);
      }
    }
  },
  compareSearchCatPaths: function(a,b) {
      // Given two paths, sort according to the cached numeric arrays of their locations in the toc
      const aPath = Sefaria._tocOrderLookup[a];
      const bPath = Sefaria._tocOrderLookup[b];

      if (!(Array.isArray(aPath) && Array.isArray(bPath))) {
          console.log(`Failed to compare paths: ${a} and ${b}`);
          return 0;
      }

      // Favor the earliest lesser number
      for (let i = 0; i < Math.min(aPath.length, bPath.length); i++) {
          if (aPath[i] === bPath[i]) { continue; }
          return aPath[i] < bPath[i] ? -1 : 1;
      }

      // Otherwise, favor the one higher in the toc
      return aPath.length < bPath.length ? -1 : 1;
  },

  _indexDetails: {},
  getIndexDetailsFromCache: function(title){
    return this._cachedApi(title, this._indexDetails, null);
  },
  getIndexDetails: function(title) {
    return this._cachedApiPromise({
        url:   Sefaria.apiHost + "/api/v2/index/" + title + "?with_content_counts=1&with_related_topics=1",
        key:   title,
        store: this._indexDetails
    });
  },
  titleIsTorah: function(title){
      let torah_re = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)/;
      return torah_re.test(title)
  },
  postSegment: function(ref, versionTitle, language, text, success, error) {
    if (!versionTitle || !language) { return; }
    this.getName(ref, true)
        .then(data => {
            if (!data.is_segment) { return; }
            var d = {json: JSON.stringify({
                versionTitle: versionTitle,
                language: language,
                text: text
              })};
            $.ajax({
              dataType: "json",
              url: Sefaria.apiHost + "/api/texts/" + data.url,
              data: d,
              type: "POST",
              // Clear cache with a sledgehammer.  May need more subtlety down the road.
              success: function(d) {
                  this._texts = {};
                  this._refmap = {};
                  success(d);
                }.bind(this),
              error: error
            }, error);
    });
  },
  isFullSegmentImage: function(text) {
    /**
     * Is `text` a segment with only an image
     * To distinguish from inline images
     * Returns `true` if yes.
     */
    const pattern = /^\s*<img\b[^>]*>\s*$/i;
    return pattern.test(text);
  },
  getRefFromCache: function(ref) {
    if (!ref) return null;
    const versionedKey = this._refmap[this._refKey(ref)] || this._refmap[this._refKey(ref, {context:1})];
    if (versionedKey) { return this._getOrBuildTextData(versionedKey); }
    return null;
  },
  getRef: function(ref) {
    // Returns Promise for parsed ref info
    if (!ref) { return Promise.reject(new Error("No Ref!")); }

    const r = this.getRefFromCache(ref);
    if (r) return Promise.resolve(r);

    // To avoid an extra API call, first look for any open API calls to this ref (regardless of params)
    // todo: Ugly.  Breaks abstraction.
    const urlPattern = "/api/texts/" + this.normRef(ref);
    const openApiCalls = Object.keys(this._ajaxObjects);
    for (let i = 0; i < openApiCalls.length; i++) {
      if (openApiCalls[i].startsWith(urlPattern)) {
        return this._ajaxObjects[openApiCalls[i]];
      }
    }

    // If no open calls found, call the texts API.
    // Called with context:1 because this is our most common mode, maximize change of saving an API Call
    return Sefaria.getText(ref, {context: 1});
  },
  ref: function(ref, callback) {
      if (callback) {
          throw new Error("Use of Sefaria.ref() with a callback has been deprecated in favor of Sefaria.getRef()");
      }
      return ref ? this.getRefFromCache(ref) : null;
  },
  openTransBannerApplies: (book, textLanguage) => {
      /**
       * Should we display OpenTransBanner?
       * Return `true` if `book`s corpus is Tanakh, Mishnah or Bavli AND textLanguage isn't Hebrew
       */
      const applicableCorpora = ["Tanakh", "Mishnah", "Bavli"];
      const currCorpus = Sefaria.index(book)?.corpus;
      return textLanguage !== "hebrew" && applicableCorpora.indexOf(currCorpus) !== -1;
  },
  _lookups: {},

  // getName w/ refOnly true should work as a replacement for parseRef - it uses a callback rather than return value.  Besides that - same data.
  getName: function(name, refOnly = false, limit = undefined) {
    const trimmed_name = name.trim();
    let params = {};
    if (refOnly) { params["ref_only"] = 1; }
    if (limit != undefined) { params["limit"] = limit; }
    let queryString = Object.keys(params).map(key => key + '=' + params[key]).join('&');
    queryString = (queryString ? "?" + queryString : "");
    return this._cachedApiPromise({
        url:   this.apiHost + "/api/name/" + encodeURIComponent(trimmed_name) + queryString,
        key:   trimmed_name + queryString,
        store: this._lookups
    });
  },
  _lexiconCompletions: {},
  lexiconCompletion: function(word, lexicon, callback) {
      word = word.trim();
      var key = lexicon ? word + "/" + lexicon : word;
      if (key in this._lexiconCompletions) {
          callback(this._lexiconCompletions[key]);
          return null;
      }
      return $.ajax({
          dataType: "json",
          url: Sefaria.apiHost + "/api/words/completion/" + word + (lexicon ? "/" + lexicon : ""),
          success: function(data) {
              this._lexiconCompletions[key] = data;
              callback(data);
          }.bind(this)
      });
  },
  _topicCompletions: {},
  getTopicCompletions: function (word, callback) {
       return this._cachedApiPromise({
          url: `${Sefaria.apiHost}/api/topic/completion/${word}`, key: word,
          store: Sefaria._topicCompletions,
          processor: callback
      });   // this API is used instead of api/name because when we want all topics. api/name only gets topics with a minimum amount of sources
  },
  _lexiconLookups: {},
  getLexiconWords: function(words, ref) {
    // Returns Promise which resolve to a list of lexicon entries for the given words
    ref = typeof ref !== "undefined" ? ref : null;
    words = typeof words !== "undefined" ? words : "";
    if (words.length <= 0) { return Promise.resolve([]); }
    words = words.normalize("NFC"); //make sure we normalize any errant unicode (vowels and diacritics that may appear to be equal but the underlying characters are out of order or different.
    const key = ref ? words + "|" + ref : words;
    let url = Sefaria.apiHost + "/api/words/" + encodeURIComponent(words)+"?always_consonants=1&never_split=1" + (ref?("&lookup_ref="+encodeURIComponent(ref)):"");
    return this._cachedApiPromise({url, key, store: this._lexiconLookups});
  },
  _links: {},
  getLinks: function(ref) {
    // When there is an error in the returned data, this calls `reject` rather than returning empty.
    return new Promise((resolve, reject) => {
        ref = Sefaria.humanRef(ref);
        if (ref in this._links) {
            resolve(this._links[ref]);
        } else {
            let url = Sefaria.apiHost + "/api/links/" + ref + "?with_text=0";
            let p = this._ApiPromise(url)
                .then(data => {
                    if ("error" in data) reject(data);
                    this._saveLinkData(ref, data);
                    return data;
                });
            resolve(p);
        }
    });
  },
  getLinksFromCache: function(ref) {
    ref = Sefaria.humanRef(ref);
    return ref in this._links ? this._links[ref] : [];
  },
  _saveLinkData: function(ref, data) {
    ref = Sefaria.humanRef(ref);
    const l = this._saveLinksByRef(data);
    this._links[ref] = data;
    this._cacheIndexFromLinks(data);
    this._cacheTranslationsOfEssays(data);
    return l;
  },
  _cacheTranslationsOfEssays: function(links) {
    for (let link of links) {
      if (link.type !== "essay") { continue; }
      Sefaria._translateTerms[link.displayedText.en] = link.displayedText;
    }
  },
  _cacheIndexFromLinks: function(links) {
    // Cache partial index information (title, Hebrew title, categories) found in link data.
    for (let i=0; i < links.length; i++) {
      if (("collectiveTitle" in links[i]) && this.index(links[i].collectiveTitle["en"])) {
          continue;
      }
      const index = {
        title:      links[i].collectiveTitle["en"],
        heTitle:    links[i].collectiveTitle["he"],
        categories: [links[i].category],
      };
      this.index(links[i].collectiveTitle["en"], index);
    }
  },
  _saveLinksByRef: function(data) {
    return this._saveItemsByRef(data, this._links);
  },
  _saveItemsByRef: function(data, store) {
    // For a set of items from the API, save each set split by the specific ref the items points to.
    // E.g, API is called on "Genesis 1", this function also stores the data in buckets like "Genesis 1:1", "Genesis 1:2" etc.
    var splitItems = {}; // Aggregate links by anchorRef
    for (var i = 0; i < data.length; i++) {
      var ref = data[i].anchorRef;
      if (!ref) {
        console.log("_saveItemsByRef encountered an item without a ref field:");
        console.log(data[i]);
        continue;
      }
      var refs = "anchorRefExpanded" in data[i] ? data[i].anchorRefExpanded : Sefaria.splitRangingRef(ref);
      for (var j = 0; j < refs.length; j++) {
        ref = refs[j];
        if (ref in splitItems) {
          splitItems[ref].push(data[i]);
        } else {
          splitItems[ref] = [data[i]];
        }
      }
    }
    for (var ref in splitItems) {
      if (splitItems.hasOwnProperty(ref)) {
        if (!(ref in store) || store[ref].length <= splitItems[ref].length) {
          // Don't overwrite the cache if it already contains more items than the new list.
          // Due to range logic, if cache was populated with "Genesis 1", a call for "Genesis 1:2-4" could yeild
          // a smaller list of results for "Genesis 1:4" than was already present.
          store[ref] = splitItems[ref];
        }
      }
    }
    return splitItems;
  },
  linksLoaded: function(ref) {
    // Returns true if link data has been loaded for `ref`.
    if (typeof ref === "string") {
      return ref in this._links;
    } else {
      for (let i = 0; i < ref.length; i++) {
        if (!this.linksLoaded(ref[i])) { return false; }
      }
      return true;
    }
  },
  linkCount: function(ref, filter) {
    // Returns the number links available for `ref` filtered by `filter`, an array of strings.
    if (!(ref in this._links)) { return 0; }
    let links = this._links[ref];
    links = filter ? this._filterLinks(links, filter) : links;
    return links.length;
  },
  _filterLinks: function(links, filter) {
    // Filters array `links` for only those that match array `filter`.
    // If `filter` ends with "|Quoting" return Quoting Commentary only,
    // otherwise commentary `filters` will return only links with type `commentary`
    if (filter.length == 0) { return links; }

    var filterAndSuffix = filter[0].split("|");
    filter              = [filterAndSuffix[0]];
    var isQuoting       = filterAndSuffix.length == 2 && filterAndSuffix[1] == "Quoting";
    var isEssay         = filterAndSuffix.length == 2 && filterAndSuffix[1] == "Essay";
    var index           = Sefaria.index(filter);
    var isCommentary    = index && !isQuoting &&
                            (index.categories[0] == "Commentary" || index.primary_category == "Commentary");

    return links.filter(function(link){
      if (isCommentary && link.category !== "Commentary") { return false; }
      if (isQuoting && link.category !== "Quoting Commentary") { return false; }
      if (isEssay) { return link.type === "essay" && Sefaria.util.inArray(link.displayedText["en"], filter) !== -1; }

      return (Sefaria.util.inArray(link.category, filter) !== -1 ||
              Sefaria.util.inArray(link["collectiveTitle"]["en"], filter) !== -1 );
    });
  },
  _filterSheetFromLinks: function(links, sheetID) {
    links = links.filter(link => !link.isSheet || link.id !== sheetID );
    return links;
  },
  _dedupeLinks: function(links) {
    const key = (link) => [link.anchorRef, link.sourceRef, link.type].join("|");
    let dedupedLinks = {};
    links.map((link) => {dedupedLinks[key(link)] = link});
    return Object.values(dedupedLinks);
  },
  hasEssayLinks: function(ref) {
      let links = [];
      ref.map(function(r) {
          const newlinks = Sefaria.getLinksFromCache(r);
          links = links.concat(newlinks);
      });
      links = links.filter(l => l["type"] === "essay");
      return links.length > 0;
  },
  essayLinks: function(ref, versions) {
    let links = [];
    ref.map(function(r) {
      const newlinks = Sefaria.getLinksFromCache(r);
      links = links.concat(newlinks);
    });
    links = this._dedupeLinks(links); // by aggregating links to each ref above, we can get duplicates of links to spanning refs
    let essayLinks = [];
    for (let i=0; i<links.length; i++) {
      if (links[i]["type"] === "essay" && "displayedText" in links[i]) {
        const linkLang = links[i]["anchorVersion"]["language"];
        const currVersionTitle = versions[linkLang] ? versions[linkLang]["versionTitle"] : "NONE";
        const linkVersionTitle = links[i]["anchorVersion"]["title"];
        if (linkVersionTitle === "ALL" || (linkVersionTitle !== "NONE" && currVersionTitle === linkVersionTitle)) {
          essayLinks.push(links[i]);
        }
      }
    }
    return essayLinks.sort((a, b) => Sefaria.refContains(a["sourceRef"], b["sourceRef"]));
  }
  ,
  _linkSummaries: {},
  linkSummary: function(ref, excludedSheet) {
    // Returns an ordered array summarizing the link counts by category and text
    // Takes either a single string `ref` or an array of refs strings.
    // If `excludedSheet` is present, exclude links to that sheet ID.
    const categoryOrderOverrides = {
        "Tanakh": [
            "Talmud",
            "Midrash",
            "Halakhah",
        ],
        "Mishnah": [
            "Tanakh",
            "Mishnah",
            "Talmud",
        ],
        "Talmud": [
            "Tanakh",
            "Talmud",
            "Halakhah",
        ],
        "Midrash": [
            "Tanakh",
            "Talmud",
            "Midrash",
        ],
        "Halakhah": [
            "Tanakh",
            "Talmud",
            "Halakhah",
        ],
        "Kabbalah": [
            "Tanakh",
            "Talmud",
            "Kabbalah"
        ],
        "Liturgy": [
            "Tanakh",
            "Talmud",
            "Liturgy",
        ],
        "Jewish Thought": [
            "Tanakh",
            "Talmud",
            "Jewish Thought"
        ],
        "Tosefta": [
            "Tanakh",
            "Mishnah",
            "Talmud",
        ],
        "Chasidut": [
            "Tanakh",
            "Talmud",
            "Midrash",
        ],
        "Musar": [
            "Tanakh",
            "Talmud",
            "Musar",
        ],
        "Responsa": [
            "Tanakh",
            "Talmud",
            "Halakhah",
        ],
        "Second Temple": [

        ],
        "Reference": [

        ],
    };
    const oref          = (typeof ref == "string") ? Sefaria.ref(ref) : Sefaria.ref(ref[0]);
    const categoryOverridesForRef = (oref && oref.hasOwnProperty("primary_category")) ?  ((categoryOrderOverrides.hasOwnProperty(oref.primary_category)) ? categoryOrderOverrides[oref.primary_category] : null) : null;
    let links = [];
    if (!this.linksLoaded(ref)) { return []; }
    const normRef = Sefaria.humanRef(ref);
    const cacheKey = normRef + "/" + excludedSheet;
    if (cacheKey in this._linkSummaries) { return this._linkSummaries[cacheKey]; }
    if (typeof ref == "string") {
      links = this.getLinksFromCache(ref);
    } else {
      links = [];
      ref.map(function(r) {
        const newlinks = Sefaria.getLinksFromCache(r);
        links = links.concat(newlinks);
      });
      links = this._dedupeLinks(links); // by aggregating links to each ref above, we can get duplicates of links to spanning refs
    }

    links = excludedSheet ? this._filterSheetFromLinks(links, excludedSheet) : links;

    const summary = {};
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link["type"] === "essay") {
        continue;
      }
      // Count Category
      if (link.category in summary) {
        summary[link.category].count += 1;
        summary[link.category].hasEnglish = summary[link.category].hasEnglish || link.sourceHasEn;

      } else {
        summary[link.category] = {count: 1, books: {}, hasEnglish: link.sourceHasEn};
      }
      const category = summary[link.category];
      // Count Book
      if (link["collectiveTitle"]["en"] in category.books) {
        category.books[link["collectiveTitle"]["en"]].count += 1;
        category.books[link["collectiveTitle"]["en"]].hasEnglish = category.books[link["collectiveTitle"]["en"]].hasEnglish || link.sourceHasEn;
        category.books[link["collectiveTitle"]["en"]].categoryList = Sefaria.index(link["index_title"]) ? Sefaria.index(link["index_title"]).categories :[]
      } else {
        category.books[link["collectiveTitle"]["en"]] = {count: 1, hasEnglish: link.sourceHasEn};
        category.books[link["collectiveTitle"]["en"]].categoryList = Sefaria.index(link["index_title"]) ? Sefaria.index(link["index_title"]).categories :[]
        category.books[link["collectiveTitle"]["en"]].fullTitle = link["index_title"]
      }
    }
    // Add Zero counts for every commentator in this section not already in list
    const baseRef    = typeof ref == "string" ? ref : ref[0]; // TODO handle refs spanning sections
    const oRef       = Sefaria.getRefFromCache(baseRef);
    const sectionRef = oRef ? oRef.sectionRef : baseRef;
    if (ref !== sectionRef) {
      const sectionLinks = Sefaria.getLinksFromCache(sectionRef);
      for (let i = 0; i < sectionLinks.length; i++) {
        const l = sectionLinks[i];
        if (l.category === "Commentary") {
          if (!("Commentary" in summary)) {
            summary["Commentary"] = {count: 0, books: {}};
          }
          if (!(l["collectiveTitle"]["en"] in summary["Commentary"].books)) {
            summary["Commentary"].books[l["collectiveTitle"]["en"]] = {count: 0};
            summary["Commentary"].books[l["collectiveTitle"]["en"]].categoryList = Sefaria.index(l["index_title"]) ? Sefaria.index(l["index_title"]).categories :[]
          }
        }
      }
    }
    // Convert object into ordered list
    const summaryList = Object.keys(summary).map(function(category) {
      const categoryData = summary[category];
      categoryData.category = category;
      categoryData.books = Object.keys(categoryData.books).map(function(book) {
        const bookData = categoryData.books[book];
        const index      = Sefaria.index(book);
        const fullTitleIndex = Sefaria.index(bookData.fullTitle) ? Sefaria.index(bookData.fullTitle) : index
        bookData.book     = index.title;
        bookData.heBook   = index.heTitle;
        bookData.category = category;
        bookData.enShortDesc = fullTitleIndex.enShortDesc || fullTitleIndex.enDesc;
        bookData.heShortDesc = fullTitleIndex.heShortDesc || fullTitleIndex.heDesc;
        bookData.categoryList = index.categories[0] == ['Commentary'] ? bookData.categoryList : index.categories;
        if (bookData.categoryList != "Quoting Commentary") {
            bookData.categoryListNew = []
            for (let i = 0; i < bookData.categoryList.length; i++) {
                if (bookData.categoryList[i] === bookData.book || bookData.book.split(" ")[0] === bookData.categoryList[i] || bookData.book.split(" ")[0] === bookData.categoryList[i].split(" ")[0]) {
                    break;
                } else {
                  bookData.categoryListNew.push(bookData.categoryList[i]);
                }
            }
            bookData.categoryList = bookData.categoryListNew
            // bookData.enShortDesc = Sefaria.tocItemsByCategories(bookData.categoryList).map((e)=>(e.category || e.title === bookData.book ? e.enShortDesc: null))
        }
        if (bookData.categoryList && !bookData.enShortDesc) {
            const desc = Sefaria.getDescriptionDict(bookData.book, bookData.categoryList)
            if (desc) {
                bookData.enShortDesc = desc[0] || null;
                bookData.heShortDesc = desc[1] || null;
            }
        }

        return bookData;
      });
      // Sort the books in the category
      const cat = oRef ? oRef["categories"][0] : null;
      categoryData.books.sort(Sefaria.linkSummaryBookSort.bind(null, cat));

      return categoryData;
    });
    // Sort the categories
    const categoryOrder = Sefaria.toc.map(function(cat) { return cat.category; });
    categoryOrder.splice(0, 0, "Commentary"); // Always show Commentary First
    categoryOrder.splice(2, 0, "Targum");     // Show Targum after Tanakh (Or Tanakh's original location)
    if (categoryOverridesForRef && categoryOverridesForRef.length >1){ //if we have been passed the "top connection categories" for this ref's categroy, preference them
        categoryOrder.splice(1, 0, ...categoryOverridesForRef);
    }
    summaryList.sort(function(a, b) {
      let orderA = categoryOrder.indexOf(a.category);
      let orderB = categoryOrder.indexOf(b.category);
      orderA = orderA === -1 ? categoryOrder.length : orderA;
      orderB = orderB === -1 ? categoryOrder.length : orderB;
      return orderA - orderB;
    });
    Sefaria._linkSummaries[cacheKey] = summaryList;
    return summaryList;
  },
  linkSummaryBookSort: function(category, a, b, byHebrew) {
    // Sorter for links in a link summary, included a hard coded list of top spots by category
    // First sort by predefined "top"
    const hebrewTopByCategory = {
      "Tanakh": ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
      "Talmud": ["Rashi", "Tosafot"],
      "Mishnah": ["Bartenura", "Rambam", "Ikar Tosafot Yom Tov", "Yachin", "Boaz"]
    };
    const englishTopByCategory = {
      "Tanakh": ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
      "Talmud": ["Rashi", "Tosafot"],
      "Mishnah": ["Bartenura", "English Explanation of Mishnah", "Rambam", "Ikar Tosafot Yom Tov", "Yachin", "Boaz"]
    };
    const top = (byHebrew ? hebrewTopByCategory[category] : englishTopByCategory[category]) || [];
    let aTop = top.indexOf(a.book);
    let bTop = top.indexOf(b.book);
    if (aTop !== -1 || bTop !== -1) {
      aTop = aTop === -1 ? 999 : aTop;
      bTop = bTop === -1 ? 999 : bTop;
      return aTop < bTop ? -1 : 1;
    }
    // Then sort alphabetically
    if (byHebrew) {
      return a.heBook > b.heBook ? 1 : -1;
    }
    return a.book > b.book ? 1 : -1;
  },
  linkSummaryBookSortHebrew: function(category, a, b) {
    return Sefaria.linkSummaryBookSort(category, a, b, true);
  },
  commentarySectionRef: function(commentator, baseRef) {
    // Given a commentator name and a baseRef, return a ref to the commentary which spans the entire baseRef
    // E.g. ("Rashi", "Genesis 3") -> "Rashi on Genesis 3"
    // Even though most commentaries have a 1:1 structural match to basetexts, this is not alway so.
    // Works by examining links available on baseRef, returns null if no links are in cache.
    if (commentator == "Abarbanel") {
      return null; // This text is too giant, optimizing up to section level is too slow. TODO: generalize.
    }
    var links = Sefaria.getLinksFromCache(baseRef);
    links = Sefaria._filterLinks(links, [commentator]);
    if (!links || !links.length || links[0].isSheet) { return null; }

    var pRefs = links.map(link => Sefaria.parseRef(link.sourceRef));
    if (pRefs.some(pRef => "error" in pRef)) { return null; } // Give up on bad refs

    var books = pRefs.map(pRef => pRef.book).unique();
    if (books.length > 1) { return null; } // Can't handle multiple index titles or schemaNodes

    try {
      var startSections = pRefs.map(pRef => pRef.sections[0]);
      var endSections   = pRefs.map(pRef => pRef.toSections[0]);
    } catch(e) {
      return null;
    }

    const sorter = (a, b) => {
      return a.match(/\d+[ab]/) ?
        Sefaria.hebrew.dafToInt(a) - Sefaria.hebrew.dafToInt(b)
        : parseInt(a) - parseInt(b);
    };

    var commentaryRef = {
      book: books[0],
      sections: startSections.sort(sorter).slice(0,1),
      toSections: endSections.sort(sorter).reverse().slice(0,1)
    };
    var ref = Sefaria.humanRef(Sefaria.makeRef(commentaryRef));

    return ref;
  },
    _descDict: {}, // cache for the description dictionary
    getDescriptions: function(keyName, categoryList) {
        const catlist = Sefaria.tocItemsByCategories(categoryList)
        let catmap = catlist.map((e) => [e.category || e.title, e.enShortDesc, e.heShortDesc])
        let d = {}
        catmap.map((e) => {
            // return array of key: name of "book" value: list of both descriptions
            if (e) {
                d[e[0]]=[e[1], e[2]]
            }
            // special case for commentators that the book name is "on" eg. "Ramban on Genesis"
            if (e[0].includes("on")) {
                d[e[0].split(" on")[0]] = [e[1], e[2]]
            }
        })
        //let descs = d[keyName] || d[Sefaria.index(keyName).collectiveTitle] || d[keyName.split(" on")[0]];
        let descs = d[keyName] || d[Sefaria.index(keyName)] || d[keyName.split(" on")[0]];
        let enShortDesc = descs && descs[0]? descs[0]: null;
        let heShortDesc = descs && descs[1]? descs[1]: null;
        return [enShortDesc, heShortDesc];
  },
    getDescriptionDict: function(keyName, categoryList){
        let desc = this._cachedApi([keyName, categoryList], this._descDict, null);
        if (Object.keys(this._descDict).length === 0){
            //Init of the Dict with the Category level descriptions
            Sefaria.toc.map(e=> {this._descDict[[e.category, []]] = [e.enShortDesc, e.heShortDesc]})
            // todo: get this data out of code (into db?)
            this._descDict[["Commentary", []]] = ["Interpretations and discussions surrounding Buddhist texts, ranging from early medieval to contemporary.", "ནང་པའི་གཞུང་ལུགས་ཀྱི་འགྲེལ་བཤད་དང་བགྲོ་གླེང་། དུས་རབས་བར་མའི་སྟོད་ནས་དེང་སང་གི་བར།"]
            this._descDict[["Quoting Commentary", []]] = ["References to this source within commentaries on other texts in the wider library.", "མཛོད་ཀྱི་གཞུང་གཞན་གྱི་འགྲེལ་པར་འདི་དང་སྦྱར་བ་ནི།"]

            // special case of a category in sidebar that is a sub cat on the navigation toc pages
            this._descDict[["Targum", []]] = this.getDescriptions("Targum", ["Tanakh"])
        }
        if (!desc && categoryList.length !== 0) {
            desc = this.getDescriptions(keyName, categoryList)
            this._descDict[[keyName, categoryList]] = desc
        }
        if (desc) {
            return [desc[0], desc[1]]
        }
        else
        {
            return [null, null];
        }
    },

    _notes: {},
  notes: function(ref, callback) {
    var notes = null;
    if (typeof ref == "string") {
      if (ref in this._notes) {
        notes = this._notes[ref];
      }
    } else {
      var notes = [];
      ref.map(function(r) {
        var newNotes = Sefaria.notes(r);
        notes = newNotes ? notes.concat(newNotes) : notes;
      });
    }
    if (notes) {
      if (callback) { callback(notes); }
    } else {
      Sefaria.related(ref, function(data) {
        if (callback) { callback(data.notes); }
      });
    }
    return notes;
  },
  _saveNoteData: function(ref, data) {
    return this._saveItemsByRef(data, this._notes);
  },
  _privateNotes: {},
  privateNotes: function(refs, callback) {
    // Returns an array of private notes for `refs` (a string or array or strings)
    // or `null` if notes have not yet been loaded.
    if(!Sefaria._uid) return;
    var notes = null;
    if (typeof refs == "string") {
      if (refs in this._privateNotes) {
        notes = this._privateNotes[refs];
      }
      refs = [refs] // Stanfardize type to simplify processing below
    } else {
      var notesByRef = refs.map(function(ref) {
        return Sefaria._privateNotes[ref];
      });
      if (notesByRef.some(function(e) { return !e })) {
        // If any ref in `refs` returned `null`, treat the whole thing as not yet loaded, call the API.
        notes = null;
      } else {
        notes = [];
        notesByRef.map(function(n) { notes = notes.concat(n); });
      }
    }

    if (notes) {
      if (callback) { callback(notes); }
    } else {
      var aggregateCallback = function() {
        // Check if all refs have loaded, call callback if so
       if (Sefaria.privateNotesLoaded(refs) && callback) {
        callback(Sefaria.privateNotes(refs));
       }
      };
      refs.map(function(ref) {
       if (ref in Sefaria._privateNotes) { return; } // Only make API calls for unloaded refs
       var url = Sefaria.apiHost + "/api/notes/" + Sefaria.normRef(ref) + "?private=1";
       this._api(url, function(data) {
          if ("error" in data) {
            return;
          }
          this._savePrivateNoteData(ref, data);
          aggregateCallback(data);
        }.bind(this));
      }.bind(this));
    }
    return notes;
  },
  privateNotesLoaded: function(refs) {
    // Returns true if private notes have been loaded for every ref in `refs.
    refs.map(function(ref) {
      if (!(ref in Sefaria._privateNotes)) {
        return false;
      }
    });
    return true;
  },
  addPrivateNote: function(note) {
    // Add a single private note to the cache of private notes.
    var notes = this.privateNotes(note["anchorRef"]) || [];
    notes = [note].concat(notes);
    this._saveItemsByRef(notes, this._privateNotes);
  },
  clearPrivateNotes: function() {
    this._privateNotes = {};
    this._allPrivateNotes = null;
  },
  _allPrivateNotes: null,
  allPrivateNotes: function(callback) {
    if (!callback)  { return this._allPrivateNotes; }

    if (this._allPrivateNotes) {
      callback(this._allPrivateNotes);
    } else {
      const url = Sefaria.apiHost + "/api/notes/all?private=1";
      this._api(url, (data) => {
        if ("error" in data) {
          return;
        }
        this._savePrivateNoteData(null, data);
        this._allPrivateNotes = data;
        callback(data);
      });
    }
    return this._allPrivateNotes;
  },
  _savePrivateNoteData: function(ref, data) {
    return this._saveItemsByRef(data, this._privateNotes);
  },
  notesTotalCount: function(refs) {
    // Returns the total number of private and public notes on `refs` without double counting my public notes.
    var notes = Sefaria.notes(refs) || [];
    if (Sefaria._uid) {
      var myNotes  = Sefaria.privateNotes(refs) || [];
      notes = notes.filter(function(note) { return note.owner !== Sefaria._uid }).concat(myNotes);
    }
    return notes.length;
  },
  deleteNote: function(noteId) {
    return new Promise((resolve, reject) => {
      $.ajax({
        type: "delete",
        url: `/api/notes/${noteId}`,
        success: () => {
          Sefaria.clearPrivateNotes();
          Sefaria.track.event("Tools", "Delete Note", noteId);
          resolve();
        },
        error: reject
      });
    });
  },


_media: {},
  mediaByRef: function(refs) {
    refs = typeof refs == "string" ? Sefaria.splitRangingRef(refs) : refs.slice();
    var ref = Sefaria.normRefList(refs);

    var media = [];
    refs.map(r => {
      if (this._media[r]) { media = media.concat(this._media[r]); }
    }, this);
	return media;
  },


  _webpages: {},
  _processedWebpages: {},
  webPagesByRef: function(refs) {
    refs = typeof refs == "string" ? Sefaria.splitRangingRef(refs) : refs.slice();
    var ref = Sefaria.normRefList(refs);
    if (ref in this._processedWebpages) { return this._processedWebpages[ref]; }

    var webpages = [];
    refs.map(r => {
      if (this._webpages[r]) { webpages = webpages.concat(this._webpages[r]); }
    }, this);

    webpages.map(page => page.isHebrew = Sefaria.hebrew.isHebrew(page.title));

    webpages = webpages.sort((a, b) => {
      // Sort first by page language matching interface language
      if (a.isHebrew !== b.isHebrew) { return (b.isHebrew ? -1 : 1) * (Sefaria.interfaceLang === "hebrew" ? -1 : 1); }

      // Second, sort by how many anchorRefExpanded refs there are.  Intuition: Genesis 1:2 should come before Genesis 1:2-5, which in turn should come before Genesis 1
      var aNumAnchorRefs, bNumAnchorRefs;
      [aNumAnchorRefs, bNumAnchorRefs] = [a, b].map(page => page.anchorRefExpanded.length);
      if (aNumAnchorRefs !== bNumAnchorRefs) {  return (aNumAnchorRefs - bNumAnchorRefs); }

      // Genesis 2 should come before Genesis 1-3
      var aIsRange, bIsRange;
      [aIsRange, bIsRange] = [a, b].map(page => page.anchorRef.indexOf("-") !== -1);
      if (aIsRange !== bIsRange) { return bIsRange ? -1 : 1; }

      return (a.linkerHits > b.linkerHits) ? -1 : 1;
    });
    this._processedWebpages[ref] = webpages;
    return webpages;
  },
  _refTopicLinks: {},
  _saveTopicByRef: function(ref, data) {
    ref = Sefaria.humanRef(ref);
    const split = this._saveItemsByRef(data, this._refTopicLinks);
    this._refTopicLinks[ref] = data;
    return split;
  },
  topicsByRef: function(refs) {
    refs = typeof refs == "string" ? Sefaria.splitRangingRef(refs) : refs.slice();
    const topicsObj = {};
    let resultLoaded = false;  // _refTopicLinks will have an empty array for ref if ref's topics were loaded
    for (let r of refs) {
      const tempTopicList = this._refTopicLinks[r];
      if (!tempTopicList) { continue; }
      resultLoaded = true;
      for (let tempTopic of tempTopicList) {
        if (!topicsObj[tempTopic.topic]) {
          tempTopic.order = tempTopic.order || {};
          tempTopic.dataSources = {};
          topicsObj[tempTopic.topic] = tempTopic;
        }
        // aggregate dataSources for display in tooltip
        topicsObj[tempTopic.topic].dataSources[tempTopic.dataSource.slug] = tempTopic.dataSource;
      }
    }
    if (!resultLoaded) { return null ;}
    return Object.values(topicsObj).sort((a, b) => b.order.pr - a.order.pr);
  },
  topicsByRefCount: function(refs) {
    const topics = Sefaria.topicsByRef(refs);
    return topics && topics.length;
  },
  _related: {},
  related: function(ref, callback) {
    // Single API to bundle public links, sheets, and notes by ref.
    // `ref` may be either a string or an array of consecutive ref strings.
    ref = Sefaria.humanRef(ref);
    if (!callback) {
      return this._related[ref] || null;
    }
    if (ref in this._related) {
      callback(this._related[ref]);
    } else {
       this.relatedApi(ref, callback);
    }
  },
  _manuscripts: {},
  manuscriptsByRef: function(refs) {
    refs = typeof refs === "string" ? Sefaria.splitRangingRef(refs) : refs.slice();
    let manuscriptPages = [];
    refs.forEach(r => {
      if (this._manuscripts[r]) {
        manuscriptPages = manuscriptPages.concat(this._manuscripts[r]);
      }
    })
    return manuscriptPages
  },
  relatedApi: function(ref, callback) {
    var url = Sefaria.apiHost + "/api/related/" + Sefaria.normRef(ref) + "?with_sheet_links=1";
    return this._api(url, data => {
      if ("error" in data) {
        return;
      }
      var originalData = Sefaria.util.clone(data);

      // Save link, note, and sheet data, and retain the split data from each of these saves
      var split_data = {
          links: this._saveLinkData(ref, data.links),
          notes: this._saveNoteData(ref, data.notes),
          sheets: this.sheets._saveSheetsByRefData(ref, data.sheets),
          webpages: this._saveItemsByRef(data.webpages, this._webpages),
          topics: this._saveTopicByRef(ref, data.topics || []),
		      media: this._saveItemsByRef(data.media, this._media),
          manuscripts: this._saveItemsByRef(data.manuscripts, this._manuscripts)
      };

       // Build split related data from individual split data arrays
      ["links", "notes", "sheets", "webpages", "media"].forEach(obj_type => {
        for (var ref in split_data[obj_type]) {
          if (split_data[obj_type].hasOwnProperty(ref)) {
            if (!(ref in this._related)) {
                this._related[ref] = {links: [], notes: [], sheets: [], webpages: [], media: [], topics: []};
            }
            this._related[ref][obj_type] = split_data[obj_type][ref];
          }
        }
      }, this);


      // Save the original data after the split data - lest a split version overwrite it.
      this._related[ref] = originalData;

      callback(data);
    });
  },
  _relatedPrivate: {},
  relatedPrivate: function(ref, callback) {
    // Single API to bundle private user sheets and notes by ref.
    // `ref` may be either a string or an array of consecutive ref strings.
    // Separated from public content so that public content can be cached
    ref = Sefaria.humanRef(ref);
    if (!callback) {
      return this._relatedPrivate[ref] || null;
    }
    if (ref in this._relatedPrivate) {
      callback(this._relatedPrivate[ref]);
    } else {
       var url = Sefaria.apiHost + "/api/related/" + Sefaria.normRef(ref) + "?private=1";
       this._api(url, function(data) {
          if ("error" in data) {
            return;
          }
          var originalData = Sefaria.util.clone(data);

          // Save link, note, and sheet data, and retain the split data from each of these saves
          var split_data = {
              notes: this._savePrivateNoteData(ref, data.notes),
              sheets: this.sheets._saveUserSheetsByRefData(ref, data.sheets)
          };

          // If ref is a range or section, mark the cache as empty for any subref we didn't encouter.
          let potentialEmptyRefs = Sefaria.splitRangingRef(ref);
          potentialEmptyRefs.forEach(eref => {
            split_data["notes"][eref] = eref in split_data["notes"] ? split_data["notes"][eref] : [];
            this._privateNotes[eref] = eref in this._privateNotes ? this._privateNotes[eref] : [];
          });
          potentialEmptyRefs.forEach(eref => {
            split_data["sheets"][eref] = eref in split_data["sheets"] ? split_data["sheets"][eref] : [];
            this.sheets._userSheetsByRef[eref] = eref in this.sheets._userSheetsByRef ? this.sheets._userSheetsByRef[eref] : [];
          });

           // Build split related data from individual split data arrays
          ["notes", "sheets"].forEach(function(obj_type) {
            for (var ref in split_data[obj_type]) {
              if (split_data[obj_type].hasOwnProperty(ref)) {
                if (!(ref in this._relatedPrivate)) {
                    this._relatedPrivate[ref] = {notes: [], sheets: []};
                }
                this._relatedPrivate[ref][obj_type] = split_data[obj_type][ref];
              }
            }
          }, this);

           // Save the original data after the split data - lest a split version overwrite it.
          this._relatedPrivate[ref] = originalData;

          callback(data);

        }.bind(this));
    }
  },
  clearLinks: function() {
    this._related = {};
    this._links = {};
    this._linkSummaries = {};
  },
  removeLink: function(_id) {

  },
  isACaseVariant: function(query, data) {
    // Check if query is just an improper capitalization of something that otherwise would be a ref
    // query: string
    // data: dictionary, as returned by /api/name
    return (!(data["is_ref"]) &&
          data["completions"] &&
          data["completions"].length &&
          data["completions"][0] != query &&
          data["completions"][0].toLowerCase().replace('״','"') == query.slice(0, data["completions"][0].length).toLowerCase().replace('״','"') &&
          data["completions"][0] != query.slice(0, data["completions"][0].length))
  },
  repairCaseVariant: function(query, data) {
    if (Sefaria.isACaseVariant(query, data)) {
        const completionArray = data["completion_objects"].map(x => x.title);
        let normalizedQuery = query.toLowerCase();
        let bestMatch = "";
        let bestMatchLength = 0;

        completionArray.forEach((completion) => {
            let normalizedCompletion = completion.toLowerCase();
            if (normalizedQuery.includes(normalizedCompletion) && normalizedCompletion.length > bestMatchLength) {
                bestMatch = completion;
                bestMatchLength = completion.length;
            }
        });
        return bestMatch + query.slice(bestMatch.length);
    }
    return query;
  },
  repairGershayimVariant: function(query, data) {
    if (!data["is_ref"] && data.completions && !data.completions.includes(query)) {
        function normalize_gershayim(string) {
            return string.replace('״', '"');
        }
        const normalized_query = normalize_gershayim(query);
        for (let c of data.completions) {
            if (normalize_gershayim(c) === normalized_query) {
                return c;
            }
        }
    }
    return query;
  },
  makeSegments: function(data, withContext, sheets=false) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if (!data || "error" in data) { return []; }
    var segments  = [];
    var highlight = data.sections.length === data.textDepth;
    var wrapEn = (typeof data.text == "string");
    var wrapHe = (typeof data.he == "string");
    var en = wrapEn ? [data.text] : data.text;
    var he = wrapHe ? [data.he] : data.he;
    var topLength = Math.max(en.length, he.length);
    en = en.pad(topLength, "");
    he = he.pad(topLength, "");

    const index_offsets_by_depth = this._get_offsets(data, topLength);
    var start = (data.textDepth == data.sections.length && !withContext ?
                  data.sections.slice(-1)[0] : 1+index_offsets_by_depth[0]);
    if (!data.isSpanning) {
      for (var i = 0; i < topLength; i++) {
        var number = i+start;
        var delim  = data.textDepth == 1 ? " " : ":";
        var ref = data.sectionRef + delim + number;
        segments.push({
          ref: ref,
          en: en[i],
          he: he[i],
          number: number,
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0],
          alt: ("alts" in data && i < data.alts.length) ? data.alts[i] : null
        });
      }
    } else {
      for (var n = 0; n < topLength; n++) {
        var en2 = typeof en[n] == "string" ? [en[n]] : en[n];
        var he2 = typeof he[n] == "string" ? [he[n]] : he[n];
        var length = Math.max(en2.length, he2.length);
        en2 = en2.pad(length, "");
        he2 = he2.pad(length, "");
        var baseRef     = data.book;
        var baseSection = data.sections.slice(0,-2).join(":");
        var delim       = baseSection ? ":" : " ";
        var baseRef     = baseSection ? baseRef + " " + baseSection : baseRef;

        start = (n == 0 ? start : 1+index_offsets_by_depth[n]);
        for (var i = 0; i < length; i++) {
          var startSection = data.sections.slice(-2)[0];
          var section = typeof startSection == "string" ?
                        Sefaria.hebrew.intToDaf(n+Sefaria.hebrew.dafToInt(startSection))
                        : n + startSection;
          var number  = i + start;
          var ref = baseRef + delim + section + ":" + number;
          segments.push({
            ref: ref,
            en: en2[i],
            he: he2[i],
            number: number,
            highlight: highlight &&
                        ((n == 0 && number >= data.sections.slice(-1)[0]) ||
                         (n == topLength-1 && number <= data.toSections.slice(-1)[0]) ||
                         (n > 0 && n < topLength -1)),
            alt: ("alts" in data && n < data.alts.length && i < data.alts[n].length) ? data.alts[n][i] : null
          });
        }
      }
    }
    return segments;
  },
  stripImagesFromSegments: function(segments) {
      // Used by sheets editors.  Sefaria.makeSegments creates a list of segments and this function handles the images.
      return segments.map(x => {
          x.he = Sefaria.util.stripImgs(x.he);
          x.en = Sefaria.util.stripImgs(x.en);
          return x;
      })
  },
  sectionString: function(ref) {
    // Returns a pair of nice strings (en, he) of the sections indicated in ref. e.g.,
    // "Genesis 4" -> "Chapter 4", "Guide for the Perplexed, Introduction" - > "Introduction"
    var data = this.getRefFromCache(ref);
    var result = {
          en: {named: "", numbered: ""},
          he: {named: "", numbered: ""}
        };
    if (!data) { return result; }

    // English
    var sections = ref.slice(data.indexTitle.length+1);
    var name = data.sectionNames.length > 1 ? data.sectionNames[0] + " " : "";
    if (data.isComplex) {
      var numberedSections = data.ref.slice(data.book.length+1);
      if (numberedSections) {
        var namedSections    = sections.slice(0, -(numberedSections.length+1));
        var string           = (namedSections ? namedSections + ", " : "") + name +  numberedSections;
      } else {
        var string = sections;
      }
    } else {
      var string = name + sections;
    }
    result.en.named    = string;
    result.en.numbered = sections;

    // Hebrew
    var sections = data.heRef.slice(data.heIndexTitle.length+1);
    var name = ""; // missing he section names // data.sectionNames.length > 1 ? " " + data.sectionNames[0] : "";
    if (data.isComplex) {
      var numberedSections = data.heRef.slice(data.heTitle.length+1);
      if (numberedSections) {
        var namedSections    = sections.slice(0, -(numberedSections.length+1));
        var string           = (namedSections ? namedSections + ", " : "") + name + " " + numberedSections;
      } else {
        string = sections;
      }

    } else {
      var string = name + sections;
    }
    result.he.named    = string;
    result.he.numbered = sections;

    return result;
  },
  commentaryList: function(title, toc) {
    var title = arguments.length == 0 || arguments[0] === undefined ? null : arguments[0];
    /** Returns the list of commentaries for 'title' which are found in Sefaria.toc **/
    var toc = arguments.length <= 1 || arguments[1] === undefined ? Sefaria.util.clone(Sefaria.toc) : arguments[1];
    if (title != null){
        var index = this.index(title); //TODO: a little bit redundant to do on every recursion
        if (!index) { return []; }
        title = index.title;
    }
    var results = [];
    for (var i=0; i < toc.length; i++) {
        var curTocElem = toc[i];
        if (curTocElem.title) { //this is a book
            if(curTocElem.dependence == 'Commentary'){
                if((title && curTocElem.base_text_titles && (title in curTocElem.refs_to_base_texts)) || (title == null)){
                    results.push(curTocElem);
                }
            }
        } else if (curTocElem.contents) { //this is still a category and might have books under it
          results = results.concat(Sefaria.commentaryList(title, curTocElem.contents));
        }
    }
    return results;
  },
  tocObjectByCategories: function(cats) {
    // Returns the TOC entry that corresponds to list of categories `cats`
    let found, item;
    let list = Sefaria.toc;
    for (let i = 0; i < cats.length; i++) {
      found = false;
      item = null;
      for (let k = 0; k < list.length; k++) {
        if (list[k].category === cats[i]) {
          item = list[k];
          list = item.contents || [];
          found = true;
          break;
        }
      }
      if (!found) { return null; }
    }
    return item;
  },
  tocItemsByCategories: function(cats) {
    // Returns the TOC items that correspond to the list of categories 'cats'
    const object = Sefaria.tocObjectByCategories(cats);
    return object ? Sefaria.util.clone(object.contents) : [];
  },
  categoryAttribution: function(categories) {
    var attributions = [
      {
        categories: ["Talmud", "Bavli"],
        english: "The William Davidson Talmud",
        hebrew: "תלמוד מהדורת ויליאם דוידסון",
        englishAsEdition: "The William Davidson Edition",
        hebrewAsEdition: "מהדורת ויליאם דוידסון",
        link: "/william-davidson-talmud"
      }
    ];
    var attribution = null;
    for (var i = 0; i < attributions.length; i++) {
      if (categories.length >= attributions[i].categories.length &&
        attributions[i].categories.compare(categories.slice(0, attributions[i].categories.length))) {
        attribution = attributions[i];
        break;
      }
    }
    return attribution;
  },
  getPassages: function(refs) {
    // refs: list of ref strings
    // resolves to dictionary mapping ref to sugya ref
    return this._ApiPromise(Sefaria.apiHost + "/api/passages/" + refs.join("|"));
  },
  areVersionsEqual(v1, v2) {
    // v1, v2 are `currVersions` objects stored like {en: ven, he: vhe}
    return v1.en == v2.en && v1.he == v2.he;
  },
  getSavedItem: ({ ref, versions }) => {
    return Sefaria.saved.items.find(s => s.ref === ref && Sefaria.areVersionsEqual(s.versions, versions));
  },
  removeSavedItem: ({ ref, versions }) => {
    Sefaria.saved.items = Sefaria.saved.items.filter(x => !(x.ref === ref && Sefaria.areVersionsEqual(versions, x.versions)));
  },
  toggleSavedItem: ({ ref, versions, sheet_owner, sheet_title }) => {
    return new Promise((resolve, reject) => {
      const action = !!Sefaria.getSavedItem({ ref, versions }) ? "delete_saved" : "add_saved";
      const savedItem = { ref, versions, time_stamp: Sefaria.util.epoch_time(), action, sheet_owner, sheet_title };
      if (Sefaria._uid) {
        $.post(`${Sefaria.apiHost}/api/profile/sync?no_return=1`,
          { user_history: JSON.stringify([savedItem]), client: 'web' }
        ).done(response => {
          if (!!response['error']) {
            reject(response['error'])
          } else {
            if (action === "add_saved" && !!response.created && response.created.length > 0) {
              Sefaria.saved.items = response.created.concat(Sefaria.saved.items);
            } else {
              // delete
              Sefaria.removeSavedItem({ ref, versions });
            }
            resolve(response);
          }
        }).fail((jqXHR, textStatus, errorThrown) => {
          reject(errorThrown);
        })
      } else {
        reject('notSignedIn');
      }
    });
  },
  editProfileAPI: (partialProfile) => {
    const data = {json: JSON.stringify(partialProfile)};
    return new Promise((resolve, reject) => {
      $.post(`${Sefaria.apiHost}/api/profile`, data, resolve);
    });
  },
  followAPI: (slug, ftype) => {
    return Sefaria._ApiPromise(Sefaria.apiHost + `/api/profile/${slug}/${ftype}`);
  },
  messageAPI: (uid, message) => {
    const data = {json: JSON.stringify({recipient: uid, message: message.escapeHtml()})};
    return new Promise((resolve, reject) => {
      $.post(`${Sefaria.apiHost}/api/messages`, data, resolve);
    });
  },
  chatMessageAPI: (roomId, senderId, timestamp, messageContent) => {
    const data = {json: JSON.stringify({roomId: roomId, senderId: senderId, timestamp, messageContent})};
    return new Promise((resolve, reject) => {
      $.post(`${Sefaria.apiHost}/api/chat-messages`, data, resolve);
    })
  },
  getChatMessagesAPI: (roomId) => {
    return Sefaria._ApiPromise(Sefaria.apiHost + `/api/chat-messages/?room_id=${roomId}`);
  },
  getRefSavedHistory: tref => {
    return Sefaria._ApiPromise(Sefaria.apiHost + `/api/user_history/saved?tref=${tref}`);
  },
  _profiles: {},
  profileAPI: slug => {
    return Sefaria._cachedApiPromise({
      url:   Sefaria.apiHost + "/api/profile/" + slug,
      key:   slug,
      store: Sefaria._profiles
    });
  },
  userHistory: {loaded: false, items: []},
  saveUserHistory: function(history_item) {
    // history_item contains:
    // `ref`, `book`, `versions`, `sheet_title`, `sheet_owner``
    // optionally: `secondary`, `he_ref`, `language`
    if(!Sefaria.is_history_enabled || !history_item) {
        return;
    }
    const history_item_array = Array.isArray(history_item) ? history_item : [history_item];
    for (let h of history_item_array) {
      h.time_stamp = Sefaria.util.epoch_time();
    }
    if (Sefaria._uid) {
        $.post(Sefaria.apiHost + "/api/profile/sync?no_return=1&annotate=1",
              {user_history: JSON.stringify(history_item_array)},
              data => {
                // Insert new items to beginning of history
                Sefaria.userHistory.items = data.created.concat(Sefaria.userHistory.items);
              } );
    } else {
      // we need to get the heRef for each history item
      Promise.all(history_item_array.filter(x=>!x.secondary).map(h => new Promise((resolve, reject) => {
        Sefaria.getRef(h.ref).then(oref => {
          h.he_ref = oref.heRef;
          resolve(h);
        });
      }))).then(new_hist_array => {
        const cookie = Sefaria._inBrowser ? $.cookie : Sefaria.util.cookie;
        const user_history_cookie = cookie("user_history");
        const user_history = !!user_history_cookie ? JSON.parse(user_history_cookie) : [];
        cookie("user_history", JSON.stringify(new_hist_array.concat(user_history)), {path: "/"});
        Sefaria.userHistory.items = new_hist_array.concat(user_history);

        //console.log("saving history cookie", new_hist_array);
        if (Sefaria._inBrowser) {
          // check if we've reached the cookie size limit
          const cookie_hist = JSON.parse(cookie("user_history"));
          if (cookie_hist.length < (user_history.length + new_hist_array.length)) {
            // save failed silently. resave by popping old history
            if (new_hist_array.length < user_history.length) {
              new_hist_array = new_hist_array.concat(user_history.slice(0, -new_hist_array.length));
            }
            cookie("user_history", JSON.stringify(new_hist_array), {path: "/"});
          }
        }
      });
    }
    Sefaria.last_place = history_item_array.filter(x=>!x.secondary).concat(Sefaria.last_place);  // while technically we should remove dup. books, this list is only used on client
  },
    isNewVisitor: () => {
        return (
            ("isNewVisitor" in sessionStorage &&
                JSON.parse(sessionStorage.getItem("isNewVisitor"))) ||
            (!("isNewVisitor" in sessionStorage) && !("isReturningVisitor" in localStorage))
        );
    },
    isReturningVisitor: () => {
        return (
            !Sefaria.isNewVisitor() &&
            "isReturningVisitor" in localStorage &&
            JSON.parse(localStorage.getItem("isReturningVisitor"))
        );
    },
    markUserAsNewVisitor: () => {
        sessionStorage.setItem("isNewVisitor", "true");
        // Setting this at this time will make the current new visitor a returning one once their session is cleared
        localStorage.setItem("isReturningVisitor", "true");
    },
    markUserAsReturningVisitor: () => {
      sessionStorage.setItem("isNewVisitor", "false");
      localStorage.setItem("isReturningVisitor", "true");
    },
  uploadProfilePhoto: (formData) => {
    return new Promise((resolve, reject) => {
      if (Sefaria._uid) {
        $.ajax({
          url: Sefaria.apiHost + "/api/profile/upload-photo",
          type: 'post',
          data: formData,
          contentType: false,
          processData: false,
          success: function(data) {
            resolve(data);
          },
          error: function(e) {
            console.log("photo upload ERROR", e);
            reject(e);
          }
        });
      }
    })
  },
  lastPlaceForText: function(title) {
    // Return the most recently visited item for text `title` or undefined if `title` is not present in last_place.
    return Sefaria.last_place.find(x => x.book === title);
  },
  _topicList: null,
  topicList: function(callback) {
    // Returns promise for all topics list.
    if (this._topicList) { return Promise.resolve(this._topicList); }
    return this._ApiPromise(Sefaria.apiHost + "/api/topics?limit=0")
        .then(d => {
          for (let topic of d) {
            topic.normTitles = topic.titles.map(title => title.text.toLowerCase());
          }
          this._topicList = d;
          return d;
        });
  },
  sortTopicsCompareFn: function(a, b) {
    // a compare function that is useful for sorting topics
    // Don't use display order intended for top level a category level. Bandaid for unclear semantics on displayOrder.
    const [aDisplayOrder, bDisplayOrder] = [a, b].map(x => Sefaria.isTopicTopLevel(x.slug) ? 10000 : x.displayOrder);

    // Sort alphabetically according to interface lang in absense of display order
    if (aDisplayOrder === bDisplayOrder) {
      const stripInitialPunctuation = str => str.replace(/^["#]/, "");
      const [aAlpha, bAlpha] = [a, b].map(x => {
        if (Sefaria.interfaceLang === "hebrew") {
          return (x.he.length) ?
            stripInitialPunctuation(x.he) :
           "תתת" + stripInitialPunctuation(x.en);
        } else {
          return (x.en.length) ?
            stripInitialPunctuation(x.en) :
            stripInitialPunctuation(x.he)
        }
      });

      return aAlpha < bAlpha ? -1 : 1;
    }

    return aDisplayOrder - bDisplayOrder;

  },
  _tableOfContentsDedications: {},
    _strapiContent: null,
  _inAppAds: null,
  _stories: {
    stories: [],
    page: 0
  },
  _parashaNextRead: {},
  getParashaNextRead: function(parasha) {
    return this._cachedApiPromise({
      url:   `${this.apiHost}/api/calendars/next-read/${parasha}`,
      key:   parasha,
      store: this._parashaNextRead,
    });
  },
  _bookSearchPathFilter: {},
  bookSearchPathFilterAPI: title => {
    return Sefaria._cachedApiPromise({
      url:   Sefaria.apiHost + "/api/search-path-filter/" + title,
      key:   title,
      store: Sefaria._bookSearchPathFilter
    });
  },
  _topics: {},
  _topicPageSize: 70, // how many sources should show when incrementally loading sources
  _CAT_REF_LINK_TYPE_FILTER_MAP: {
    'authors': ['popular-writing-of'],
  },
  getTopic: function(slug, {annotated=true, with_html=false}={}) {
    const cat = Sefaria.topicTocCategory(slug);
    let ref_link_type_filters = ['about', 'popular-writing-of']
    // overwrite ref_link_type_filters with predefined list. currently used to hide "Sources" and "Sheets" on author pages.
    if (!!cat && !!Sefaria._CAT_REF_LINK_TYPE_FILTER_MAP[cat.slug]) {
      ref_link_type_filters = Sefaria._CAT_REF_LINK_TYPE_FILTER_MAP[cat.slug];
    }
    const a = 0 + annotated;
    const url = `${this.apiHost}/api/v2/topics/${slug}?annotate_time_period=1&ref_link_type_filters=${ref_link_type_filters.join('|')}&with_html=${0 + with_html}&with_links=${a}&annotate_links=${a}&with_refs=${a}&group_related=${a}&with_indexes=${a}`;
    const key = this._getTopicCacheKey(slug, {annotated, with_html});
    return this._cachedApiPromise({
      url,
      key,
      store: this._topics,
      processor: this.processTopicsData,
    });
  },
  _getTopicCacheKey: function(slug, {annotated=true, with_html=false}={}) {
      return slug + (annotated ? "-a" : "") + (with_html ? "-h" : "");
  },
  processTopicsData: function(data) {
    if (!data) { return null; }
    if (!data.refs) { return data; }
    const tabs = {};
    for (let [linkTypeSlug, linkTypeObj] of Object.entries(data.refs)) {
      for (let refObj of linkTypeObj.refs) {
        let tabKey = linkTypeSlug;
        if (tabKey === 'about') {
          tabKey = refObj.is_sheet ? 'sheets' : 'sources';
        }
        if (!tabs[tabKey]) {
          let { title } = linkTypeObj;
          if (tabKey === 'sheets') {
            title = {en: 'Sheets', he: Sefaria._('Sheets')};
          }
          if (tabKey === 'sources') {
            title = {en: 'Sources', he: Sefaria._('Sources')};
          }
          tabs[tabKey] = {
            refMap: {},
            title,
            shouldDisplay: linkTypeObj.shouldDisplay,
          };
        }
        const ref = refObj.is_sheet ? parseInt(refObj.ref.replace('Sheet ', '')) : refObj.ref;
        if (refObj.order) {
            refObj.order = {...refObj.order, availableLangs: refObj?.order?.availableLangs || [],
                                numDatasource: refObj?.order?.numDatasource || 1,
                                tfidf: refObj?.order?.tfidf || 0,
                                pr: refObj?.order?.pr || 0,
                                curatedPrimacy: {he: refObj?.order?.curatedPrimacy?.he || 0, en: refObj?.order?.curatedPrimacy?.en || 0}}}
        tabs[tabKey].refMap[refObj.ref] = {ref, order: refObj.order, dataSources: refObj.dataSources, descriptions: refObj.descriptions};
      }
    }
    for (let tabObj of Object.values(tabs)) {
      tabObj.refs = Object.values(tabObj.refMap);
      delete tabObj.refMap;
    }
    data.tabs = tabs;
    return data;
  },
  getTopicFromCache: function(slug, {annotated=true, with_html=false}={}) {
      const key = this._getTopicCacheKey(slug, {annotated, with_html});
      return this._topics[key];
  },
  _topicSlugsToTitles: null,
  slugsToTitles: function() {
    //initializes _topicSlugsToTitles for Topic Editor tool and adds necessary "Choose a Category" and "Main Menu" for
    //proper use of the Topic Editor tool
    if (!Sefaria._topicSlugsToTitles) { this._topicSlugsToTitles = Sefaria.topic_toc.reduce(Sefaria._initTopicTocSlugToTitleReducer, {});}
    return Sefaria._topicSlugsToTitles;
  },
  _topicTocPages: null,
  _initTopicTocPages: function() {
    this._topicTocPages = this.topic_toc.reduce(this._initTopicTocReducer, {});
    this._topicTocPages[this._topicTocPageKey()] = this.topic_toc.map(({children, ...goodstuff}) => goodstuff);
  },
  _initTopicTocReducer: function(a,c) {
    if (!c.children) { return a; }
    a[Sefaria._topicTocPageKey(c.slug)] = c.children;
    for (let sub_c of c.children) {
      Sefaria._initTopicTocReducer(a, sub_c);
    }
    return a;
  },
  _initTopicTocSlugToTitleReducer: function(a,c) {
    if (!c.children) { return a; }
    a[c.slug] = {"en": c.en, "he": c.he};
    for (let sub_c of c.children) {
      Sefaria._initTopicTocSlugToTitleReducer(a, sub_c);
    }
    return a;
  },
  _topicTocCategory: null,
  _initTopicTocCategory: function() {
    this._topicTocCategory = this.topic_toc.reduce(this._initTopicTocCategoryReducer, {});
  },
  _initTopicTocCategoryReducer: function(a,c) {
    if (!c.children) {
      a[c.slug] = c.parent;
      return a;
    }
    for (let sub_c of c.children) {
      sub_c.parent = { en: c.en, he: c.he, slug: c.slug };
      Sefaria._initTopicTocCategoryReducer(a, sub_c);
    }
    return a;
  },
  _topicTocPageKey: slug => "_" + slug,
  topicTocPage: function(parent) {
    const key = this._topicTocPageKey(parent);
    if (!this._topicTocPages) {
        this._initTopicTocPages()
    }
    return this._topicTocPages[key]
  },
  topicTocCategory: function(slug) {
    // return category english and hebrew for slug
    if (!this._topicTocCategory) { this._initTopicTocCategory(); }
    return this._topicTocCategory[slug];
  },
  _topicTocCategoryTitles: null,
  _initTopicTocCategoryTitles: function() {
    this._topicTocCategoryTitles = this.topic_toc.reduce(this._initTopicTocCategoryTitlesReducer, {});
  },
  _initTopicTocCategoryTitlesReducer: function(a,c) {
    if (!c.children) {
      return a;
    }
    a[c.slug] = {en: c.en, he: c.he};

    for (let sub_c of c.children) {
      Sefaria._initTopicTocCategoryReducer(a, sub_c);
    }
    return a;
  },
  topicTocCategoryTitle: function(slug) {
    // returns english and hebrew titles for the topic category named by `slug``
    if (!this._topicTocCategoryTitles) { this._initTopicTocCategoryTitles(); }
    return this._topicTocCategoryTitles[slug];
  },
  isTopicTopLevel: function(slug) {
    // returns true is `slug` is part of the top level of topic toc
    return Sefaria.topic_toc.filter(x => x.slug == slug).length > 0;
  },
  sheets: {
    _loadSheetByID: {},
    loadSheetByID: function(id, callback, reset) {
      if (reset) {
        delete this._loadSheetByID[id];
      }
      const sheet = this._loadSheetByID[id];
      if (sheet) {
        if (callback) { callback(sheet); }
      } else if (callback) {
        const url = "/api/sheets/" + id +"?more_data=1";
         $.getJSON(url, data => {
            if ("error" in data) {
                console.log(data["error"])
            }
            this._loadSheetByID[id] = data;
            callback(data);
            callback(data);
          });
        }
      return sheet;
    },
    deleteSheetById: function(id) {
      return Sefaria._ApiPromise(`/api/sheets/${id}/delete`);
    },
    _userSheets: {},
    userSheets: function(uid, callback, sortBy="date", offset=0, numberToRetrieve=0) {
      // Returns a list of source sheets belonging to `uid`
      // Only a user logged in as `uid` will get private data from this API.
      // Otherwise, only public data will be returned
      const key = uid+"|"+sortBy+offset+numberToRetrieve;
      const sheets = this._userSheets[key];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        const url = Sefaria.apiHost + "/api/sheets/user/" + uid + "/" + sortBy + "/" + numberToRetrieve + "/" + offset;
        Sefaria._ApiPromise(url).then(data => {
          this._userSheets[key] = data.sheets;
          if (callback) { callback(data.sheets); }
        });
      }
      return sheets;
    },
    updateUserSheets: function(sheet, uid, update=true, updateInPlace=false){
      for (const key in this._userSheets) {
        if (key.startsWith(uid.toString()+"|")){
          if (update) {
            const sheetIndex = this._userSheets[key].findIndex(item => item.id === sheet.id);
            if (key.includes("date") && !updateInPlace) { //add to front because we sorted by date
              this._userSheets[key].splice(sheetIndex, 1);
              this._userSheets[key].unshift(sheet);
            } else if (updateInPlace) {
              this._userSheets[key][sheetIndex] = sheet;
            } else {
              this._userSheets[key].unshift(sheet);
            }
          } else {
            this._userSheets[key].push(sheet);
          }
        }
      }
    },
    clearUserSheets: function(uid) {
      this._userSheets  = Object.keys(this._userSheets)
      .filter(key => !key.startsWith(uid.toString()))
      .reduce((obj, key) => {
        return {
          ...obj,
          [key]: this._userSheets[key]
        };
      }, {});
    },
    _publicSheets: {},
    publicSheets: function(offset, limit, options, skipCache, callback) {
      // Returns a list of public sheets
      offset = offset || 0;
      limit = limit || 30;
      options = options || {};

      const params = param(options);
      const path = limit+"/"+offset + (params ? "?" + params : "");

      const sheets = this._publicSheets[path];
      if (sheets && !skipCache) {
        if (callback) { callback(sheets); }
      } else {
        const url = Sefaria.apiHost + "/api/sheets/all-sheets/" + path

        Sefaria._api(url, function(data) {
          this._publicSheets[path] = data.sheets;
          if (callback) { callback(data.sheets); }
        }.bind(this));
      }
      return sheets;
    },
    _sheetsByRef: {},
    sheetsByRef: function(ref, cb) {
      // Returns a list of public sheets that include `ref`.
      var sheets = null;
      if (typeof ref == "string") {
        if (ref in this._sheetsByRef) {
          sheets = this._sheetsByRef[ref];
        }
      } else {
        var sheets = [];
        ref.map(function(r) {
          var newSheets = Sefaria.sheets.sheetsByRef(r);
          if (newSheets) {
            sheets = sheets.concat(newSheets);
          }
        });
        // sheets anchored to spanning refs may cause duplicates
        var seen = {};
        var deduped = [];
        sheets.map(sheet => {
          if (!seen[sheet.id]) { deduped.push(sheet); }
          seen[sheet.id] = true;
        });
        sheets = deduped;
      }
      if (sheets) {
        if (cb) { cb(sheets); }
      } else {
        Sefaria.related(ref, function(data) {
          if (cb) { cb(data.sheets); }
        });
      }
      return sheets;
    },
    _saveSheetsByRefData: function(ref, data) {
      this._sheetsByRef[ref] = data;
      return Sefaria._saveItemsByRef(data, this._sheetsByRef);
    },
    _userSheetsByRef: {},
    userSheetsByRef: function(ref, cb) {
      // Returns a list of public sheets that include `ref`.
      var sheets = null;
      if (typeof ref == "string") {
        if (ref in this._userSheetsByRef) {
          sheets = this._userSheetsByRef[ref];
        }
      } else {
        var sheets = [];
        ref.map(function(r) {
          var newSheets = Sefaria.sheets.userSheetsByRef(r);
          if (newSheets) {
            sheets = sheets.concat(newSheets);
          }
        });
      }
      if (sheets) {
        if (cb) { cb(sheets); }
      } else {
        Sefaria.relatedPrivate(ref, function(data) {
          if (cb) { cb(data.sheets); }
        });
      }
      return sheets;
    },
    _saveUserSheetsByRefData: function(ref, data) {
      this._userSheetsByRef[ref] = data;
      return Sefaria._saveItemsByRef(data, this._userSheetsByRef);
    },
    sheetsTotalCount: function(refs) {
      // Returns the total number of private and public sheets on `refs` without double counting my public sheets.
      var sheets = Sefaria.sheets.sheetsByRef(refs) || [];
      if (Sefaria._uid) {
        var mySheets = Sefaria.sheets.userSheetsByRef(refs) || [];
        sheets = sheets.filter(function(sheet) { return sheet.owner !== Sefaria._uid }).concat(mySheets);
      }
      return sheets.length;
    },
    extractIdFromSheetRef: function (ref) {
      return typeof ref === "string" ? parseInt(ref.split(" ")[1]) : parseInt(ref[0].split(" ")[1]);
    }
  },
  _translations: {},
  getTranslation: function(key) {
    const url = Sefaria.apiHost + "/api/texts/translations/" + key;
    const store = this._translations;
    return this._cachedApiPromise({url, key, store})
  },
  _collections: {},
  getCollection: function(key) {
      const url = Sefaria.apiHost + "/api/collections/" + encodeURIComponent(key);
      const store = this._collections;
      return this._cachedApiPromise({url, key, store});
  },
  getCollectionFromCache: function(key) {
    return Sefaria._collections[key];
  },
  _collectionsList: {},
  getCollectionsList: function() {
      return this._cachedApiPromise({
        url: Sefaria.apiHost + "/api/collections",
        key: "list",
        store: Sefaria._collectionsList
      });
  },
  getCollectionsListFromCache() {
    return Sefaria._collectionsList.list;
  },
  _userCollections: {},
  getUserCollections: function(uid) {
    return this._cachedApiPromise({
      url: `${Sefaria.apiHost}/api/collections/user-collections/${uid}`,
      key: uid,
      store: Sefaria._userCollections
    });
  },
  getUserCollectionsFromCache(uid) {
    return Sefaria._userCollections[uid];
  },
  _userCollectionsForSheet: {},
  getUserCollectionsForSheet: function(sheetID) {
    return this._cachedApiPromise({
      url: `${Sefaria.apiHost}/api/collections/for-sheet/${sheetID}`,
      key: sheetID,
      store: Sefaria._userCollectionsForSheet
    });
  },
  getUserCollectionsForSheetFromCache(sheetID) {
    return Sefaria._userCollectionsForSheet[sheetID];
  },
  getBackgroundData() {
    return Sefaria._ApiPromise("/api/background-data?locale=" + Sefaria.interfaceLang)
      .then(data => { Sefaria = extend(Sefaria, data); });
  },
  calendarRef: function(calendarTitle) {
    const cal = Sefaria.calendars.filter(cal => cal.title.en === calendarTitle);
    return cal.length ? cal[0].ref : null;
  },
  _translateTerms: {},
  _cacheHebrewTerms: function(terms) {
      Sefaria._translateTerms = extend(terms, Sefaria._translateTerms);
  },
  hebrewTerm: function(name) {
    // Returns a string translating `name` into Hebrew.
    const categories = {
      "Quoting Commentary":   "פרשנות מצטטת",
      "Modern Commentary":    "פרשנות מודרנית",
      "Sheets":               "דפי מקורות",
      "Notes":                "הערות",
      "Community":            "קהילה"
    };
    if (name in Sefaria._translateTerms) {
        return Sefaria._translateTerms[name]["he"];
    } else if (Sefaria._translateVersions[Sefaria.getTranslateVersionsKey(name, 'en')]) {
        return Sefaria._translateVersions[Sefaria.getTranslateVersionsKey(name, 'en')]["he"];
    } else if (Sefaria._translateVersions[Sefaria.getTranslateVersionsKey(name, 'he')]) {
        return Sefaria._translateVersions[Sefaria.getTranslateVersionsKey(name, 'he')]["he"];
    } else if (name in categories) {
        return  categories[name];
    } else if (Sefaria.index(name)) {
        return Sefaria.index(name).heTitle;
    } else {
        return name;
    }
  },
  hebrewTranslation: function(inputStr, context = null){
    let translatedString;
    if (context && context in Sefaria._i18nInterfaceStringsWithContext){
      translatedString = Sefaria._getStringCaseInsensitive(Sefaria._i18nInterfaceStringsWithContext[context], inputStr);
      if (translatedString !== null) return translatedString;
    }
    if ((translatedString = Sefaria._getStringCaseInsensitive(Sefaria._i18nInterfaceStrings, inputStr)) !== null ) {
      return translatedString;
    }
    if ((translatedString = Sefaria.hebrewTerm(inputStr)) != inputStr) {
      return translatedString;
    }
    if (inputStr.indexOf(" | ") !== -1) {
      var inputStrs = inputStr.split(" | ");
      return Sefaria._(inputStrs[0])+ " | " + Sefaria._(inputStrs[1]);
    } else {
      //console.warn("Missing Hebrew translation for: " + inputStr);
      return inputStr;
    }
  },
  translation: function(language, inputStr, context=null){
      const translationMatrix = {
          "he": Sefaria.hebrewTranslation
      };
      try {
          return translationMatrix[language.slice(0,2)](inputStr, context);
      }catch (e){
          console.warn("No transaltion available for " + language)
          return inputStr;
      }
  },
  _: function(inputStr, context=null){
    if(Sefaria.interfaceLang !== "english"){
      return Sefaria.translation(Sefaria.interfaceLang, inputStr, context);
    } else {
      return inputStr;
    }
  },
  _v: function(langOptions){
    /* Takes an object {en: "something", he: "משהו"}
     * and returns the correct one according to interface language
     * Convenience method for when there are two data variables in an object one wishes to return
     * according to interface, in places where HTML is not allowed (inside <options> tag for ex.
    */
    const lang = Sefaria.interfaceLang.slice(0,2);
    return langOptions[lang] ? langOptions[lang] : "";
  },
  _r: function (inputRef) {
    const oref = Sefaria.getRefFromCache(inputRef);
    if (!oref) { return inputRef; }
    return Sefaria.interfaceLang != "english" ? oref.heRef : oref.ref;
  },
  _getStringCaseInsensitive: function (store, inputStr){
    if(inputStr in store){
        return store[inputStr];
    }else if(inputStr.toLowerCase() in store){
        return store[inputStr.toLowerCase()];
    }else return null;

    //return inputStr in store ? store[inputStr] : (inputStr.toLowerCase() in store ? store[inputStr.toLowerCase()]
      // : null);
  },
  _cacheSiteInterfaceStrings: function() {
    // Ensure that names set in Site Settings are available for translation in JS.
    if (!Sefaria._siteSettings) { return; }
    ["SITE_NAME", "LIBRARY_NAME"].map(key => {
      Sefaria._i18nInterfaceStrings[Sefaria._siteSettings[key]["en"]] = Sefaria._siteSettings[key]["he"];
    });
  },
  _makeBooksDict: function() {
    // Transform books array into a dictionary for quick lookup
    // Which is worse: the cycles wasted in computing this on the client
    // or the bandwidth wasted in letting the server computer once and transmitting the same data twice in different form?
    this.booksDict = {};
    for (let i = 0; i < this.books.length; i++) {
      this.booksDict[this.books[i]] = 1;
    }
  },
  _ajaxObjects: {},   // These are jqXHR objects, which implement the Promise interface
  _api: function(url, callback) {
    // Manage API calls and callbacks to prevent duplicate calls
    // This method will be deprecated, in favor of _ApiPromise
    //
    if (url in this._ajaxObjects) {
      return this._ajaxObjects[url].then(callback);
    }
    return this._ApiPromise(url).then(callback);
  },
  _ApiPromise: function(url) {
    // Uses same _ajaxObjects as _api
    // Use built in Promise logic to handle multiple .then()s
    if (url in this._ajaxObjects) {
      return this._ajaxObjects[url];
    }
    this._ajaxObjects[url] = $.getJSON(url).always(_ => {delete this._ajaxObjects[url];});
    return this._ajaxObjects[url];
  },
  _cachedApi: function(key, store, defaultVal){
      return (key in store) ? store[key] : defaultVal;
  },
  _cachedApiPromise: function({url, key, store, processor}) {
      // Checks store[key].  Resolves to this value, if present.
      // Otherwise, calls Promise(url), caches in store[key], and returns
      return (key in store) ?
          Promise.resolve(store[key]) :
          Sefaria._ApiPromise(url)
              .then(data => {
                  if (processor) { data = processor(data); }
                  store[key] = data;
                  return data;
              })
  },
  //  https://reactjs.org/blog/2015/12/16/ismounted-antipattern.html
  makeCancelable: (promise) => {
      let hasCanceled_ = false;

      const wrappedPromise = new Promise((resolve, reject) => {
        promise.then(
          val => hasCanceled_ ? reject({isCanceled: true}) : resolve(val),
          error => hasCanceled_ ? reject({isCanceled: true}) : reject(error)
        );
      });

      return {
        promise: wrappedPromise,
        cancel() { hasCanceled_ = true; },
      };
  },
  incrementalPromise: async (fetchResponse, data, increment, setResponse, setCancel) => {
    /*
    fetchResponse - func that takes slice of `data` as param and returns promise
    data - array of input data for fetchResponse
    increment - int, how many values to send to fetchResponse at a time
    setResponse - callback to react to send updated results
    setCancel - function that saves cancel function so it can be called in outside scope
    */
    let lastEndIndex = 0;
    while (lastEndIndex <= data.length) {
      const tempData = data.slice(lastEndIndex, lastEndIndex + increment);
      const { promise, cancel } = Sefaria.makeCancelable(fetchResponse(tempData));
      setCancel(cancel);
      const tempResponses = await promise;
      setResponse(prevResponses => !prevResponses ? tempResponses : prevResponses.concat(tempResponses));
      lastEndIndex += increment;
    }
  }
});

Sefaria.unpackDataFromProps = function(props) {
  // Populate local cache with various data passed as props.
  const initialPanels = props.initialPanels || [];
  for (let i = 0; i < initialPanels.length; i++) {
      let panel = initialPanels[i];
      if (panel.text) {
        let settings = {context: 1, enVersion: panel.enVersion, heVersion: panel.heVersion};
        //save versions first, so their new format is also saved on text cache
        if(panel.text?.versions?.length){
            let versions = Sefaria._saveVersions(panel.text.sectionRef, panel.text.versions);
            panel.text.versions = Sefaria._makeVersions(versions, false);
        }

        Sefaria._saveText(panel.text, settings);
      }
      if(panel.bookRef){
         if(panel.versions?.length){
            let versions = Sefaria._saveVersions(panel.bookRef, panel.versions);
            panel.versions = Sefaria._makeVersions(versions, false);
         }
      }
      if (panel.indexDetails) {
        Sefaria._indexDetails[panel.bookRef] = panel.indexDetails;
      }
      if (panel.sheet) {
        Sefaria.sheets._loadSheetByID[panel.sheet.id] = panel.sheet;
      }
  }
  if (props.collectionData) {
    Sefaria._collections[props.initialCollectionSlug] = props.collectionData;
  }
  if (props.translationsData) {
    Sefaria._translations[props.initialTranslationsSlug] = props.translationsData;
  }
  if (props.topicData) {
    Sefaria._topics[props.initialTopic] = Sefaria.processTopicsData(props.topicData);
  }
  if (props.topicList) {
    Sefaria._topicList = props.topicList;
  }
  if (props.collectionListing) {
      Sefaria._collectionsList.list = props.collectionListing;
  }
  Sefaria.versionPreferences = new VersionPreferences(props.versionPrefsByCorpus);
  Sefaria.util._initialPath = props.initialPath ? props.initialPath : "/";
  Sefaria.unpackBaseProps(props);

  Sefaria.getBackgroundData();
};

Sefaria.unpackBaseProps = function(props){
    //TODO: verify these are all base props!!!
      if (typeof props === 'undefined') {
          return;
      }
      const dataPassedAsProps = [
      "_uid",
      "_email",
      "_uses_new_editor",
      "slug",
      "is_moderator",
      "is_editor",
      "is_sustainer",
      "full_name",
      "profile_pic_url",
      "is_history_enabled",
      "translation_language_preference_suggestion",
      "following",
      "blocking",
      "calendars",
      "notificationCount",
      "notifications",
      "saved",
      "userHistory",
      "last_place",
      "interfaceLang",
      "multiPanel",
      "community",
      "followRecommendations",
      "trendingTopics",
      "_siteSettings",
      "_debug"
  ];
  for (const element of dataPassedAsProps) {
      if (element in props) {
        Sefaria[element] = props[element];
      }
  }
}

Sefaria.loadServerData = function(data){
    // data parameter is optional. in the event it isn't passed, we assume that DJANGO_DATA_VARS exists as a global var
    // data should but defined server-side and undefined client-side
    //TODO: Can we get rid of this global scope thing?
    if (typeof data === "undefined") {
        data = typeof DJANGO_DATA_VARS === "undefined" ? undefined : DJANGO_DATA_VARS;
    }
    if (typeof data !== 'undefined') {
        for (const [key, value] of Object.entries(data)) {
            this[key] = value;
        }
    }
};


Sefaria.util    = Util;
Sefaria.hebrew  = Hebrew;
Sefaria.track   = Track;
Sefaria.palette = palette;

Sefaria.palette.indexColor = function(title) {
      return title && Sefaria.index(title) ?
          Sefaria.index(title)['primary_category'] ?
              Sefaria.palette.categoryColor(Sefaria.index(title)['primary_category']):
                Sefaria.palette.categoryColor(Sefaria.index(title).categories[0]):
          Sefaria.palette.categoryColor("Other");
};
Sefaria.palette.refColor = ref => Sefaria.palette.indexColor(Sefaria.parseRef(ref).index);

Sefaria = extend(Sefaria, Strings);

Sefaria.setup = function(data, props = null) {
    Sefaria.loadServerData(data);
    let baseProps = props !=null ? props : (typeof DJANGO_VARS === "undefined" ? undefined : DJANGO_VARS.props);
    Sefaria.unpackBaseProps(baseProps);
    Sefaria.util.setupPrototypes();
    Sefaria.util.setupMisc();
    var cookie = Sefaria.util.handleUserCookie(Sefaria._uid);
    // And store current uid in analytics id
    Sefaria._analytics_uid = Sefaria._uid;
    Sefaria._makeBooksDict();
    Sefaria._cacheFromToc(Sefaria.toc);
    Sefaria._cacheHebrewTerms(Sefaria.terms);
    Sefaria._cacheSiteInterfaceStrings();
    //console.log(`sending user logged in status to GA, uid as bool: ${!!Sefaria._uid} | analytics id: ${Sefaria._analytics_uid}`);
    Sefaria.track.setUserData(!!Sefaria._uid, Sefaria._analytics_uid);
    Sefaria.search = new Search(Sefaria.searchIndexText, Sefaria.searchIndexSheet);
};
Sefaria.setup();


export default Sefaria;

const   extend     = require('extend'),
        param      = require('querystring').stringify,
        Search     = require('./search'),
        palette    = require('./palette'),
        Track      = require('./track'),
        Hebrew     = require('./hebrew'),
        Util       = require('./util'),
        $          = require('./sefariaJquery');
                     require('babel-polyfill');


let Sefaria = Sefaria || {
  _dataLoaded: false,
  _inBrowser: (typeof document !== "undefined"),
  toc: [],
  books: [],
  booksDict: {},
  last_place: [],
  saved: [],
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
          if (book in Sefaria.virtualBooksDict) {
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
              nums = first.slice(i+1);
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

      if (nums && !nums.match(/\d+[ab]?( \d+)*/)) {
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
  refContains: function(ref1, ref2) {
    // Returns true is `ref1` contains `ref2`
    const oRef1 = Sefaria.parseRef(ref1);
    const oRef2 = Sefaria.parseRef(ref2);

    if ("error" in oRef1 || "error" in oRef2) { return null; }

    if (oRef2.index !== oRef2.index || oRef1.book !== oRef2.book) { return false; }

    for (let i = 0; i < oRef1.sections.length; i++) {
      if (oRef1.sections[i] <= oRef2.sections[i] && oRef1.toSections[i] >= oRef2.toSections[i]) {
        return true;
      } else if (oRef1.sections[i] > oRef2.sections[i] || oRef1.toSections[i] < oRef2.toSections[i]) {
        return false;
      }
    }
    return null;
  },
  sectionRef: function(ref) {
    // Returns the section level ref for `ref` or null if no data is available
    const oref = this.getRefFromCache(ref);
    return oref ? oref.sectionRef : null;
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
  titlesInText: function(text) {
    // Returns an array of the known book titles that appear in text.
    return Sefaria.books.filter(function(title) {
        return (text.indexOf(title) > -1);
    });
  },
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
      wrapLinks:  ("wrapLinks" in settings) ? settings.wrapLinks : 1
    };

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

    return this._promiseAPI(Sefaria.apiHost + this._textUrl(ref, settings))
        .then(d => { this._saveText(d, settings); return d; });
  },
  getBulkText: function(refs) {
    // todo: fish existing texts out of cache first
    return this._promiseAPI(Sefaria.apiHost + "/api/bulktext/" + refs.join("|"))
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
      this._saveText(data, settings);
      cb(data);
    }.bind(this));
    return null;
  },

  _versions: {},
  _translateVersions: {},
  versions: function(ref, cb) {
    // Returns a list of available text versions for `ref`.
    var versions = ref in this._versions ? this._versions[ref] : null;
    if (versions) {
      if (cb) {cb(versions)}
      return versions
    }
    var url = Sefaria.apiHost + "/api/texts/versions/" + Sefaria.normRef(ref);
    this._api(url, function(data) {
      for (let v of data) {
        Sefaria._translateVersions[v.versionTitle] = {
          en: v.versionTitle,
          he: !!v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle,
          lang: v.language,
        };
      }
      if (cb) { cb(data); }
      Sefaria._versions[ref] = data;
    });
    return versions;
  },
  versionLanguage: function(versionTitle) {
    // given a versionTitle, return the language of the version
    return Sefaria._translateVersions[versionTitle]["lang"]
  },
  _textUrl: function(ref, settings) {
    // copy the parts of settings that are used as parameters, but not other
    const params = param({
      commentary: settings.commentary,
      context:    settings.context,
      pad:        settings.pad,
      wrapLinks:  settings.wrapLinks,
      multiple:   settings.multiple
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
    var key          = this._textKey(data.ref, settings);
    this._texts[key] = data;
    //console.log("Saving", key);
    var refkey           = this._refKey(data.ref, settings);
    this._refmap[refkey] = key;

    var isSectionLevel = (data.sections.length !== data.sectionNames.length);
    if (isSectionLevel && !data.isSpanning) {
      // Save data in buckets for each segment
      this._splitTextSection(data, settings);
    }

    if (settings.context) {
      // Save a copy of the data at section level without context flag
      var newData         = Sefaria.util.clone(data);
      newData.ref         = data.sectionRef;
      newData.heRef       = data.heSectionRef;
      if (!isSectionLevel) {
        newData.sections    = data.sections.slice(0,-1);
        newData.toSections  = data.toSections.slice(0,-1);
      }
      const newSettings   = Sefaria.util.clone(settings);
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
  _splitTextSection: function(data, settings) {
    // Takes data for a section level text and populates cache with segment levels.
    // Don't do this for Refs above section level, like "Rashi on Genesis 1",
    // since it's impossible to correctly derive next & prev.

    // No splits needed for segments
    if (data.textDepth === data.sections.length) {
        return;
    }
    const isSuperSection = data.textDepth == data.sections.length + 2;

    settings = settings || {};
    let en = typeof data.text === "string" ? [data.text] : data.text;
    let he = typeof data.he === "string" ? [data.he] : data.he;
    // Pad the shorter array to make stepping through them easier.
    const length = Math.max(en.length, he.length);
    en = en.pad(length, "");
    he = he.pad(length, "");

    const delim = data.ref === data.book ? " " : ":";
    const start = data.textDepth === data.sections.length ? data.sections[data.textDepth-1] : 1;

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
        heRef: data.heRef + delim + Sefaria.hebrew.encodeHebrewNumeral(i+start),
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
  _translateTerms: {},
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
  _cacheIndexFromToc: function(toc) {
    // Unpacks contents of Sefaria.toc into index cache.
    for (var i = 0; i < toc.length; i++) {
      if ("category" in toc[i]) {
        Sefaria._translateTerms[toc[i].category] = {"en": toc[i].category, "he": toc[i].heCategory};
        if (toc[i].contents) {
            Sefaria._cacheIndexFromToc(toc[i].contents)
        }
      } else {
        Sefaria.index(toc[i].title, toc[i]);
      }
    }
  },
  _cacheHebrewTerms: function(terms) {
      Sefaria._translateTerms = extend(terms, Sefaria._translateTerms);
  },
  _indexDetails: {},
  /* hasIndexDetails: title => {title in this._indexDetails}, */
  getIndexDetails: function(title) {
    return new Promise((resolve, reject) => {
        var details = title in this._indexDetails ? this._indexDetails[title] : null;
        if (details) {
          resolve(details);
        } else {
            var url = Sefaria.apiHost + "/api/v2/index/" + title + "?with_content_counts=1";
            this._api(url, data => {
                Sefaria._indexDetails[title] = data;
                resolve(data);
            });
        }
    });
  },
  titleIsTorah: function(title){
      let torah_re = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)/;
      return torah_re.test(title)
  },
  _titleVariants: {},
    /*  Unused?
  normalizeTitle: function(title, callback) {
    if (title in this._titleVariants) {
        callback(this._titleVariants[title]);
    }
    else {
        this._api("/api/v2/index/" + title, function(data) {
          for (var i = 0; i < data.titleVariants.length; i++) {
            Sefaria._titleVariants[data.titleVariants[i]] = data.title;
          }
          callback(data.title);
        });
    }
  },
     */
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
  getRefFromCache: function(ref) {
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
  _lookups: {},
  _ref_lookups: {},

  // getName w/ refOnly true should work as a replacement for parseRef - it uses a callback rather than return value.  Besides that - same data.
  getName: function(name, refOnly) {
    const trimmed_name = name.trim();
    return this._cachedApiPromise({
        url:   this.apiHost + "/api/name/" + trimmed_name + (refOnly?"?ref_only=1":""),
        key:   trimmed_name,
        store: refOnly? this._ref_lookups: this._lookups
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
  _lexiconLookups: {},
  lexicon: function(words, ref, cb){
    // Returns a list of lexicon entries for the given words
    ref = typeof ref !== "undefined" ? ref : null;
    words = typeof words !== "undefined" ? words : "";
    const cache_key = ref ? words + "|" + ref : words;
    /*if (typeof ref != 'undefined'){
      cache_key += "|" + ref
    }*/
    if (!cb) {
      return this._lexiconLookups[cache_key] || [];
    }
    if (cache_key in this._lexiconLookups) {
        /*console.log("data from cache: ", this._lexiconLookups[cache_key]);*/
        cb(this._lexiconLookups[cache_key]);
    } else if (words.length > 0) {
      var url = Sefaria.apiHost + "/api/words/" + encodeURIComponent(words)+"?never_split=1";
      if(ref){
        url+="&lookup_ref="+ref;
      }
      //console.log(url);
      this._api(url, function(data) {
        this._lexiconLookups[cache_key] = ("error" in data) ? [] : data;
        //console.log("state changed from ajax: ", data);
        cb(this._lexiconLookups[cache_key]);
      }.bind(this));
    } else {
        return cb([]);
    }
  },
  _links: {},
  /*
  hasLinks: function(ref) {
      return ref in this._links;
  },
  */
  getLinks: function(ref) {
    // When there is an error in the returned data, this calls `reject` rather than returning empty.
    return new Promise((resolve, reject) => {
        ref = Sefaria.humanRef(ref);
        if (ref in this._links) {
            resolve(this._links[ref]);
        } else {
            let url = Sefaria.apiHost + "/api/links/" + ref + "?with_text=0";
            let p = this._promiseAPI(url)
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
  /*
  links: function(ref, cb) {
    // Returns a list of links known for `ref`.
    // WARNING: calling this function with spanning refs can cause bad state in cache.
    // When processing links for "Genesis 2:4-4:4", a link to the entire chapter "Genesis 3" will be split and stored with that key.
    // The data for "Genesis 3" then represents only links to the entire chapter, not all links within the chapter.
    // Fixing this generally on the client side requires more understanding of ref logic.
    console.log("Method Sefaria.links() is deprecated in favor of Sefaria.getLinks()");
    ref = Sefaria.humanRef(ref);
    if (!cb) {
      return this._links[ref] || [];
    }
    if (ref in this._links) {
      cb(this._links[ref]);
    } else {
       const url = Sefaria.apiHost + "/api/links/" + ref + "?with_text=0&with_sheet_links=1";
       this._api(url, function(data) {
          if ("error" in data) {
            return;
          }
          this._saveLinkData(ref, data);
          cb(data);
        }.bind(this));
    }
  }, */
  _saveLinkData: function(ref, data) {
    ref = Sefaria.humanRef(ref);
    const l = this._saveLinksByRef(data);
    this._links[ref] = data;
    this._cacheIndexFromLinks(data);
    return l;
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
    // Filters array `links` for only those thart match array `filter`.
    // If `filter` ends with "|Quoting" return Quoting Commentary only,
    // otherwise commentary `filters` will return only links with type `commentary`
    if (filter.length == 0) { return links; }

    var filterAndSuffix = filter[0].split("|");
    filter              = [filterAndSuffix[0]];
    var isQuoting       = filterAndSuffix.length == 2 && filterAndSuffix[1] == "Quoting";
    var index           = Sefaria.index(filter);
    var isCommentary    = index && !isQuoting &&
                            (index.categories[0] == "Commentary" || index.primary_category == "Commentary");

    return links.filter(function(link){
      if (isCommentary && link.category !== "Commentary") { return false; }
      if (isQuoting && link.category !== "Quoting Commentary") { return false; }

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
  _linkSummaries: {},
  linkSummary: function(ref, excludedSheet) {
    // Returns an ordered array summarizing the link counts by category and text
    // Takes either a single string `ref` or an array of refs strings.
    // If `excludedSheet` is present, exclude links to that sheet ID.

    let links;
    if (!this.linksLoaded(ref)) { return null; }
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

      } else {
        category.books[link["collectiveTitle"]["en"]] = {count: 1, hasEnglish: link.sourceHasEn};
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
        bookData.book     = index.title;
        bookData.heBook   = index.heTitle;
        bookData.category = category;
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
    categoryOrder.splice(2, 0, "Targum");     // Show Targum after Tanakh
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
    const topByCategory = {
      "Tanakh": ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
      "Talmud": ["Rashi", "Tosafot"]
    };
    const top = topByCategory[category] || [];
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
  /*
  flatLinkSummary: function(ref) {
    // Returns an array containing texts and categories with counts for ref
    var summary = Sefaria.linkSummary(ref);
    var booksByCat = summary.map(function(cat) {
      return cat.books.map(function(book) {
        return book;
      });
    });
    var books = [];
    books = books.concat.apply(books, booksByCat);
    return books;
  },
  */
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
    if (this._allPrivateNote || !callback) { return this._allPrivateNotes; }

    var url = Sefaria.apiHost + "/api/notes/all?private=1";
    this._api(url, (data) => {
      if ("error" in data) {
        return;
      }
      this._savePrivateNoteData(null, data);
      this._allPrivateNotes = data;
      callback(data);
    });
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
  _webpages: {},
  webPagesByRef: function(refs) {
    refs = typeof refs == "string" ? Sefaria.splitRangingRef(refs) : refs.slice();
    var ref = Sefaria.normRefList(refs);
    refs.map(r => {
      // Also include webpages linked at section level. Deduped below. 
      if (r.indexOf(":") !== -1) {
        refs.push(r.slice(0, r.lastIndexOf(":"))); 
      }
    }, this);

    var webpages = [];
    refs.map(r => {
      if (this._webpages[r]) { webpages = webpages.concat(this._webpages[r]); }
    }, this);

    webpages.map(page => page.isHebrew = Sefaria.hebrew.isHebrew(page.title));

    return webpages.filter((obj, pos, arr) => {
      // Remove duplicates by url field
      return arr.map(mapObj => mapObj["url"]).indexOf(obj["url"]) === pos;
    }).sort((a, b) => {
      // Sort first by page language matching interface language
      if (a.isHebrew !== b.isHebrew) { return (b.isHebrew ? -1 : 1) * (Sefaria.interfaceLang === "hebrew" ? -1 : 1); }

      // 3: exact match, 2: range match: 1: section match
      var aSpecificity, bSpecificity;
      [aSpecificity, bSpecificity] = [a, b].map(page => page.anchorRef === ref ? 3 : (page.anchorRef.indexOf("-") !== -1 ? 2 : 1));
      if (aSpecificity !== bSpecificity) {return aSpecificity > bSpecificity ? -1 : 1};

      return (a.linkerHits > b.linkerHits) ? -1 : 1
    });
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
      };

       // Build split related data from individual split data arrays
      ["links", "notes", "sheets", "webpages"].forEach(obj_type => {
        for (var ref in split_data[obj_type]) {
          if (split_data[obj_type].hasOwnProperty(ref)) {
            if (!(ref in this._related)) {
                this._related[ref] = {links: [], notes: [], sheets: [], webpages: []};
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
    // Used when isACaseVariant() is true to prepare the alternative
    return data["completions"][0] + query.slice(data["completions"][0].length);
  },
  makeSegments: function(data, withContext) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if (!data || "error" in data) { return []; }
    var segments  = [];
    var highlight = data.sections.length === data.textDepth;
    var wrap = (typeof data.text == "string");
    var en = wrap ? [data.text] : data.text;
    var he = wrap ? [data.he] : data.he;
    var topLength = Math.max(en.length, he.length);
    en = en.pad(topLength, "");
    he = he.pad(topLength, "");

    var start = (data.textDepth == data.sections.length && !withContext ?
                  data.sections.slice(-1)[0] : 1);

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

        start = (n == 0 ? start : 1);
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
  tocItemsByCategories: function(cats) {
    // Returns the TOC items that correspond to the list of categories 'cats'
    var list = Sefaria.util.clone(Sefaria.toc);
    for (var i = 0; i < cats.length; i++) {
      var found = false;
      for (var k = 0; k < list.length; k++) {
        if (list[k].category == cats[i]) {
          list = Sefaria.util.clone(list[k].contents);
          found = true;
          break;
        }
      }
      if (!found) { return []; }
    }
    return list || [];
  },
  categoryAttribution: function(categories) {
    var attributions = [
      {
        categories: ["Talmud", "Bavli"],
        english: "The William Davidson Talmud",
        hebrew: "תלמוד מהדורת ויליאם דוידסון",
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
    return new Promise((resolve, reject) => {
        let url = Sefaria.apiHost + "/api/passages/" + refs.join("|");
        let p = this._promiseAPI(url);
        resolve(p);
    });
  },
  areVersionsEqual(v1, v2) {
    // v1, v2 are `currVersions` objects stored like {en: ven, he: vhe}
    return v1.en == v2.en && v1.he == v2.he;
  },
  getSavedItem: ({ ref, versions }) => {
    return Sefaria.saved.find(s => s.ref === ref && Sefaria.areVersionsEqual(s.versions, versions));
  },
  removeSavedItem: ({ ref, versions }) => {
    Sefaria.saved = Sefaria.saved.filter(x => !(x.ref === ref && Sefaria.areVersionsEqual(versions, x.versions)));
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
              Sefaria.saved = response.created.concat(Sefaria.saved);
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
  toggleFollowAPI: (uid, isUnfollow) => {
    return new Promise((resolve, reject) => {
      $.post({
        url: `/api/${isUnfollow ? 'un' : ''}follow/${uid}`
      });
    });
    return Sefaria._promiseAPI(`/api/${isUnfollow ? 'un' : ''}follow/${uid}`);
  },
  followAPI: (slug, ftype) => {
    return Sefaria._promiseAPI(Sefaria.apiHost + `/api/profile/${slug}/${ftype}`);
  },
  messageAPI: (uid, message) => {
    const data = {json: JSON.stringify({recipient: uid, message: message.escapeHtml()})};
    return new Promise((resolve, reject) => {
      $.post(`${Sefaria.apiHost}/api/messages`, data, resolve);
    });
  },
  getRefSavedHistory: tref => {
    return Sefaria._promiseAPI(Sefaria.apiHost + `/api/user_history/saved?tref=${tref}`);
  },
  profileAPI: slug => {
    return Sefaria._promiseAPI(`${Sefaria.apiHost}/api/profile/${slug}`);
  },
  userHistoryAPI: () => {
    return Sefaria._promiseAPI(Sefaria.apiHost + "/api/profile/user_history?secondary=0");
  },
  saveUserHistory: function(history_item) {
    // history_item contains:
    // - ref, book, versions. optionally: secondary, he_ref, language
    const history_item_array = Array.isArray(history_item) ? history_item : [history_item];
    for (let h of history_item_array) {
      h.time_stamp = Sefaria.util.epoch_time();
    }
    if (Sefaria._uid) {
        $.post(Sefaria.apiHost + "/api/profile/sync?no_return=1",
              {user_history: JSON.stringify(history_item_array)},
              data => { /*console.log("sync resp", data)*/ } );
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
    // Returns data for `topic`.
    if (this._topicList) {
      if (callback) { callback(this._topicList); }
    } else if (callback) {
      var url = Sefaria.apiHost + "/api/topics"; // TODO separate topic list API
       Sefaria._api(url, function(data) {
          this._topicList = data;
           if (callback) { callback(data); }
        }.bind(this));
      }
    return this._topicList;
  },
  _tableOfContentsDedications: {},
  _topics: {},
  topic: function(topic, callback) {
    if (topic in this._topics) {
      var data = this._topics[topic];
      if (callback) { callback(data); }
    } else if (callback) {
      var data = null;
      var url = Sefaria.apiHost + "/api/topics/" + topic;
      Sefaria._api(url, function(data) {
        this._topics[topic] = data;
        if (callback) { callback(data); }
      }.bind(this));
    }
    return data;
  },
  getTopic: function(topic) {
      return this._cachedApiPromise({
          url:   this.apiHost + "/api/topics/" + topic,
          key:   topic,
          store: this._topics
    });
  },
  _topicTocPages: {},
  _initTopicTocPages: function() {
    this._topicTocPages = this.topic_toc.reduce((a,c) => {a[this._topicTocPageKey(c.name)] = c.children; return a;}, {});
    this._topicTocPages[this._topicTocPageKey()] = this.topic_toc.map(({children, ...goodstuff}) => goodstuff);
  },
  _topicTocPageKey: name => "_" + name,
  topicTocPage: function(parent) {
    const key = this._topicTocPageKey(parent);
    if (!this._topicTocPages[key]) {
        this._initTopicTocPages()
    }
    return this._topicTocPages[key]

  },
  sheets: {
    _loadSheetByID: {},
    loadSheetByID: function(id, callback) {
      var sheet = this._loadSheetByID[id];
      if (sheet) {
        if (callback) { callback(sheet); }
      } else {
        var url = "/api/sheets/" + id +"?more_data=1";
         $.getJSON(url, data => {
            if ("error" in data) {
                console.log(data["error"])
            }
            this._loadSheetByID[id] = data;
            if (callback) { callback(data); }
          });
        }
      return sheet;
    },
    deleteSheetById: function(id) {
      const url = `/api/sheets/${id}/delete`;
      return Sefaria._promiseAPI(url);
    },
    _trendingTags: null,
    trendingTags: function(callback) {
      // Returns a list of trending tags -- source sheet tags which have been used often recently.
      var tags = this._trendingTags;
      if (tags) {
        if (callback) { callback(tags); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/trending-tags";
         Sefaria._api(url, function(data) {
            this._trendingTags = data;
            if (callback) { callback(data); }
          }.bind(this));
        }
      return tags;
    },
    _tagList: {},
    tagList: function(sortBy, callback) {
      // Returns a list of all public source sheet tags, ordered by popularity
      sortBy = typeof sortBy == "undefined" ? "count" : sortBy;
      var tags = this._tagList[sortBy];
      if (tags) {
        if (callback) { callback(tags); }
      } else if ("count" in this._tagList && (sortBy == "alpha")) {
        // If we have one set of ordered tags already, we can do sorts locally.
        var tags = this._tagList["count"].slice();
        tags.sort(function(a, b) {
          return a.tag > b.tag ? 1 : -1;
        });
        this._tagList["alpha"] = tags;
      } else {
        var url = Sefaria.apiHost + "/api/sheets/tag-list/" + sortBy;
         Sefaria._api(url, function(data) {
            this._tagList[sortBy] = data;
            if (callback) { callback(data); }
          }.bind(this));
        }
      return tags;
    },
    _userTagList: null,
    userTagList: function(uid, callback) {
      // Returns a list of all public source sheet tags, ordered by populartiy
      var tags = this._userTagList;
      if (tags) {
        if (callback) { callback(tags); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/tag-list/user/"+uid;
         Sefaria._api(url, function(data) {
            this._userTagList = data;
             if (callback) { callback(data); }
          }.bind(this));
        }
      return tags;
    },
    _sheetsByTag: {},
    sheetsByTag: function(tag, callback) {
      // Returns a list of public sheets matching a given tag.
      var sheets = this._sheetsByTag[tag];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/tag/" + tag.replace("#","%23");
         $.getJSON(url, function(data) {
            this._sheetsByTag[tag] = data.sheets;
            if (callback) { callback(data.sheets); }
          }.bind(this));
        }
      return sheets;
    },
    getSheetsByTag: function(tag, v2) {
      const url =  Sefaria.apiHost + "/api" + (v2 ? "/v2" : "") + "/sheets/tag/" + tag.replace("#", "%23");
      return Sefaria._cachedApiPromise({
          url:  url,
          store: this._sheetsByTag,
          key:   tag,
        });
    },
    _userSheets: {},
    userSheets: function(uid, callback, sortBy, offset, numberToRetrieve, ignoreCache) {
      // Returns a list of source sheets belonging to `uid`
      // Only a user logged in as `uid` will get private data from this API.
      // Otherwise, only public data will be returned
      if (!offset) offset = 0;
      if (!numberToRetrieve) numberToRetrieve = 0;
      sortBy = typeof sortBy == "undefined" ? "date" : sortBy;
      const sheets = ignoreCache ? null : this._userSheets[uid+sortBy+offset+numberToRetrieve];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        const url = Sefaria.apiHost + "/api/sheets/user/" + uid + "/" + sortBy + "/" + numberToRetrieve + "/" + offset;
        Sefaria._promiseAPI(url).then(data => {
          this._userSheets[uid+sortBy+offset+numberToRetrieve] = data.sheets;
          if (callback) { callback(data.sheets); }
        });
      }
      return sheets;
    },
    _publicSheets: {},
    publicSheets: function(offset, numberToRetrieve, callback) {
      if (!offset) offset = 0;
      if (!numberToRetrieve) numberToRetrieve = 50;
      // Returns a list of public sheets
      var sheets = this._publicSheets["offset"+offset+"num"+numberToRetrieve];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/all-sheets/"+numberToRetrieve+"/"+offset;
        Sefaria._api(url, function(data) {
          this._publicSheets["offset"+offset+"num"+numberToRetrieve] = data.sheets;
          if (callback) { callback(data.sheets); }
        }.bind(this));
      }
      return sheets;
    },
    _topSheets: null,
    topSheets: function(callback) {
      // Returns a list of top sheets (recent sheets with some quality heuristic)
      // TODO implements an API for this, currently just grabbing most recent 4
      var sheets = this._topSheets;
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/all-sheets/3/0";
        Sefaria._api(url, function(data) {
          this._topSheets = data.sheets;
          if (callback) { callback(data.sheets); }
        }.bind(this));
      }
      return sheets;
    },
    clearUserSheets: function(uid) {
      this._userSheets[uid+"date"] = null;
      this._userSheets[uid+"views"] = null;
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
        return typeof ref === "string" ? parseInt(ref.split(" ")[1]) : parseInt(ref[0].split(" ")[1])
    }
  },
  _groups: {},
  groups: function(group, sortBy, callback) {
    // Returns data for an individual group
    var groupObj = this._groups[group];
    if (groupObj) {
      if (callback) { callback(groupObj); }
    } else if (callback) {
      var url = Sefaria.apiHost + "/api/groups/" + group;
       Sefaria._api(url, function(data) {
           this._groups[group] = data;
           callback(data);
        }.bind(this));
      }
    return groupObj;
  },
  _groupsList: null,
  groupsList: function(callback) {
    // Returns list of public and private groups
    if (this._groupsList) {
      if (callback) { callback(this._groupsList); }
    } else if (callback) {
      var url = Sefaria.apiHost + "/api/groups";
       Sefaria._api(url, function(data) {
          this._groupsList = data;
           if (callback) { callback(data); }
        }.bind(this));
      }
    return this._groupsList;
  },
  userGroups: function(uid) {
    const url = `${Sefaria.apiHost}/api/groups/user-groups/${uid}`;
    return Sefaria._promiseAPI(url);
  },
  calendarRef: function(calendarTitle) {
    const cal = Sefaria.calendars.filter(cal => cal.title.en === calendarTitle);
    return cal.length ? cal[0].ref : null;
  },
  hebrewTerm: function(name) {
    // Returns a string translating `name` into Hebrew.
    var categories = {
      "Quoting Commentary":   "פרשנות מצטטת",
      "Modern Commentary":    "פרשנות מודרנית",
      "Sheets":               "דפי מקורות",
      "Notes":                "הערות",
      "Community":            "קהילה"
    };
    if (name in Sefaria._translateTerms) {
        return Sefaria._translateTerms[name]["he"];
    } else if (name in Sefaria._translateVersions) {
        return Sefaria._translateVersions[name]["he"];
    } else if (name in categories) {
        return  categories[name];
    } else if (Sefaria.index(name)) {
        return Sefaria.index(name).heTitle;
    } else {
        return name;
    }
  },
    //this is here for now, we might want to move it somewhere else.
  _i18nInterfaceStrings: {
      "Sefaria": "ספריא",
      "Sefaria Group" : "קבוצות בספריא",
      "Sefaria Groups" : "קבוצות בספריא",
      "Sefaria Source Sheets":"דפי מקורות בספריא",
      "Topics":"נושאים",
      "Sefaria Notifcations": "הודעות בספריא",
      //title meta tag
      "Sefaria: a Living Library of Jewish Texts Online": "ספריא: ספרייה חיה של טקסטים יהודיים",
      "Recently Viewed" : "נצפו לאחרונה",
      "The Sefaria Library": "תוכן העניינים של ספריא",
      "Sefaria Search": "חיפוש בספריא",
      "Sefaria Account": "חשבון בספריא",
      "New Additions to the Sefaria Library":"חידושים בארון הספרים של ספריא",
      "My Notes on Sefaria": "ההערות שלי בספריא",
      "Moderator Tools": "כלי מנהלים",
      " with " : " עם ",
      "Connections" : "קשרים",
      " & ": " | ",
      "My Source Sheets" : "דפי המקורות שלי",
      "Public Source Sheets":"דפי מקורות פומביים",
      "Public Groups": "קבוצות",
      "History": "היסטוריה",
      "Digitized by Sefaria": 'הונגש ועובד לצורה דיגיטלית על ידי ספריא',
      "Public Domain": "רשיון בנחלת הכלל",
      "CC-BY": "רשיון CC-BY",
      "CC-BY-NC": "רשיון CC-BY-NC",
      "CC-BY-SA": "רשיון CC-BY-SA",
      "CC-BY-NC-SA": "רשיון CC-BY-NC-SA",
      "CC0": "רשיון CC0",
      "Copyright: JPS, 1985": "זכויות שמורות ל-JPS, 1985",

      //sheets
      "Source Sheets": "דפי מקורות",
      "Start a New Source Sheet": "התחלת דף מקורות חדש",
      "Untitled Source Sheet" : "דף מקורות ללא שם",
      "New Source Sheet" : "דף מקורות חדש",
      "Name New Sheet" : "כותרת לדף המקורות",
      "Copy" : "העתקה",
      "Copied" : "הועתק",
      "Copying..." : "מעתיק...",
      "Sorry, there was a problem saving your note.": "סליחה, ארעה שגיאה בזמן השמירה",
      "Unfortunately, there was an error saving this note. Please try again or try reloading this page.": "ארעה שגיאה בזמן השמירה. אנא נסו שוב או טענו את הדף מחדש",
      "Are you sure you want to delete this note?": "האם אתם בטוחים שברצונכם למחוק?",
      "Something went wrong (that's all I know).":"משהו השתבש. סליחה",
      "Write a note...":"כתבו הערות כאן...",
      "Aa": "א",
      "Decrease font size": "הקטן גופן",
      "Increase font size": "הגדל גופן",
      "this comment":"הערה זו",
      "this source":"מקור זה",
      "was added to": "נוסף ל-",
      "View sheet": "מעבר ל-דף המקורות",
      "Please select a source sheet.": "אנא בחרו דף מקורות.",
      "New Source Sheet Name:" : "כותרת דף מקורות חדש:",
      "Source Sheet by" : "דף מקורות מאת",
      "Pinned Sheet - click to unpin": "דף מקורות נעוץ - לחצו להסרה",
      "Pinned Sheet" : "דף מקורות נעוץ",
      "Pin Sheet" : "נעיצת דף מקורות",

      //stuff moved from sheets.js
      "Loading..." : "טוען...",
        "Saving..." : "שומר...",
        "Your Source Sheet has unsaved changes. Before leaving the page, click Save to keep your work.":
        "קיימים שינויים בלתי שמורים בדף המקורות. השתמשו בכפתור השמירה לפני עזיבת הדף.",
        "Your Source Sheet has unsaved changes. Please wait for the autosave to finish.":
        "קיימים שינויים בלתי שמורים בדף המקורות. אנא חכו שפעולת השמירה האוטומטית תסתיים.",
        "Are you sure you want to delete this sheet? There is no way to undo this action.":
        "מחיקת דף מקורות היא פעולה בלתי הפיכה. האם אתם בטוחים?",
        "Unfortunately an error has occurred. If you've recently edited text on this page, you may want to copy your recent work out of this page and click reload to ensure your work is properly saved.":
        "לצערנו ארעה שגיאה. אם ערכתם לאחרונה את הדף הנוכחי, ייתכן ותרצו להעתיק את השינויים למקור חיצוני ואז לטעון מחדש את הדף כדי לוודא שהשינויים נשמרו.",
        //"Untitled Source Sheet": "דף מקורות ללא שם",
        "Like": "אהבתי",
        "Unlike": "ביטול סימון אהבתי",
        "No one has liked this sheet yet. Will you be the first?":
        "אף אחד עדיין לא אהב את דף המקורות הזה. תרצו להיות ראשונים?",
        "1 Person Likes This Sheet": "אדם אחד אהב את דף המקורות",
        " People Like This Sheet": " אנשים אהבו את דף המקורות",
        "Tags Saved": "תוית נשמרה",
        "Assignments allow you to create a template that your students can fill out on their own.":
        "מטלות מאפשרות ליצור דף בסיס שתלמידים יכולים להשתמש בו כדי למלא וליצור את העבודה שלהם.",
        "Students can complete their assignment at this link:":
        "תלמידים יכולים לבצע את המטלה שלהם בקישור הבא:",
        "Reset text of Hebrew, English or both?": "האם לאפס את התוכן של המקור בעברית, אנגלית או הכל?",
        "Any edits you have made to this source will be lost": "כל השינויים שנעשו במקור זה יאבדו",
        "Looking up Connections..." : "מחפש קישורים...",
        "No connections known for this source.": "למקור הזה אין קשרים ידועים",
        "Edit Source title" : "עריכת כותרת",
        "Add Source Below" : "הוספת מקור מתחת",
        "Add Comment": "הוספת תגובה",
        "Add All Connections": "הוספת כל המקורות הקשורים",
        "Reset Source Text": "איפוס טקסט מקור",
        "Copy to Sheet" : "העתקה לדף מקורות",
        "Change Source Layout/Language": "שינוי שפת/עימוד מקור",
        "Move Source Up": "הזזת מקור מעלה",
        "Move Source Down": "הזזת מקור מטה",
        "Outdent Source": "הזחת מקור החוצה",
        "Indent Source": "הזחת מקור פנימה",
        "Remove": "הסרת מקור",
        "Create New" : "יצירת חדש",
        "Close" : "סגירה",

      //reader panel
      "Search" : "חיפוש",
      "Search Dictionary": "חפש במילון",
      "Search for:": "חיפוש:",
      "Views": "צפיות",
      "Search for Texts or Keywords Here": "חיפוש טקסט או מילות מפתח",
      "Versions": "גרסאות",
      "Version Open": "גרסה פתוחה",
      "About": "אודות",
      "Current": "נוכחית",
      "Web Pages": "דפי אינטרנט",
      "Select": "החלפת גרסה",
      "Members": "חברים",
      "Send": "שלח",
      "Cancel": "בטל",
      "Send a message to ": "שלח הודעה ל-",
      "Groups": "קבוצות",
      "Following": "נעקבים",
      "Followers": "עוקבים",
      "following": "נעקבים",
      "followers": "עוקבים",
      "Recent": "תאריך",
      "Unlisted": "חסוי",

      //languages
      "English": "אנגלית",
      "Hebrew": "עברית",
      "Yiddish": "יידיש",
      "Finnish": "פינית",
      "Portuguese": "פורטוגזית",
      "Spanish": "ספרדית",
      "French": "צרפתית",
      "German": "גרמנית",
      "Arabic": "ערבית",
      "Italian": "איטלקית",
      "Polish": "פולנית",
      "Russian": "רוסית",

      "On": "הצג",
      "Off": "הסתר",
      "Show Parasha Aliyot": "עליות לתורה מוצגות",
      "Hide Parasha Aliyot": "עליות לתורה מוסתרות",
      "Language": "שפה",
      "Layout": "עימוד",
      "Bilingual Layout" : "עימוד דו לשוני",
      "Color": "צבע",
      "Font Size" : "גודל גופן",
      "Aliyot" : "עליות לתורה",
      "Taamim and Nikkud" : "טעמים וניקוד",
      "Show Vowels and Cantillation": "הצג טקסט עם טעמי מקרא וניקוד",
      "Vocalization": "טעמים וניקוד",
      "Vowels": "ניקוד",
      "Show only vowel points": "הצג טקסט עם ניקוד",
      "Show only consonantal text": "הצג טקסט עיצורי בלבד",
      "Email Address" : "כתובת אימייל",
      "Describe the issue..." : "טקסט המשוב",
      "Report an issue with the text" : "דיווח על בעיה בטקסט",
      "Request translation" : "בקשה לתרגום",
      "Report a bug" : "דיווח על תקלה באתר",
      "Get help" : "עזרה",
      "Request a feature": "בקשה להוספת אפשרות באתר",
      "Give thanks": "תודה",
      "Other": "אחר",
      "Please enter a valid email address": "אנא הקלידו כתובת אימייל תקנית",
      "Please select a feedback type": "אנא בחרו סוג משוב",
      "Unfortunately, there was an error sending this feedback. Please try again or try reloading this page.": "לצערנו ארעה שגיאה בשליחת המשוב. אנא נסו שוב או רעננו את הדף הנוכחי",
      "Tell us what you think..." : "ספרו לנו מה אתם חושבים...",
      "Select Type" : "סוג משוב",
      "Added by" : "נוסף בידי",
      "Love Learning?": "אוהבים ללמוד?",
      "Sign up to get more from Sefaria" : "הרשמו כדי לקבל יותר מספריא",
      "Make source sheets": "הכינו דפי מקורות",
      "Take notes": "שמרו הערות",
      "Save texts": "שמרו טקסטים לקריאה חוזרת",
      "Follow your favorite authors": "עקבו אחר הסופרים האהובים עליכם",
      "Stay in the know": "השארו מעודכנים",
      "Sign Up": "הרשמו לספריא",
      "Already have an account?": "כבר יש לכם חשבון?",
      "Sign\u00A0in": "התחברו",
      "Save": "שמירת",
      "Remove": "הסרת",

      //user stats
      "Torah Tracker" : "לימוד במספרים",
      "Year to Date": "בשנה הנוכחית",
      "All Time": "כל הזמן",
      "Texts Read" : "ספרים שנקראו",
      "Sheets Read" : "דפי מקורות שנקראו",
      "Sheets Created" : "דפי מקורות שנוצרו",
      "Average Sefaria User" : "משתמש ממוצע בספריא",
      "Etc": "שאר"

  },
  _v: function(inputVar){
    if(Sefaria.interfaceLang != "english"){
        return Sefaria.hebrewTerm(inputVar);
    }else{
        return inputVar;
	}
  },
  _r: function (inputRef) {
    const oref = Sefaria.getRefFromCache(inputRef);
    if (!oref) { return inputRef; }
    return Sefaria.interfaceLang != "english" ? oref.heRef : oref.ref;
  },
  _va: function(inputVarArr){
    if(Sefaria.interfaceLang != "english"){
        return inputVarArr.map(Sefaria.hebrewTerm);
    }else{
        return inputVarArr;
	}
  },
  _: function(inputStr){
    if(Sefaria.interfaceLang != "english"){
        var hterm;
        if(inputStr in Sefaria._i18nInterfaceStrings) {
            return Sefaria._i18nInterfaceStrings[inputStr];
        }else if(inputStr.toLowerCase() in Sefaria._i18nInterfaceStrings){
            return Sefaria._i18nInterfaceStrings[inputStr.toLowerCase()];
        }else if((hterm = Sefaria.hebrewTerm(inputStr)) != inputStr){
            return hterm;
        }else{
            if(inputStr.indexOf(" | ") !== -1) {
                 var inputStrs = inputStr.split(" | ");
                 return Sefaria._(inputStrs[0])+ " | " + Sefaria._(inputStrs[1]);
            }else{
                return inputStr;
            }
        }
    }else{
        return inputStr;
	  }
  },
  _cacheSiteInterfaceStrings: function() {
    // Ensure that names set in Site Settings are available for translation in JS.
    if (!Sefaria._siteSettings) { return; }
    ["SITE_NAME", "LIBRARY_NAME"].map(key => {
      Sefaria._i18nInterfaceStrings[Sefaria._siteSettings[key]["en"]] = Sefaria._siteSettings[key]["en"];
    });
  },
  _makeBooksDict: function() {
    // Transform books array into a dictionary for quick lookup
    // Which is worse: the cycles wasted in computing this on the client
    // or the bandwidth wasted in letting the server computer once and transmitting the same data twice in different form?
    this.booksDict = {};
    for (var i = 0; i < this.books.length; i++) {
      this.booksDict[this.books[i]] = 1;
    }
  },
  _ajaxObjects: {},   // These are jqXHR objects, which implement the Promise interface
  _api: function(url, callback) {
    // Manage API calls and callbacks to prevent duplicate calls
    // This method will be deprecated, in favor of _promiseAPI
    //
    if (url in this._ajaxObjects) {
      return this._ajaxObjects[url].then(callback);
    }
    return this._promiseAPI(url).then(callback);
  },
  _promiseAPI: function(url) {
    // Uses same _ajaxObjects as _api
    // Use built in Promise logic to handle multiple .then()s
    if (url in this._ajaxObjects) {
      return this._ajaxObjects[url];
    }
    this._ajaxObjects[url] = $.getJSON(url).always(_ => {delete this._ajaxObjects[url];});
    return this._ajaxObjects[url];
  },
  _cachedApiPromise: function({url, key, store}) {
      // Checks store[key].  Resolves to this value, if present.
      // Otherwise, calls Promise(url), caches, and returns
      return (key in store) ?
          Promise.resolve(store[key]) :
          Sefaria._promiseAPI(url)
              .then(data => {
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
  }
});

Sefaria.unpackDataFromProps = function(props) {
  // Populate local cache with various data passed as a rider on props.
  var initialPanels = props.initialPanels || [];
  for (var i = 0; i < initialPanels.length; i++) {
      var panel = initialPanels[i];
      if (panel.text) {
        var settings = {context: 1, enVersion: panel.enVersion, heVersion: panel.heVersion};
        Sefaria._saveText(panel.text, settings);
      }
      if (panel.indexDetails) {
        Sefaria._indexDetails[panel.bookRef] = panel.indexDetails;
      }
      // versions and bookRef are located in different places, depending on if you're in book TOC or reader
      const panelVersions = !!panel.versions ? panel.versions : !!panel.text ? panel.text.versions : null;
      const panelBook     = !!panel.versions ? panel.versions : !!panel.text ? panel.text.versions : null;
      if (panelVersions && panelBook) {
        Sefaria._versions[panelBook] = panelVersions;
        for (let i = 0; i < panelVersions.length; i++) {
          const v = panelVersions[i];
          Sefaria._translateVersions[v.versionTitle] = {
            en: v.versionTitle,
            he: !!v.versionTitleInHebrew ? v.versionTitleInHebrew : v.versionTitle,
            lang: v.language,
          };
        }
      }
  }
  if (props.userSheets) {
    Sefaria.sheets._userSheets[Sefaria._uid + "date"] = props.userSheets;
  }
  if (props.userTags) {
    Sefaria.sheets._userTagList = props.userTags;
  }
  if (props.publicSheets) {
    Sefaria.sheets._publicSheets = props.publicSheets;
  }
  if (props.tagSheets) {
    Sefaria.sheets._sheetsByTag[props.initialSheetsTag] = props.tagSheets;
  }
  if (props.tagList) {
    Sefaria.sheets._tagList["count"] = props.tagList;
  }
  if (props.trendingTags) {
    Sefaria.sheets._trendingTags = props.trendingTags;
  }
  if (props.topSheets) {
    Sefaria.sheets._topSheets = props.topSheets;
  }
  if (props.groupData) {
    Sefaria._groups[props.initialGroup] = props.groupData;
  }
  if (props.topicData) {
    Sefaria._topics[props.initialTopic] = props.topicData;
  }
  if (props.topicList) {
    Sefaria._topicList = props.topicList;
  }
  Sefaria.util._initialPath = props.initialPath ? props.initialPath : "/";
  Sefaria.interfaceLang = props.interfaceLang;
};


Sefaria.util    = Util;
Sefaria.hebrew  = Hebrew;
Sefaria.palette = palette;
Sefaria.track   = Track;

Sefaria.palette.indexColor = function(title) {
      return title && Sefaria.index(title) ?
      Sefaria.palette.categoryColor(Sefaria.index(title).categories[0]):
      Sefaria.palette.categoryColor("Other");
};

Sefaria.palette.refColor = ref => Sefaria.palette.indexColor(Sefaria.parseRef(ref).index);


Sefaria.setup = function(data) {
    // data parameter is optional. in the event it isn't passed, we assume that DJANGO_DATA_VARS exists as a global var
    // data should but defined server-side and undefined client-side

    if (typeof data === "undefined") {
        data = typeof DJANGO_DATA_VARS === "undefined" ? undefined : DJANGO_DATA_VARS;
    }
    if (typeof data !== 'undefined') {
        for (var prop in data) {
            if (data.hasOwnProperty(prop)) {
                Sefaria[prop] = data[prop];
            }
        }
    }
    Sefaria.util.setupPrototypes();
    Sefaria.util.setupMisc();
    var cookie = Sefaria.util.handleUserCookie(Sefaria.loggedIn, Sefaria._uid, Sefaria._partner_group, Sefaria._partner_role);
    // And store current uid in analytics id
    Sefaria._analytics_uid = Sefaria._uid;
    if (cookie) {
      Sefaria._partner_group = cookie._partner_group;
      Sefaria._partner_role = cookie._partner_role;
    }
    Sefaria._makeBooksDict();
    Sefaria.virtualBooksDict = {"Jastrow": 1, "Klein Dictionary": 1, "Jastrow Unabbreviated": 1};  //Todo: Wire this up to the server
    Sefaria._cacheIndexFromToc(Sefaria.toc);
    if (!Sefaria.saved) {
      Sefaria.saved = [];
    }
    if (!Sefaria.last_place) {
        Sefaria.last_place = [];
    }
    Sefaria._cacheHebrewTerms(Sefaria.terms);
    Sefaria._cacheSiteInterfaceStrings();
    Sefaria.track.setUserData(Sefaria.loggedIn, Sefaria._partner_group, Sefaria._partner_role, Sefaria._analytics_uid);
    Sefaria.search = new Search(Sefaria.searchIndexText, Sefaria.searchIndexSheet);
};
Sefaria.setup();

module.exports = Sefaria;

var extend     = require('extend'),
    param      = require('querystring').stringify,
    striptags  = require('striptags'),
    { Search } = require('./search'),
    palette    = require('./palette'),
    Track      = require('./track'),
    Hebrew     = require('./hebrew'),
    Util       = require('./util'),
    $          = require('./sefariaJquery');

var INBROWSER = (typeof document !== 'undefined');

var Sefaria = Sefaria || {
  _dataLoaded: false,
  toc: [],
  books: [],
  booksDict: {},
  recentlyViewed: [],
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

      var response = {book: false,
                      index: false,
                      sections: [],
                      toSections: [],
                      ref: ""};
      if (!q) {
          Sefaria._parseRef[q] = response;
          return response;
      }

      var toSplit = q.split("-");
      var first   = toSplit[0];

      var book, bookOn, index, nums, i;
      for (i = first.length; i >= 0; i--) {
          book   = first.slice(0, i);
          if (book in Sefaria.booksDict) {
              nums = first.slice(i+1);
              break;
          }
      }
      // Get the root index name. (For complex works, this may be different than `book`)
      for (i = book.length; i >= 0; i--) {
          index = book.slice(0,i);
          if (this.index(index)) { break; }
      }
      if (!book) {
          Sefaria._parseRef[q] = {"error": "Unknown book."};
          return Sefaria._parseRef[q];
      }

      if (nums && !nums.match(/\d+[ab]?( \d+)*/)) {
          Sefaria._parseRef[q] = {"error": "Bad section string."};
          return Sefaria._parseRef[q];
      }

      response.index      = index;
      response.book       = book;
      response.sections   = nums ? nums.split(" ") : [];
      response.toSections = nums ? nums.split(" ") : [];
      response.ref        = q;

      // Parse range end (if any)
      if (toSplit.length == 2) {
          var toSections = toSplit[1].replace(/[.:]/g, " ").split(" ");

          var diff = response.sections.length - toSections.length;

          for (var i = diff; i < toSections.length + diff; i++) {
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
      var ref = q.book.replace(/ /g, "_");

      if (q.sections.length)
          ref += "." + q.sections.join(".");

      if (!q.sections.compare(q.toSections)) {
          for (var i = 0; i < q.toSections.length; i ++)
              if (q.sections[i] != q.toSections[i]) break;
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
      var norm = Sefaria.makeRef(Sefaria.parseRef(ref));
      if (typeof norm == "object" && "error" in norm) {
          // If the ref doesn't parse, just replace spaces with undescores.
          return typeof ref === "string" ? ref.replace(/ /g, "_") : ref;
      }
      return norm;
  },
  humanRef: function(ref) {
      // Returns a string of the normalized form of `ref`.
      // `ref` may be a string, or an array of strings. If ref is an array of strings, it is passed to normRefList.
      ref = Sefaria.normRef(ref);
      var pRef = Sefaria.parseRef(ref);
      if (pRef.sections.length == 0) { return pRef.book; }
      var book = pRef.book + " ";
      var hRef = pRef.ref.replace(/ /g, ":");
      return book + hRef.slice(book.length);
  },
  isRef: function(ref) {
    // Returns true if `ref` appears to be a ref relative to known books in Sefaria.books
    var q = Sefaria.parseRef(ref);
    return ("book" in q && q.book);
  },
  normRefList: function(refs) {
    // Returns a single string ref corresponding the range expressed in the list of `refs`
    // e.g. ["Genesis 1:4", "Genesis 1:5", "Genesis 1:6"] -> "Genesis 1:4-6"
    if (refs.length == 1) {
      return refs[0];
    }
    var pRef = Sefaria.parseRef(refs[0]);
    var pRefEnd = Sefaria.parseRef(refs[refs.length-1]);
    if (pRef.book !== pRefEnd.book) {
      return refs[0]; // We don't handle ranges over multiple nodes of complex texts
    }
    var nRef = Sefaria.util.clone(pRef);
    nRef.toSections = pRefEnd.toSections;
    return Sefaria.makeRef(nRef);
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
    var books = "(" + titles.map(RegExp.escape).join("|")+ ")";
    var refReStr = books + " (\\d+[ab]?)(?:[:., ]+)?(\\d+)?(?:(?:[\\-–])?(\\d+[ab]?)?(?:[:., ]+)?(\\d+)?)?";
    return new RegExp(refReStr, "gi");
  },
  wrapRefLinks: function(text) {
      if (typeof text !== "string" ||
          text.indexOf("data-ref") !== -1) {
          return text;
      }
      var titles = Sefaria.titlesInText(text);
      if (titles.length == 0) {
          return text;
      }
      var refRe    = Sefaria.makeRefRe(titles);
      var replacer = function(match, p1, p2, p3, p4, p5, offset, string) {
          // p1: Book
          // p2: From section
          // p3: From segment
          // p4: To section
          // p5: To segment
          var uref;
          var nref;
          var r;
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
  text: function(ref, settings, cb) {
    if (!ref || typeof ref == "object" || typeof ref == "undefined") { debugger; }
    settings = settings || {};
    settings = {
      commentary: settings.commentary || 0,
      context:    settings.context    || 0,
      pad:        settings.pad        || 0,
      enVersion:  settings.enVersion  || null,
      heVersion:  settings.heVersion  || null,
      wrapLinks:  ("wrapLinks" in settings) ? settings.wrapLinks : 1
    };
    var key = this._textKey(ref, settings);
    if (!cb) {
      return this._getOrBuildTextData(key, ref, settings);
    }
    if (key in this._texts && !("updateFromAPI" in this._texts[key])) {
      var data = this._getOrBuildTextData(key, ref, settings);
      cb(data);
      return data;
    }
    //console.log("API Call for " + key);
    this.textApi(ref,settings,cb);
    return null;
  },
  textApi: function(ref, settings, cb) {
    settings = settings || {};
    settings = {
      commentary: settings.commentary || 0,
      context:    settings.context    || 0,
      pad:        settings.pad        || 0,
      enVersion:  settings.enVersion  || null,
      heVersion:  settings.heVersion  || null,
      //wrapLinks:  settings.wrapLinks  || 1
      wrapLinks: ("wrapLinks" in settings) ? settings.wrapLinks : 1
    };
    return this._api(Sefaria.apiHost + this._textUrl(ref, settings), function(data) {
      this._saveText(data, settings);
      cb(data);
      //console.log("API return for " + data.ref)
    }.bind(this));
  },
  /*
  refreshSegmentCache: function(ref, versionTitle, language) {
     // versionTitle and language are optional
     all_5bit_binary_strings = [...Array(32).keys()].map(n => ((pad + (n).toString(2)).slice(-5)))
      this.textApi(ref, settings, function() {})
        .always(function() {this.textApi(ref, settings, function() {})}.bind(this))
        .always()
  },
  */
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
    var params = param({
      commentary: settings.commentary,
      context:    settings.context,
      pad:        settings.pad,
      wrapLinks:  settings.wrapLinks
    });
    var url = "/api/texts/" + Sefaria.normRef(ref);
    if (settings.enVersion) { url += "&ven=" + settings.enVersion.replace(/ /g,"_"); }
    if (settings.heVersion) { url += "&vhe=" + settings.heVersion.replace(/ /g,"_"); }
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
  _getOrBuildTextData: function(key, ref, settings) {
    var cached = this._texts[key];
    if (!cached || !cached.buildable) { return cached; }
    if (cached.buildable === "Add Context") {
      var segmentData  = Sefaria.util.clone(this.text(cached.ref, extend(settings, {context: 0})));
      var contextData  = this.text(cached.sectionRef, extend(settings, {context: 0})) || this.text(cached.sectionRef, extend(settings, {context: 1}));
      segmentData.text = contextData.text;
      segmentData.he   = contextData.he;
      return segmentData;
    }
  },
  _saveText: function(data, settings) {
    if (!data || "error" in data) {
      return;
    }
    settings         = settings || {};
    var key          = this._textKey(data.ref, settings);
    this._texts[key] = data;

    var refkey           = this._refKey(data.ref, settings);
    this._refmap[refkey] = key;

    var levelsUp = data.textDepth - data.sections.length;
    if (levelsUp >= 1 && !data.isSpanning) { // Section level ref
      this._splitTextSection(data, settings);
    } else if (settings.context && levelsUp <= 1) {  // Do we really want this to run on spanning section refs?
      // Save a copy of the data at context level
      var newData        = Sefaria.util.clone(data);
      newData.ref        = data.sectionRef;
      newData.heRef      = data.heSectionRef;
      newData.sections   = data.sections.slice(0,-1);
      newData.toSections = data.toSections.slice(0,-1);
      const context_settings = {};
      if (settings.enVersion) { context_settings.enVersion = settings.enVersion; }
      if (settings.heVersion) { context_settings.heVersion = settings.heVersion; }

      this._saveText(newData, context_settings);
    }
    if (data.isSpanning) {
      const spanning_context_settings = {context:1};
      if (settings.enVersion) { spanning_context_settings.enVersion = settings.enVersion; }
      if (settings.heVersion) { spanning_context_settings.heVersion = settings.heVersion; }

      for (var i = 0; i < data.spanningRefs.length; i++) {
        // For spanning refs, request each section ref to prime cache.
        // console.log("calling spanning prefetch " + data.spanningRefs[i])
        Sefaria.text(data.spanningRefs[i], spanning_context_settings, function(data) {})
      }
    }
  },
  _splitTextSection: function(data, settings) {
    // Takes data for a section level text and populates cache with segment levels.
    // Don't do this for Refs above section level, like "Rashi on Genesis 1", since it's impossible to correctly derive next & prev.
    settings = settings || {};
    var en = typeof data.text == "string" ? [data.text] : data.text;
    var he = typeof data.he == "string" ? [data.he] : data.he;
    // Pad the shorter array to make stepping through them easier.
    var length = Math.max(en.length, he.length);
    var superSectionLevel = data.textDepth == data.sections.length + 1;
    var padContent = superSectionLevel ? [] : "";
    en = en.pad(length, "");
    he = he.pad(length, "");

    var delim = data.ref === data.book ? " " : ":";
    var start = data.textDepth == data.sections.length ? data.sections[data.textDepth-1] : 1;
    for (var i = 0; i < length; i++) {
      var ref          = data.ref + delim + (i+start);
      var sectionRef   = superSectionLevel ? data.sectionRef : ref;
      var segment_data = Sefaria.util.clone(data);
      extend(segment_data, {
        ref: ref,
        heRef: data.heRef + delim + Sefaria.hebrew.encodeHebrewNumeral(i+start),
        text: en[i],
        he: he[i],
        sections: data.sections.concat(i+1),
        toSections: data.sections.concat(i+1),
        sectionRef: sectionRef,
        nextSegment: i+start == length ? data.next + delim + 1 : data.ref + delim + (i+start+1),
        prevSegment: i+start == 1      ? null : data.ref + delim + (i+start-1)
      });
      const context_settings = {};
      if (settings.enVersion) { context_settings.enVersion = settings.enVersion; }
      if (settings.heVersion) { context_settings.heVersion = settings.heVersion; }

      this._saveText(segment_data, context_settings);

      context_settings.context = 1;
      var contextKey = this._textKey(ref, context_settings);
      this._texts[contextKey] = {buildable: "Add Context", ref: ref, sectionRef: sectionRef, updateFromAPI:data.updateFromAPI};

      var refkey           = this._refKey(ref, context_settings);
      this._refmap[refkey] = contextKey;

    }
  },
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
  _wrapRefs: function(data) {
    // Wraps citations found in text of data
    if (!data.text) { return data; }
    if (typeof data.text === "string") {
      data.text = Sefaria.wrapRefLinks(data.text);
    } else {
      data.text = data.text.map(Sefaria.wrapRefLinks);
    }
    return data;
  },
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
  shape:  function(title, cb) {
    if (title in this._shape) {
        return this._shape[title];
    }
    var url = Sefaria.apiHost + "/api/shape/" + title;
    return this._api(url, function(data) {
      if (cb) { cb(data); }
      Sefaria._shape[title] = data;
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
  indexDetails: function(title, cb) {
    // Returns detailed index record for `title` which includes info like author and description
    var details = title in this._indexDetails ? this._indexDetails[title] : null;
    if (details) {
      if (cb) {cb(details)}
      return details;
    }
    var url = Sefaria.apiHost + "/api/v2/index/" + title + "?with_content_counts=1";
    this._api(url, function(data) {
      if (cb) { cb(data); }
      Sefaria._indexDetails[title] = data;
    });
    return details;
  },
  _titleVariants: {},
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
  postSegment: function(ref, versionTitle, language, text, success, error) {
    if (!versionTitle || !language) { return; }
    this.lookupRef(ref, function(data) {
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
    }.bind(this));
  },
  ref: function(ref, callback) {
    // Returns parsed ref info for string `ref` from cache, or async from API if `callback` is present
    // Uses this._refmap to find the refkey that has information for this ref.
    // Used in cases when the textual information is not important, so it can
    // be called without worrying about the `settings` parameter for what is available in cache.
    var result = null;
    if (ref) {
      var versionedKey = this._refmap[this._refKey(ref)] || this._refmap[this._refKey(ref, {context:1})];
      if (versionedKey) { result = this._getOrBuildTextData(versionedKey);  }
    }
    if (callback && result) {
      callback(result);
    } else if (callback) {
      // To avoid an extra API call, first look for any open API calls to this ref (regardless of params)
      var openApiCalls = Object.keys(Sefaria._apiCallbacks);
      var urlPattern = "/api/texts/" + Sefaria.normRef(ref);
      for (var i = 0; i < openApiCalls.length; i++) {
        if (openApiCalls[i].startsWith(urlPattern)) {
          Sefaria._apiCallbacks[openApiCalls[i]].splice(0, 0, callback);
        }
      }
      // If no open calls found, call the texts API.
      // Called with context:1 because this is our most common mode, maximize change of saving an API Call
      Sefaria.text(ref, {context: 1}, callback);
    } else {
      return result;
    }
  },
  _lookups: {},
  _ref_lookups: {},
  // lookupRef should work as a replacement for parseRef - it uses a callback rather than return value.  Besides that - same data.
  lookupRef: function(n, c, e)  { return this.lookup(n,c,e,true);},
  lookup: function(name, callback, onError, refOnly) {
    /*
      * name - string to lookup
      * callback - callback function, takes one argument, a data object
      * onError - callback
      * refOnly - if True, only search for titles, otherwise search for People and Categories as well.
     */
    name = name.trim();
    var cache = refOnly? this._ref_lookups: this._lookups;
    onError = onError || function() {};
    if (name in cache) {
        callback(cache[name]);
        return null;
    }
    else {
        return $.ajax({
          dataType: "json",
          url: Sefaria.apiHost + "/api/name/" + name + (refOnly?"?ref_only=1":""),
          error: onError,
          success: function(data) {
              cache[name] = data;
              callback(data);
          }.bind(this)
        });
    }
  },

  sectionRef: function(ref) {
    // Returns the section level ref for `ref` or null if no data is available
    var oref = this.ref(ref);
    return oref ? oref.sectionRef : null;
  },
  splitRangingRef: function(ref) {
    // Returns an array of segment level refs which correspond to the ranging `ref`
    // e.g. "Genesis 1:1-2" -> ["Genesis 1:1", "Genesis 1:2"]
    var oref = Sefaria.parseRef(ref);
    var isDepth1 = oref.sections.length == 1;
    if (!isDepth1 && oref.sections[oref.sections.length - 2] !== oref.toSections[oref.sections.length - 2]) {
      var textData = Sefaria.text(ref);
      if (!textData) {
        // TODO handle spanning refs, when no text data is available to answer how many segments are in each include section.
        // i.e., in "Shabbat 2a:5-2b:8" what is the last segment of Shabbat 2a?
        // For now, just return the first non-spanning ref.
        var newRef = Sefaria.util.clone(oref);
        newRef.toSections = newRef.sections;
        return [this.humanRef(this.makeRef(newRef))];        
      } else {
        return Sefaria.makeSegments(textData).map(segment => segment.ref); 
      }
    } else {
      var refs  = [];
      var start = oref.sections[oref.sections.length-1];
      var end   = oref.toSections[oref.sections.length-1];
      for (var i = start; i <= end; i++) {
        newRef = Sefaria.util.clone(oref);
        newRef.sections[oref.sections.length-1] = i;
        newRef.toSections[oref.sections.length-1] = i;
        refs.push(this.humanRef(this.makeRef(newRef)));
      }
      return refs;
    }
  },
  _lexiconLookups: {},
  lexicon: function(words, ref, cb){
    // Returns a list of lexicon entries for the given words
    ref = typeof ref !== "undefined" ? ref : null;
    words = typeof words !== "undefined" ? words : "";
    var cache_key = ref ? words + "|" + ref : words;
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
    }else{
        return cb([]);
    }

  },
  _links: {},
  links: function(ref, cb) {
    // Returns a list of links known for `ref`.
    // WARNING: calling this function with spanning refs can cause bad state in cache.
    // When processing links for "Genesis 2:4-4:4", a link to the entire chapter "Genesis 3" will be split and stored with that key.
    // The data for "Genesis 3" then represents only links to the entire chapter, not all links within the chapter.
    // Fixing this generally on the client side requires more understanding of ref logic.
    ref = Sefaria.humanRef(ref);
    if (!cb) {
      return this._links[ref] || [];
    }
    if (ref in this._links) {
      cb(this._links[ref]);
    } else {
       var url = Sefaria.apiHost + "/api/links/" + ref + "?with_text=0";
       this._api(url, function(data) {
          if ("error" in data) {
            return;
          }
          this._saveLinkData(ref, data);
          cb(data);
        }.bind(this));
    }
  },
  _saveLinkData: function(ref, data) {
    ref = Sefaria.humanRef(ref);
    var l = this._saveLinksByRef(data);
    this._links[ref] = data;
    this._cacheIndexFromLinks(data);
    return l;
  },
  _cacheIndexFromLinks: function(links) {
    // Cache partial index information (title, Hebrew title, categories) found in link data.
    for (var i=0; i < links.length; i++) {
      if (("collectiveTitle" in links[i]) && this.index(links[i].collectiveTitle["en"])) {
          continue;
      }
      var index = {
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
      var refs = Sefaria.splitRangingRef(ref);
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
    if (typeof ref == "string") {
      return ref in this._links;
    } else {
      for (var i = 0; i < ref.length; i++) {
        if (!this.linksLoaded(ref[i])) { return false; }
      }
      return true;
    }
  },
  linkCount: function(ref, filter) {
    // Returns the number links available for `ref` filtered by `filter`, an array of strings.
    if (!(ref in this._links)) { return 0; }
    var links = this._links[ref];
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
  _linkSummaries: {},
  linkSummary: function(ref) {
    // Returns an ordered array summarizing the link counts by category and text
    // Takes either a single string `ref` or an array of refs strings.

    var normRef = Sefaria.humanRef(ref);
    if (normRef in this._linkSummaries) { return this._linkSummaries[normRef]; }
    if (typeof ref == "string") {
      var links = this.links(ref);
    } else {
      var links = [];
      ref.map(function(r) {
        var newlinks = Sefaria.links(r);
        links = links.concat(newlinks);
      });
    }

    var summary = {};
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      // Count Category
      if (link.category in summary) {
        summary[link.category].count += 1
      } else {
        summary[link.category] = {count: 1, books: {}};
      }
      var category = summary[link.category];
      // Count Book
      if (link["collectiveTitle"]["en"] in category.books) {
        category.books[link["collectiveTitle"]["en"]].count += 1;
      } else {
        category.books[link["collectiveTitle"]["en"]] = {count: 1};
      }
    }
    // Add Zero counts for every commentator in this section not already in list
    var baseRef    = typeof ref == "string" ? ref : ref[0]; // TODO handle refs spanning sections
    var oRef       = Sefaria.ref(baseRef);
    var sectionRef = oRef ? oRef.sectionRef : baseRef;
    if (ref !== sectionRef) {
      var sectionLinks = Sefaria.links(sectionRef);
      for (var i = 0; i < sectionLinks.length; i++) {
        var l = sectionLinks[i];
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
    var summaryList = Object.keys(summary).map(function(category) {
      var categoryData = summary[category];
      categoryData.category = category;
      categoryData.books = Object.keys(categoryData.books).map(function(book) {
        var bookData = categoryData.books[book];
        var index      = Sefaria.index(book);
        bookData.book     = index.title;
        bookData.heBook   = index.heTitle;
        bookData.category = category;
        return bookData;
      });
      // Sort the books in the category
      var cat = oRef ? oRef["categories"][0] : null;
      categoryData.books.sort(Sefaria.linkSummaryBookSort.bind(null, cat));

      return categoryData;
    });
    // Sort the categories
    var categoryOrder = Sefaria.toc.map(function(cat) { return cat.category; });
    categoryOrder.splice(0, 0, "Commentary"); // Always show Commentary First
    categoryOrder.splice(2, 0, "Targum");     // Show Targum after Tanakh
    summaryList.sort(function(a, b) {
      var orderA = categoryOrder.indexOf(a.category);
      var orderB = categoryOrder.indexOf(b.category);
      orderA = orderA == -1 ? categoryOrder.length : orderA;
      orderB = orderB == -1 ? categoryOrder.length : orderB;
      return orderA - orderB;
    });
    Sefaria._linkSummaries[Sefaria.humanRef(ref)] = summaryList;
    return summaryList;
  },
  linkSummaryBookSort: function(category, a, b, byHebrew) {
    // Sorter for links in a link summary, included a hard coded list of top spots by category
    var byHebrew = byHebrew || false;
    // First sort by predefined "top"
    var topByCategory = {
      "Tanakh": ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
      "Talmud": ["Rashi", "Tosafot"]
    };
    var top = topByCategory[category] || [];
    var aTop = top.indexOf(a.book);
    var bTop = top.indexOf(b.book);
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
  commentarySectionRef: function(commentator, baseRef) {
    // Given a commentator name and a baseRef, return a ref to the commentary which spans the entire baseRef
    // E.g. ("Rashi", "Genesis 3") -> "Rashi on Genesis 3"
    // Works by examining links available on baseRef, returns null if no links are in cache.
    if (commentator == "Abarbanel") {
      return null; // This text is too giant, optimizing up to section level is too slow.
    }
    var links = Sefaria.links(baseRef);
    links = Sefaria._filterLinks(links, [commentator]);
    if (!links || !links.length) { return null; }
    var commentaryLink = Sefaria.util.clone(Sefaria.parseRef(links[0].sourceRef));
    for (var i = 1; i < links.length; i++) {
      var plink = Sefaria.parseRef(links[i].sourceRef);
      if (commentaryLink.book !== plink.book) { return null;} // Can't handle multiple index titles or schemaNodes
      if (plink.sections.length > commentaryLink.sections.length) {
        commentaryLink.sections = commentaryLink.sections.slice(0, plink.sections.length);
      }
      for (var k=0; k < commentaryLink.sections.length; k++) {
        if (commentaryLink.sections[k] !== plink.sections[k]) {
          commentaryLink.sections = commentaryLink.sections.slice(0, k);
          break;
        }
      }
    }
    commentaryLink.toSections = commentaryLink.sections;
    var ref = Sefaria.humanRef(Sefaria.makeRef(commentaryLink));
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
    this._api(url, function(data) {
      if ("error" in data) {
        return;
      }
      this._savePrivateNoteData(null, data);
      this._allPrivateNotes = data;
      callback(data);
    }.bind(this));
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
    var url = Sefaria.apiHost + "/api/related/" + Sefaria.normRef(ref);
    return this._api(url, function(data) {
      if ("error" in data) {
        return;
      }
      var originalData = Sefaria.util.clone(data);

      // Save link, note, and sheet data, and retain the split data from each of these saves
      var split_data = {
          links: this._saveLinkData(ref, data.links),
          notes: this._saveNoteData(ref, data.notes),
          sheets: this.sheets._saveSheetsByRefData(ref, data.sheets)
      };

       // Build split related data from individual split data arrays
      ["links", "notes", "sheets"].forEach(function(obj_type) {
        for (var ref in split_data[obj_type]) {
          if (split_data[obj_type].hasOwnProperty(ref)) {
            if (!(ref in this._related)) {
                this._related[ref] = {links: [], notes: [], sheets: []};
            }
            this._related[ref][obj_type] = split_data[obj_type][ref];
          }
        }
      }, this);

      // Save the original data after the split data - lest a split version overwrite it.
      this._related[ref] = originalData;

      callback(data);
    }.bind(this));
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
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0]
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
                         (n > 0 && n < topLength -1))
          });
        }
      }
    }
    return segments;
  },
  sectionString: function(ref) {
    // Returns a pair of nice strings (en, he) of the sections indicated in ref. e.g.,
    // "Genesis 4" -> "Chapter 4", "Guide for the Perplexed, Introduction" - > "Introduction"
    var data = this.ref(ref);
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
  saveRecentItem: function(recentItem) {
    var recent = Sefaria.recentlyViewed;
    if (recent.length && recent[0].ref == recentItem.ref) { return; }
    recent = recent.filter(function(item) {
      return item.book !== recentItem.book; // Remove this item if it's in the list already
    });
    recent.splice(0, 0, recentItem);
    Sefaria.recentlyViewed = recent;
    var packedRecent = recent.map(Sefaria.packRecentItem);
    if (Sefaria._uid) {
        $.post(Sefaria.apiHost + "/api/profile",
              {json: JSON.stringify({recentlyViewed: packedRecent})},
              function(data) {} );
    } else {
      var cookie = INBROWSER ? $.cookie : Sefaria.util.cookie;
      packedRecent = packedRecent.slice(0, 6);
      cookie("recentlyViewed", JSON.stringify(packedRecent), {path: "/"});
    }
  },
  packRecentItem: function(item) {
    // Returns an array which represents the object `item` with less overhead.
    let fields = ["ref", "heRef", "lastVisited", "bookVisitCount"];
    let packed = [];
    fields.map(field => {
      var value = field in item ? item[field] : null;
      packed.push(value);
    });
    if (item.currVersions) {
      packed = packed.concat([item.currVersions.en, item.currVersions.he]);
    }
    return packed;
  },
  unpackRecentItem: function(item) {
    // Returns an object which preprsents the array `item` with fields expanded
    var oRef = Sefaria.parseRef(item[0]);
    var unpacked = {
      ref: item[0],
      heRef: item[1],
      book: oRef.index,
      lastVisited: item.length > 2 ? item[2] : null,
      bookVisitCount: item.length > 3 ? item[3] : null,
      currVersions: item.length > 4 ? {
        en: item[4],
        he: item[5],
      } : undefined,
    };
    return unpacked;
  },
  recentItemForText: function(title) {
    // Return the most recently visited item for text `title` or null if `title` is not present in recentlyViewed.
    for (var i = 0; i < Sefaria.recentlyViewed.length; i++) {
      if (Sefaria.recentlyViewed[i].book === title) {
        return Sefaria.recentlyViewed[i];
      }
    }
    return null;
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
  sheets: {
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
        var url = Sefaria.apiHost + "/api/sheets/tag/" + tag;
         $.getJSON(url, function(data) {
            this._sheetsByTag[tag] = data.sheets;
            if (callback) { callback(data.sheets); }
          }.bind(this));
        }
      return sheets;
    },
    _userSheets: {},
    userSheets: function(uid, callback, sortBy, offset, numberToRetrieve) {
      // Returns a list of source sheets belonging to `uid`
      // Only a user logged in as `uid` will get data back from this API call.
      if (!offset) offset = 0;
      if (!numberToRetrieve) numberToRetrieve = 0;
      sortBy = typeof sortBy == "undefined" ? "date" : sortBy;
      var sheets = this._userSheets[uid+sortBy+offset+numberToRetrieve];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = Sefaria.apiHost + "/api/sheets/user/" + uid + "/" + sortBy + "/" + numberToRetrieve + "/" + offset;
         Sefaria._api(url, function(data) {
            this._userSheets[uid+sortBy+offset+numberToRetrieve] = data.sheets;
            if (callback) { callback(data.sheets); }
          }.bind(this));
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
    }
  },
  _groups: {},
  groups: function(group, sortBy, callback) {
    // Returns data for an individual group
    var group = this._groups[group];
    if (group) {
      this._sortSheets(group, sortBy);
      if (callback) { callback(group); }
    } else if (callback) {
      var url = Sefaria.apiHost + "/api/groups/" + group;
       Sefaria._api(url, function(data) {
          this._groups[group] = data;
          this._sortSheets(data, sortBy);
          callback(data);
        }.bind(this));
      }
    return group;
  },
  _sortSheets: function(group, sortBy) {
    // Taks an object representing a group and sorts its sheets in place according to `sortBy`.
    // Also honors ordering of any sheets in `group.pinned_sheets`
    if (!group.sheets) { return; }

    var sorters = {
      date: function(a, b) {
        return Date.parse(b.modified) - Date.parse(a.modified);
      },
      alphabetical: function(a, b) {
        return a.title.stripHtml().trim() > b.title.stripHtml().trim() ? 1 : -1;
      },
      views: function(a, b) {
        return b.views - a.views;
      }
    };
    var sortPinned = function(a, b) {
      var ai = group.pinnedSheets.indexOf(a.id);
      var bi = group.pinnedSheets.indexOf(b.id);
      if (ai == -1 && bi == -1) { return 0; }
      if (ai == -1) { return 1; }
      if (bi == -1) { return -1; }
      return  ai < bi ? -1 : 1;
    };
    group.sheets.sort(sorters[sortBy]);
    group.sheets.sort(sortPinned);
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
  hebrewTerm: function(name) {
    // Returns a string translating `name` into Hebrew.
    var categories = {
      "Quoting Commentary":   "פרשנות מצטטת",
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
      "My Notes on Sefaria": "הרשומות שלי בספריא",
      "Moderator Tools": "כלי מנהלים",
      " with " : " עם ",
      "Connections" : "קשרים",
      " & ": " | ",
      "My Source Sheets" : "דפי המקורות שלי",
      "Public Source Sheets":"דפי מקורות פומביים",
      "History": "היסטוריה",
      "Digitized by Sefaria": 'הונגש ועובד לצורה דיגיטלית על ידי ספריא',
      "Public Domain": "רשיון בנחלת הכלל",
      "CC-BY": "רשיון CC-BY",
      "CC-BY-NC": "רשיון CC-BY-NC",
      "CC-BY-SA": "רשיון CC-BY-SA",
      "CC-BY-NC-SA": "רשיון CC-BY-NC-Sa",
      "CC0": "רשיון CC0",
      "Copyright: JPS, 1985": "זכויות שמורות ל-JPS, 1985",

      //sheets
      "Start a New Source Sheet": "התחלת דף מקורות חדש",
      "Untitled Source Sheet" : "דף מקורות ללא שם",
      "New Source Sheet" : "דף מקורות חדש",
      "Name New Sheet" : "כותרת לדף המקורות",
      "Sorry, there was a problem saving your note.": "סליחה, ארעה שגיאה בזמן השמירה",
      "Unfortunately, there was an error saving this note. Please try again or try reloading this page.": "ארעה שגיאה בזמן השמירה. אנא נסו שוב או טענו את הדף מחדש",
      "Are you sure you want to delete this note?": "האם אתם בטוחים שברצונכם למחוק?",
      "Something went wrong (that's all I know).":"משהו השתבש. סליחה",
      "Write a note...":"כתוב הערות כאן...",
      "Aa": "א",
      "Decrease font size": "הקטן גופן",
      "Increase font size": "הגדל גופן",
      "Search for Texts or Keywords Here": "חפשו ספרים או מלות מפתח כאן",
      "this comment":"הערה זו",
      "this source":"מקור זה",
      "was added to": "נוסף ל-",
      "View sheet": "מעבר ל-דף המקורות",
      "Please select a source sheet.": "אנא בחר דף מקורות.",
      "New Source Sheet Name:" : "כותרת דף מקורות חדש:",

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
      //"Search for Texts or Keywords Here": "חיפוש טקסט או מילות מפתח",
      "Views": "צפיות",
      "Search for Texts or Keywords Here": "חיפוש טקסט או מילות מפתח",
      "Views": "צפיות",
      "Versions": "גרסאות",
      "Version Open": "גרסה פתוחה",
      "About": "אודות",
      "Current": "נוכחית",
      "Select": "החלפת גרסה",

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
  },
  _v: function(inputVar){
    if(Sefaria.interfaceLang != "english"){
        return Sefaria.hebrewTerm(inputVar);
    }else{
        return inputVar;
	}
  },
  _r: function (inputRef) {
    if(Sefaria.interfaceLang != "english"){
        var oref = Sefaria.ref(inputRef);
        if(oref){
            return oref.heRef;
        }
    }else{
        return inputRef;
	}
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
  _makeBooksDict: function() {
    // Transform books array into a dictionary for quick lookup
    // Which is worse: the cycles wasted in computing this on the client
    // or the bandwidth wasted in letting the server computer once and transmitting the same data twice in different form?
    this.booksDict = {};
    for (var i = 0; i < this.books.length; i++) {
      this.booksDict[this.books[i]] = 1;
    }
  },
  _apiCallbacks: {},
  _ajaxObjects: {},
  _api: function(url, callback) {
    // Manage API calls and callbacks to prevent duplicate calls
    if (url in this._apiCallbacks) {
      this._apiCallbacks[url].push(callback);
      return this._ajaxObjects[url];
    } else {
      this._apiCallbacks[url] = [callback];
      var ajaxobj = $.getJSON(url, function(data) {
        var callbacks = this._apiCallbacks[url];
        for (var i = 0; i < callbacks.length; i++) {
          callbacks[i](data);
        }
        delete this._apiCallbacks[url];
        delete this._ajaxObjects[url];
      }.bind(this));
      this._ajaxObjects[url] = ajaxobj;
      return ajaxobj;
    }
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
        for (let v of panelVersions) {
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
    Sefaria._cacheIndexFromToc(Sefaria.toc);
    if (!Sefaria.recentlyViewed) {
        Sefaria.recentlyViewed = [];
    }
    Sefaria.recentlyViewed = Sefaria.recentlyViewed.map(Sefaria.unpackRecentItem).filter(function(item) { return !("error" in item); });
    Sefaria._cacheHebrewTerms(Sefaria.terms);
    Sefaria.track.setUserData(Sefaria.loggedIn, Sefaria._partner_group, Sefaria._partner_role, Sefaria._analytics_uid);
    Sefaria.search = new Search(Sefaria.searchBaseUrl, Sefaria.searchIndex)
};
Sefaria.setup();

module.exports = Sefaria;

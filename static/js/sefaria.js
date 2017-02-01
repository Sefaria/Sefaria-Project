if (typeof require !== 'undefined') {
  var INBROWSER = false,
      $         = require('cheerio'),
      extend    = require('extend'),
      param     = require('querystring').stringify,
      striptags = require('striptags'),
      ga        = function() {}; // Fail gracefully if we reach one of these methods server side
      $.ajax    = function() {}; // ditto
      $.getJSON = function() {}; // ditto
} else {
  var INBROWSER = true,
      extend    = $.extend,
      param     = $.param;
}

var Sefaria = Sefaria || {
  _dataLoaded: false,
  toc: [],
  books: [],
  booksDict: {}
};

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
          bookOn = book.split(" on ");
          if (book in Sefaria.booksDict || 
              (bookOn.length == 2 && bookOn[0] in Sefaria.booksDict && bookOn[1] in Sefaria.booksDict)) { 
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
      // Returns a string ref correpsonding to the parsed ref `q` (like Ref.url() in Python)
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
      var norm = Sefaria.makeRef(Sefaria.parseRef(ref));
      if (typeof norm == "object" && "error" in norm) {
          // If the ref doesn't parse, just replace spaces with undescores.
          return typeof ref === "string" ? ref.replace(/ /g, "_") : ref;
      }
      return norm;
  },
  humanRef: function(ref) {
      var pRef = Sefaria.parseRef(ref);
      if (pRef.sections.length == 0) { return pRef.book; }
      var book = pRef.book + " ";
      var hRef = pRef.ref.replace(/ /g, ":");
      return book + hRef.slice(book.length);
  },
  isRef: function(ref) {
    // Returns true if `ref` appears to be a ref relative to known books in Sefaria.books
    var q = Sefaria.parseRef(ref);
    // We check for Index here in order not to allow a bare commentator name. Something like "Ramban" will return a book, but no Index.
    // After commentary refactor, we can take off the index check, below.
    return ("book" in q && q.book && "index" in q && q.index);
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
      version:    settings.version    || null,
      language:   settings.language   || null
    };
    var key = this._textKey(ref, settings);
    if (!cb) {
      return this._getOrBuildTextData(key, ref, settings);
    }          
    if (key in this._texts) {
      var data = this._getOrBuildTextData(key, ref, settings);
      cb(data);
      return data;
    }
    //console.log("API Call for " + key)
    this._api(this._textUrl(ref, settings), function(data) {
      this._saveText(data, settings);
      cb(data);
      //console.log("API return for " + data.ref)
    }.bind(this));
  },
  _versions: {},
  versions: function(ref, cb) {
    // Returns a list of available text versions for `ref`.
    var versions = ref in this._versions ? this._versions[ref] : null;
    if (versions) {
      if (cb) {cb(versions)}
      return versions
    }
    var url = "/api/texts/versions/" + Sefaria.normRef(ref);
    this._api(url, function(data) {
      if (cb) { cb(data); }
      Sefaria._versions[ref] = data;
    });
    return versions;
  },
  _textUrl: function(ref, settings) {
    // copy the parts of settings that are used as parameters, but not other
    var params = param({
      commentary: settings.commentary,
      context:    settings.context,
      pad:        settings.pad
    });
    var url = "/api/texts/" + Sefaria.normRef(ref);
    if (settings.language && settings.version) {
        url += "/" + settings.language + "/" + settings.version.replace(" ","_");
    }
    return url + "?" + params;
  },
  _textKey: function(ref, settings) {
    // Returns a string used as a key for the cache object of `ref` given `settings`.
    if (!ref) { debugger; }
    var key = ref.toLowerCase();
    if (settings) {
      key = (settings.language && settings.version) ? key + "/" + settings.language + "/" + settings.version : key;
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
  _saveText: function(data, settings, skipWrap) {
    if (!data || "error" in data) { 
      return;
    }
    settings         = settings || {};
    data             = skipWrap ? data : this._wrapRefs(data);
    var key          = this._textKey(data.ref, settings);
    this._texts[key] = data;

    var refkey           = this._refKey(data.ref, settings);
    this._refmap[refkey] = key;

    if (// data.ref == data.sectionRef // Not segment level ref
        data.textDepth - data.sections.length == 1 // Section level ref
        && !data.isSpanning) {
      this._splitTextSection(data, settings);
    } else if (settings.context) {
      // Save a copy of the data at context level
      var newData        = Sefaria.util.clone(data);
      newData.ref        = data.sectionRef;
      newData.sections   = data.sections.slice(0,-1);
      newData.toSections = data.toSections.slice(0,-1);
      var context_settings = (settings.language && settings.version) ? {
          version: settings.version,
          language: settings.language
      }:{};
      this._saveText(newData, context_settings, true);
    }
    if (data.isSpanning) {
      var spanning_context_settings = (settings.language && settings.version) ? {
          version: settings.version,
          language: settings.language,
          context: 1
      }:{context: 1};
      for (var i = 0; i < data.spanningRefs.length; i++) {
        // For spanning refs, request each section ref to prime cache.
        // console.log("calling spanning prefetch " + data.spanningRefs[i])
        Sefaria.text(data.spanningRefs[i], spanning_context_settings, function(data) {})
      }      
    }

    var index = {
      title:      data.indexTitle,
      heTitle:    data.heIndexTitle, // This is incorrect for complex texts
      categories: data.categories
    };
    this.index(index.title, index);
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

      var context_settings = (settings.version && settings.language) ? {
          version: settings.version,
          language: settings.language
      } : {};
      this._saveText(segment_data, context_settings, true);

      context_settings.context = 1;
      var contextKey = this._textKey(ref, context_settings);
      this._texts[contextKey] = {buildable: "Add Context", ref: ref, sectionRef: sectionRef};

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
  index: function(text, index) {
    if (!index) {
      return this._index[text];
    } else {
      this._index[text] = index;
    }
  },
  _cacheIndexFromToc: function(toc) {
    // Unpacks contents of Sefaria.toc into index cache.
    for (var i = 0; i < toc.length; i++) {
      if ("category" in toc[i]) {
        Sefaria._cacheIndexFromToc(toc[i].contents)
      } else {
        Sefaria.index(toc[i].title, toc[i]);
      }
    }
  },
  _indexDetails: {},
  indexDetails: function(title, cb) {
    // Returns detailed index record for `title` which includes info like author and description
    var details = title in this._indexDetails ? this._indexDetails[title] : null;
    if (details) {
      if (cb) {cb(details)}
      return details;
    }
    var url = "/api/v2/index/" + title + "?with_content_counts=1";
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
        this._api("/api/index/" + title, function(data) {
          for (var i = 0; i < data.titleVariants.length; i ++) {
            Sefaria._titleVariants[data.titleVariants[i]] = data.title;
          }
          callback(data.title);
        });        
    }
  },
  ref: function(ref) {
    // Returns parsed ref info for string `ref` which has been preloaded in the cache.
    // Uses this._refmap to find the refkey that has information for this ref.
    // Used in cases when the textual information is not important, so it can
    // be called without worrying about the `settings` parameter for what is available in cache.
    if (!ref) { return null; }
    var versionedKey = this._refmap[this._refKey(ref)] || this._refmap[this._refKey(ref, {context:1})];
    if (versionedKey) { return this._getOrBuildTextData(versionedKey);  }
    return null;
  },
  sectionRef: function(ref) {
    // Returns the section level ref for `ref` or null if no data is available
    var oref = this.ref(ref);
    return oref ? oref.sectionRef : null;
  },
  splitSpanningRef: function(ref) {
    // Returns an array of non-spanning refs which correspond to the spanning `ref`
    // e.g. "Genesis 1:1-2" -> ["Genesis 1:1", "Genesis 1:2"]
    var oref = Sefaria.parseRef(ref);
    var isDepth1 = oref.sections.length == 1;
    if (!isDepth1 && oref.sections[oref.sections.length - 2] !== oref.toSections[oref.sections.length - 2]) {
      // TODO handle ranging refs, which requires knowledge of the segment count of each included section
      // i.e., in "Shabbat 2a:5-2b:8" what is the last segment of Shabbat 2a?
      // For now, just return the first non-spanning ref.
      var newRef = Sefaria.util.clone(oref);
      newRef.toSections = newRef.sections;
      return [this.humanRef(this.makeRef(newRef))];
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
      var url = "/api/words/" + encodeURIComponent(words)+"?never_split=1";
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
    if (!cb) {
      return this._links[ref] || [];
    }
    if (ref in this._links) {
      cb(this._links[ref]);
    } else {
       var url = "/api/links/" + Sefaria.normRef(ref) + "?with_text=0";
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
    var l = this._saveLinksByRef(data);
    this._links[ref] = data;
    this._cacheIndexFromLinks(data);
    return l;
  },
  _cacheIndexFromLinks: function(links) {
    // Cache partial index information (title, Hebrew title, categories) found in link data.
    for (var i=0; i< links.length; i++) {
      if (this.index(links[i].commentator)) { continue; }
      var index = {
        title:      links[i].commentator,
        heTitle:    links[i].heCommentator,
        categories: [links[i].category],
      };
      this.index(links[i].commentator, index);
    }
  },
  _saveLinksByRef: function(data) {
    return this._saveItemsByRef(data, this._links);
  },
  _saveItemsByRef: function(data, store) {
    // For a set of items from the API, save each set split by the specific ref the items points to.
    // E.g, API is called on "Genesis 1", this function also stores the data in buckets like "Genesis 1:1", "Genesis 1:2" etc.
    var splitItems = {}; // Aggregate links by anchorRef
    for (var i=0; i < data.length; i++) {
      var ref = data[i].anchorRef;
      var refs = Sefaria.splitSpanningRef(ref);
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
        store[ref] = splitItems[ref];
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
        if (!this.linksLoaded(ref[i])) { return false}
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
     return links.filter(function(link){
        return (filter.length == 0 ||
                Sefaria.util.inArray(link.category, filter) !== -1 || 
                Sefaria.util.inArray(link.commentator, filter) !== -1 );
      }); 
  },
  _linkSummaries: {},
  linkSummary: function(ref) {
    // Returns an ordered array summarizing the link counts by category and text
    // Takes either a single string `ref` or an array of string refs.
    if (typeof ref == "string") {
      if (ref in this._linkSummaries) { return this._linkSummaries[ref]; }
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
      if (link.commentator in category.books) {
        category.books[link.commentator].count += 1;
      } else {
        category.books[link.commentator] = {count: 1};
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
          if (!(l.commentator in summary["Commentary"].books)) {
            summary["Commentary"].books[l.commentator] = {count: 0};
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
        bookData.category = index.categories[0];
        return bookData;
      });
      // Sort the books in the category
      categoryData.books.sort(function(a, b) { 
        // First sort by predefined "top"
        var topByCategory = {
          "Tanakh": ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
          "Talmud": ["Rashi", "Tosafot"]
        };
        var cat = oRef ? oRef["categories"][0] : null;
        var top = topByCategory[cat] || [];
        var aTop = top.indexOf(a.book);
        var bTop = top.indexOf(b.book);
        if (aTop !== -1 || bTop !== -1) {
          aTop = aTop === -1 ? 999 : aTop;
          bTop = bTop === -1 ? 999 : bTop;
          return aTop < bTop ? -1 : 1;
        }
        // Then sort alphabetically
        return a.book > b.book ? 1 : -1; 
      });
      return categoryData;
    });
    // Sort the categories
    summaryList.sort(function(a, b) {
      // always put Commentary first 
      if      (a.category === "Commentary") { return -1; }
      else if (b.category === "Commentary") { return  1; }
      // always put Modern Works last
      if      (a.category === "Modern Works") { return  1; }
      else if (b.category === "Modern Works") { return -1; }
      return b.count - a.count;
    });
    return summaryList;
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
       var url = "/api/notes/" + Sefaria.normRef(ref) + "?private=1";
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
    notes.push(note);
    this._saveItemsByRef(notes, this._privateNotes);
  },
  clearPrivateNotes: function() {
    this._privateNotes = {};
  },
  _savePrivateNoteData: function(ref, data) {
    if (data.length) {
      this._saveItemsByRef(data, this._privateNotes); 
    } else {
      this._privateNotes[ref] = [];
    }
  },
  _related: {},
  related: function(ref, callback) {
    // Single API to bundle links, sheets, and notes by ref.
    if (!callback) {
      return this._related[ref] || null;
    }
    if (ref in this._related) {
      callback(this._related[ref]);
    } else {
       var url = "/api/related/" + Sefaria.normRef(ref);
       this._api(url, function(data) {
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
          this._relatedSummaries[ref] = null; // Reset in case previously cached before API returned

          callback(data);

        }.bind(this));
    }
  },
  _relatedSummaries: {},
  relatedSummary: function(ref) {
    // Returns a summary object of all categories of related content.
    if (typeof ref == "string") {
      if (ref in this._relatedSummaries) { return this._relatedSummaries[ref]; }
      var sheets = this.sheets.sheetsByRef(ref) || [];
      var notes  = this.notes(ref) || [];
    } else {
      var sheets = [];
      var notes  = [];
      ref.map(function(r) {
        var newSheets = Sefaria.sheets.sheetsByRef(r);
        sheets = newSheets ? sheets.concat(newSheets) : sheets;
        var newNotes = Sefaria.notes(r);
        notes = newNotes ? notes.concat(newNotes) : notes;
      });
    }
    var summary           = this.linkSummary(ref);
    var commmunityContent = [sheets, notes].filter(function(section) { return section.length > 0; } ).map(function(section) {
      if (!section) { debugger; }
      return {
        book: section[0].category,
        heBook: Sefaria.hebrewCategory(section[0].category),
        category: "Community",
        count: section.length
      };
    });
    var community = {
      category: "Community",
      count: sheets.length + notes.length,
      books: commmunityContent
    };
    if (community.count > 0) {
      summary.push(community);
    }
    this._relatedSummaries[ref] = summary;
    return summary;
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
  commentaryList: function(title) {
    // Returns the list of commentaries for 'title' which are found in Sefaria.toc
    var index = this.index(title);
    if (!index) { return []; }
    var cats   = [index.categories[0], "Commentary"];
    var branch = this.tocItemsByCategories(cats);
    var commentariesInBranch = function(title, branch) {
      // Recursively walk a branch of TOC, return a list of all commentaries found on `title`.
      var results = [];
      for (var i=0; i < branch.length; i++) {
        if (branch[i].title) {
          var split = branch[i].title.split(" on ");
          if (split.length == 2 && split[1] === title) {
            results.push(branch[i]);
          }
        } else {
          results = results.concat(commentariesInBranch(title, branch[i].contents));
        }
      }
      return results;
    };
    return commentariesInBranch(title, branch);
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
    return list;
  },
  sheets: {
    _trendingTags: null,
    trendingTags: function(callback) {
      // Returns a list of trending tags -- source sheet tags which have been used often recently.
      var tags = this._trendingTags;
      if (tags) {
        if (callback) { callback(tags); }
      } else {
        var url = "/api/sheets/trending-tags";
         Sefaria._api(url, function(data) {
            this._trendingTags = data;
            if (callback) { callback(data); }
          }.bind(this));
        }
      return tags;
    },
    _tagList: {},
    tagList: function(sortBy, callback) {
      // Returns a list of all public source sheet tags, ordered by populartiy
      sortBy = typeof sortBy == "undefined" ? "count" : sortBy;
      var tags = this._tagList[sortBy];
      if (tags) {
        if (callback) { callback(tags); }
      } else if ("count" in this._tagList && sortBy == "alpha") {
        // If we have one set of ordered tags already, we can do sorts locally.
        var tags = this._tagList["count"].slice();
        tags.sort(function(a, b) {
          return a.tag > b.tag ? 1 : -1;
        });
        this._tagList["alpha"] = tags;
      } else {
        var url = "/api/sheets/tag-list/" + sortBy;
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
        var url = "/api/sheets/tag-list/user/"+uid;
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
        var url = "/api/sheets/tag/" + tag;
         $.getJSON(url, function(data) {
            this._sheetsByTag[tag] = data.sheets;
            if (callback) { callback(data.sheets); }
          }.bind(this));
        }
      return sheets;
    },
    _groupTagList: null,
    groupTagList: function(partner, callback) {
      // Returns a list of all public source sheet tags, ordered by populartiy
      var tags = this._groupTagList;
      if (tags) {
        if (callback) { callback(tags); }
      } else {
        var url = "/api/partners/tag-list/"+partner;
         Sefaria._api(url, function(data) {
            this._groupTagList = data;
             if (callback) { callback(data); }
          }.bind(this));
        }
      return tags;
    },

    _partnerSheets: {},
    partnerSheets: function(partner, callback, sortBy) {
      // Returns a list of source sheets belonging to partner org
      // Member of group will get all sheets. Others only public facing ones.
      sortBy = typeof sortBy == "undefined" ? "date" : sortBy;
      var sheets = this._partnerSheets[partner];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = "/api/partners/"+partner;
         Sefaria._api(url, function(data) {
            this._partnerSheets[partner] = data.sheets;
            if (callback) { callback(data.sheets); }
          }.bind(this));

        }
      return sheets;
    },
    _userSheets: {},
    userSheets: function(uid, callback, sortBy) {
      // Returns a list of source sheets belonging to `uid`
      // Only a user logged in as `uid` will get data back from this API call.
      sortBy = typeof sortBy == "undefined" ? "date" : sortBy;
      var sheets = this._userSheets[uid+sortBy];
      if (sheets) {
        if (callback) { callback(sheets); }
      } else {
        var url = "/api/sheets/user/" + uid + "/" + sortBy;
         Sefaria._api(url, function(data) {
            this._userSheets[uid+sortBy] = data.sheets;
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
        var url = "/api/sheets/all-sheets/"+numberToRetrieve+"/"+offset;
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
        var url = "/api/sheets/all-sheets/3/0";
        Sefaria._api(url, function(data) {
          this._topSheets = data.sheets;
          if (callback) { callback(data.sheets); }
        }.bind(this));
      }
      return sheets;
    },
    clearUserSheets: function(uid) {
      this._userSheets[uid] = null;
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
    }
  },
  hebrewCategory: function(cat) {
    // Returns a string translating `cat` into Hebrew.
    var categories = {
      "Torah":                "תורה",
      "Tanakh":               'תנ"ך',
      "Tanakh":               'תנ"ך',
      "Prophets":             "נביאים",
      "Writings":             "כתובים",
      "Commentary":           "מפרשים",
      "Quoting Commentary":   "פרשנות מצטטת",
      "Targum":               "תרגומים",
      "Mishnah":              "משנה",
      "Tosefta":              "תוספתא",
      "Talmud":               "תלמוד",
      "Bavli":                "בבלי",
      "Yerushalmi":           "ירושלמי",
      "Rif":                  'רי"ף',
      "Kabbalah":             "קבלה",
      "Halakha":              "הלכה",
      "Halakhah":             "הלכה",
      "Midrash":              "מדרש",
      "Aggadic Midrash":      "מדרש אגדה",
      "Halachic Midrash":     "מדרש הלכה",
      "Midrash Rabbah":       "מדרש רבה",
      "Responsa":             'שו"ת',
      "Rashba":               'רשב"א',
      "Rambam":               'רמב"ם',
      "Other":                "אחר",
      "Siddur":               "סידור",
      "Liturgy":              "תפילה",
      "Piyutim":              "פיוטים",
      "Musar":                "ספרי מוסר",
      "Chasidut":             "חסידות",
      "Parshanut":            "פרשנות",
      "Philosophy":           "מחשבת ישראל",
      "Apocrypha":            "ספרים חיצונים",
      "Modern Works":         "עבודות מודרניות",
      "Seder Zeraim":         "סדר זרעים",
      "Seder Moed":           "סדר מועד",
      "Seder Nashim":         "סדר נשים",
      "Seder Nezikin":        "סדר נזיקין",
      "Seder Kodashim":       "סדר קדשים",
      "Seder Toharot":        "סדר טהרות",
      "Seder Tahorot":        "סדר טהרות",
      "Dictionary":           "מילון",
      "Early Jewish Thought": "מחשבת ישראל קדומה",
      "Minor Tractates":      "מסכתות קטנות",
      "Rosh":                 'ר"אש',
      "Maharsha":             'מהרשא',
      "Mishneh Torah":        "משנה תורה",
      "Shulchan Arukh":       "שולחן ערוך",
      "Sheets":               "דפי מקורות",
      "Notes":                "הערות",
      "Community":            "קהילה"
    };
    return cat in categories ? categories[cat] : cat;
  },
  hebrewSectionName: function(name) {
    sectionNames = {
      "Chapter":          "פרק",
      "Chapters":         "פרקים",
      "Perek":            "פרק",
      "Line":             "שורה",
      "Negative Mitzvah": "מצות לא תעשה",
      "Positive Mitzvah": "מצות עשה",
      "Negative Mitzvot": "מצוות לא תעשה",
      "Positive Mitzvot": "מצוות עשה",
      "Daf":              "דף",
      "Paragraph":        "פסקה",
      "Parsha":           "פרשה",
      "Parasha":          "פרשה",
      "Parashah":         "פרשה",
      "Seif":             "סעיף",
      "Se'if":            "סעיף",
      "Siman":            "סימן",
      "Section":          "חלק",
      "Verse":            "פסוק",
      "Sentence":         "משפט",
      "Sha'ar":           "שער",
      "Gate":             "שער",
      "Comment":          "פירוש",
      "Phrase":           "ביטוי",
      "Mishna":           "משנה",
      "Chelek":           "חלק",
      "Helek":            "חלק",
      "Year":             "שנה",
      "Masechet":         "מסכת",
      "Massechet":        "מסכת",
      "Letter":           "אות",
      "Halacha":          "הלכה",
      "Piska":            "פסקה",
      "Seif Katan":       "סעיף קטן",
      "Se'if Katan":      "סעיף קטן",
      "Volume":           "כרך",
      "Book":             "ספר",
      "Shar":             "שער",
      "Seder":            "סדר",
      "Part":             "חלק",
      "Pasuk":            "פסוק",
      "Sefer":            "ספר",
      "Teshuva":          "תשובה",
      "Teshuvot":         "תשובות",
      "Tosefta":          "תוספתא",
      "Halakhah":         "הלכה",
      "Kovetz":           "קובץ",
      "Path":             "נתיב",
      "Parshah":          "פרשה",
      "Midrash":          "מדרש",
      "Mitzvah":          "מצוה",
      "Tefillah":         "תפילה",
      "Torah":            "תורה",
      "Perush":           "פירוש",
      "Peirush":          "פירוש",
      "Aliyah":           "עלייה",
      "Tikkun":           "תיקון",
      "Tikkunim":         "תיקונים",
      "Hilchot":          "הילכות",
      "Topic":            "נושא",
      "Contents":         "תוכן",
      "Article":          "סעיף",
      "Shoresh":          "שורש",
      "Story":            "סיפור",
      "Remez":            "רמז"
    };
    return name in sectionNames ? sectionNames[name] : name;
  },
  search: {
      baseUrl: Sefaria.searchBaseUrl + "/" + Sefaria.searchIndex + "/_search",
      _cache: {},
      cache: function(key, result) {
          if (result !== undefined) {
             this._cache[key] = result;
          }
          return this._cache[key]
      },
      execute_query: function (args) {
          // To replace sjs.search.post in search.js

          /* args can contain
           query: query string
           size: size of result set
           from: from what result to start
           type: null, "sheet" or "text"
           get_filters: if to fetch initial filters
           applied_filters: filter query by these filters
           success: callback on success
           error: callback on error
           */
          if (!args.query) {
              return;
          }
          var req = JSON.stringify(Sefaria.search.get_query_object(args.query, args.get_filters, args.applied_filters, args.size, args.from, args.type));
          var cache_result = this.cache(req);
          if (cache_result) {
              args.success(cache_result);
              return null;
          }
          var url = Sefaria.search.baseUrl;

          return $.ajax({
              url: url,
              type: 'POST',
              data: req,
              crossDomain: true,
              processData: false,
              dataType: 'json',
              success: function(data) {
                  this.cache(req, data);
                  args.success(data);
              }.bind(this),
              error: args.error
          });
      },
      get_query_object: function (query, get_filters, applied_filters, size, from, type) {
          /*
           Only the first argument - "query" - is required.

           query: string
           get_filters: boolean
           applied_filters: null or list of applied filters (in format supplied by Filter_Tree...)
           size: int - number of results to request
           from: int - start from result # (skip from - 1 results)
           type: string - currently either "texts" or "sheets"
           */


          var core_query = {
              "query_string": {
                  "query": query.replace(/(\S)"(\S)/g, '$1\u05f4$2'), //Replace internal quotes with gershaim.
                  "default_operator": "AND",
                  "fields": ["content"]
              }
          };

          var o = {
              "from": from,
              "size": size,
              "sort": [{
                  "order": {}                 // the sort field name is "order"
              }],
              "_source": {
                "exclude": [ "content" ]
              },
              "highlight": {
                  "pre_tags": ["<b>"],
                  "post_tags": ["</b>"],
                  "fields": {
                      "content": {"fragment_size": 200}
                  }
              }
          };

          if (get_filters) {
              //Initial, unfiltered query.  Get potential filters.
              if (type) {
                o['query'] = {
                    filtered: {
                        query: core_query,
                        filter: {type: {value: type}}
                    }
                };
              } else {
                o['query'] = core_query;
              }

              o['aggs'] = {
                  "category": {
                      "terms": {
                          "field": "path",
                          "size": 0
                      }
                  },
                  "type": {
                      "terms": {
                          "field": "_type",
                          "size": 0
                      }
                  }
              };
          } else if (!applied_filters || applied_filters.length == 0) {
              // This is identical to above - can be cleaned up into a variable
              if (type) {
                o['query'] = {
                    filtered: {
                        query: core_query,
                        filter: {type: {value: type}}
                    }
                };
              } else {
                o['query'] = core_query;
              }
          } else {
              //Filtered query.  Add clauses.  Don't re-request potential filters.
              var clauses = [];
              for (var i = 0; i < applied_filters.length; i++) {
                  clauses.push({
                      "regexp": {
                          "path": RegExp.escape(applied_filters[i]) + ".*"
                      }
                  });
                  /* Test for Commentary2 as well as Commentary */
                  if (/^Commentary\//.test(applied_filters[i])) {
                      var c2 = "Commentary2/" + applied_filters[i].slice(11);
                      clauses.push({
                          "regexp": {
                              "path": RegExp.escape(c2) + ".*"
                          }
                      });
                  }
              }
              if (type) {
                  o['query'] = {
                      "filtered": {
                          "query": core_query,
                          "filter": {
                              "bool": {
                                  "must": [
                                      {"or": clauses},
                                      {type: {value: type}}
                                  ]
                              }
                          }
                      }
                  };
              } else {
                  o['query'] = {
                      "filtered": {
                          "query": core_query,
                          "filter": {
                              "or": clauses
                          }
                      }
                  };
              }
              o['aggs'] = {
                  "type": {
                      "terms": {
                          "field": "_type",
                          "size": 0
                      }
                  }
              };
          }
          return o;
      },

      //FilterTree object - for category filters
      FilterNode: function() {
        this.children = [];
        this.parent = null;
        this.selected = 0; //0 - not selected, 1 - selected, 2 - partially selected
      }
  },  
  _makeBooksDict: function() {
    // Transform books array into a dictionary for quick lookup
    // Which is worse: the cycles wasted in computing this on the client
    // or the bandwitdh wasted in letting the server computer once and trasmiting the same data twice in differnt form?
    for (var i = 0; i < this.books.length; i++) {
      this.booksDict[this.books[i]] = 1;
    }    
  },
  _apiCallbacks: {},
  _api: function(url, callback) {
    // Manage API calls and callbacks to prevent duplicate calls
    if (url in this._apiCallbacks) {
      this._apiCallbacks[url].push(callback);
    } else {
      this._apiCallbacks[url] = [callback];
      $.getJSON(url, function(data) {
        var callbacks = this._apiCallbacks[url];
        for (var i = 0; i < callbacks.length; i++) {
          callbacks[i](data);
        }
        delete this._apiCallbacks[url];
      }.bind(this));
    }
  }
});

Sefaria.unpackDataFromProps = function(props) {
  // Populate local cache with various data passed as a rider on props.
  var initialPanels = props.initialPanels || [];
  for (var i = 0; i < initialPanels.length; i++) {
      var panel = initialPanels[i];
      if (panel.text) {
        var settings = {context: 1, version: panel.version, language: panel.versionLanguage};
        Sefaria._saveText(panel.text, settings);
      }
      if (panel.indexDetails) {
        Sefaria._indexDetails[panel.bookRef] = panel.indexDetails;
      }
      if (panel.versions) {
        Sefaria._versions[panel.bookRef] = panel.versions;
      }
  }
  if (props.userSheets) {
    Sefaria.sheets._userSheets[Sefaria._uid + "date"] = props.userSheets;
  }
  if (props.userTags) {
    Sefaria.sheets._userTagList = props.userTags;
  }
  if (props.partnerSheets) {
    Sefaria.sheets._partnerSheets[props.initialPartner] = props.partnerSheets;
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
};

Sefaria.search.FilterNode.prototype = {
  append : function(child) {
      this.children.push(child);
      child.parent = this;
  },
  hasChildren: function() {
      return (this.children.length > 0);
  },
  getLeafNodes: function() {
      //Return ordered array of leaf (book) level filters
      if (!this.hasChildren()) {
          return this;
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getLeafNodes());
      }
      return results;
  },
  getId: function() {
      return this.path.replace(new RegExp("[/',()]", 'g'),"-").replace(new RegExp(" ", 'g'),"_");
  },
  isSelected: function() {
      return (this.selected == 1);
  },
  isPartial: function() {
      return (this.selected == 2);
  },
  isUnselected: function() {
      return (this.selected == 0);
  },
  setSelected : function(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 1;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setSelected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }
  },
  setUnselected : function(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 0;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setUnselected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }

  },
  setPartial : function() {
      //Never propogate to children.  Always propogate to parents
      this.selected = 2;
      if(this.parent) this.parent._deriveState();
  },
  _deriveState: function() {
      //Always called from children, so we can assume at least one
      var potentialState = this.children[0].selected;
      if (potentialState == 2) {
          this.setPartial();
          return
      }
      for (var i = 1; i < this.children.length; i++) {
          if (this.children[i].selected != potentialState) {
              this.setPartial();
              return
          }
      }
      //Don't use setters, so as to avoid looping back through children.
      if(potentialState == 1) {
          this.setSelected(true, true);
      } else {
          this.setUnselected(true, true);
      }
  },
  hasAppliedFilters: function() {
      return (this.getAppliedFilters().length > 0)
  },
  getAppliedFilters: function() {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          return[this.path];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getAppliedFilters());
      }
      return results;
  },
  getSelectedTitles: function(lang) {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          return[(lang == "en")?this.title:this.heTitle];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getSelectedTitles(lang));
      }
      return results;
  }
};


Sefaria.util = {
    clone: function clone(obj) {
        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            var copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            var copy = [];
            var len = obj.length;
            for (var i = 0; i < len; ++i) {
                copy[i] = clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    },
    throttle: function(func, limit) {
      // Returns a functions which throttle `func`
        var wait = false;                 // Initially, we're not waiting
        return function () {              // We return a throttled function
            if (!wait) {                  // If we're not waiting
                func.call();          // Execute users function
                wait = true;              // Prevent future invocations
                setTimeout(function () {  // After a period of time
                    wait = false;         // And allow future invocations
                }, limit);
            }
        }
    },
    debounce: function(func, wait, immediate) {
      // Returns a function which debounces `func`
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    },
    inArray: function(needle, haystack) {
      if (!haystack) { return -1 } //For parity of behavior w/ JQuery inArray
      var index = -1;
      for (var i = 0; i < haystack.length; i++) {
        if (haystack[i] === needle) {
          index = i;
          break;
        }
      }
      return index;
    },
    _defaultPath: "/",
    currentPath: function() {
      // Returns the current path plus search string if a browser context
      // or "/" in a browser-less context.
      return (typeof window === "undefined" ) ? Sefaria.util._defaultPath :
                window.location.pathname + window.location.search;
    },
    parseURL: function(url) {
      var a =  document.createElement('a');
      a.href = url;
      return {
        source: url,
        protocol: a.protocol.replace(':',''),
        host: a.hostname,
        port: a.port,
        query: a.search,
        params: (function(){
          var ret = {},
            seg = a.search.replace(/^\?/,'').split('&'),
            len = seg.length, i = 0, s;
          for (;i<len;i++) {
            if (!seg[i]) { continue; }
            s = seg[i].split('=');
            ret[s[0]] = s[1];
          }
          return ret;
        })(),
        file: (a.pathname.match(/\/([^\/?#]+)$/i) || [,''])[1],
        hash: a.hash.replace('#',''),
        path: a.pathname.replace(/^([^\/])/,'/$1'),
        relative: (a.href.match(/tps?:\/\/[^\/]+(.+)/) || [,''])[1],
        segments: a.pathname.replace(/^\//,'').split('/')
      };
    },
    isValidEmailAddress: function(emailAddress) {
      var pattern = new RegExp(/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i);
      return pattern.test(emailAddress);
    },
    _cookies: {},
    cookie: function(key, value) {
     // Mock cookie function to mirror $.cookie for use Server Side
     if (typeof value === "undefined") {
      return Sefaria.util._cookies[key];
     }
     Sefaria.util._cookies[key] = value;
    },  
    setupPrototypes: function() {

        String.prototype.toProperCase = function() {
          // Treat anything after ", " as a new clause
          // so that titles like "Orot, The Ideals of Israel" keep a capital The
          var clauses = this.split(", ");

          for (var n = 0; n < clauses.length; n++) {
              var i, j, str, lowers, uppers;
              str = clauses[n].replace(/([^\W_]+[^\s-]*) */g, function(txt) {
                // We're not lowercasing the end of the string because of cases like "HaRambam"
                return txt.charAt(0).toUpperCase() + txt.substr(1);
              });

              // Certain minor words should be left lowercase unless 
              // they are the first or last words in the string
              lowers = ['A', 'An', 'The', 'And', 'But', 'Or', 'For', 'Nor', 'As', 'At', 
              'By', 'For', 'From', 'Is', 'In', 'Into', 'Near', 'Of', 'On', 'Onto', 'To', 'With'];
              for (i = 0, j = lowers.length; i < j; i++) {
                str = str.replace(new RegExp('\\s' + lowers[i] + '\\s', 'g'), 
                  function(txt) {
                    return txt.toLowerCase();
                  });
               }

              // Certain words such as initialisms or acronyms should be left uppercase
              uppers = ['Id', 'Tv', 'Ii', 'Iii', "Iv"];
              for (i = 0, j = uppers.length; i < j; i++) {
                str = str.replace(new RegExp('\\b' + uppers[i] + '\\b', 'g'), 
                  uppers[i].toUpperCase());
              }

              clauses[n] = str;     
          }

          return clauses.join(", ");
        };

        String.prototype.toFirstCapital = function() {
            return this.charAt(0).toUpperCase() + this.substr(1);
        };

        String.prototype.stripHtml = function() {
           if (INBROWSER) {
             var tmp = document.createElement("div");
             tmp.innerHTML = this;
             return tmp.textContent|| "";            
           } else {
            return striptags(this);
           }
        };

        String.prototype.escapeHtml = function() {
            return this.replace(/&/g,'&amp;')
                        .replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;')
                        .replace(/'/g,'&apos;')
                        .replace(/"/g,'&quot;')
                        .replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
        };

        if (!String.prototype.startsWith) {
            String.prototype.startsWith = function(searchString, position){
              position = position || 0;
              return this.substr(position, searchString.length) === searchString;
          };
        }

        Array.prototype.compare = function(testArr) {
            if (this.length != testArr.length) return false;
            for (var i = 0; i < testArr.length; i++) {
                if (this[i].compare) { 
                    if (!this[i].compare(testArr[i])) return false;
                }
                if (this[i] !== testArr[i]) return false;
            }
            return true;
        };

        Array.prototype.pad = function(s,v) {
            var l = Math.abs(s) - this.length;
            var a = [].concat(this);
            if (l <= 0)
              return a;
            for(var i=0; i<l; i++)
              s < 0 ? a.unshift(v) : a.push(v);
            return a;
        };

        Array.prototype.unique = function() {
            var a = [];
            var l = this.length;
            for(var i=0; i<l; i++) {
              for(var j=i+1; j<l; j++) {
                // If this[i] is found later in the array
                if (this[i] === this[j])
                  j = ++i;
              }
              a.push(this[i]);
            }
            return a;
        };

        Array.prototype.toggle = function(value) {
            var index = this.indexOf(value);

            if (index === -1) {
                this.push(value);
            } else {
                this.splice(index, 1);
            }
            return this;
        };

        Array.prototype.move = function (old_index, new_index) {
            if (new_index >= this.length) {
                var k = new_index - this.length;
                while ((k--) + 1) {
                    this.push(undefined);
                }
            }
            this.splice(new_index, 0, this.splice(old_index, 1)[0]);
            return this; // for testing purposes
        };

        if (!Array.prototype.fill) {
          Object.defineProperty(Array.prototype, 'fill', {
            value: function(value) {

              if (this == null) {
                throw new TypeError('this is null or not defined');
              }

              var O = Object(this);
              var len = O.length >>> 0;

              var start = arguments[1];
              var relativeStart = start >> 0;
              var k = relativeStart < 0 ?
                Math.max(len + relativeStart, 0) :
                Math.min(relativeStart, len);
              var end = arguments[2];
              var relativeEnd = end === undefined ?
                len : end >> 0;
              var final = relativeEnd < 0 ?
                Math.max(len + relativeEnd, 0) :
                Math.min(relativeEnd, len);
              while (k < final) {
                O[k] = value;
                k++;
              }
              return O;
            }
          });
        }

        RegExp.escape = function(s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };
    },
    setupJQuery: function() {
        if (!$.hasOwnProperty("fn")) { return; }
        $.fn.serializeObject = function() {
            var o = {};
            var a = this.serializeArray();
            $.each(a, function() {
                if (o[this.name] !== undefined) {
                    if (!o[this.name].push) {
                        o[this.name] = [o[this.name]];
                    }
                    o[this.name].push(this.value || '');
                } else {
                    o[this.name] = this.value || '';
                }
            });
            return o;
        };
    /*!
         * jQuery Cookie Plugin v1.3
         * https://github.com/carhartl/jquery-cookie
         *
         * Copyright 2011, Klaus Hartl
         * Dual licensed under the MIT or GPL Version 2 licenses.
         * http://www.opensource.org/licenses/mit-license.php
         * http://www.opensource.org/licenses/GPL-2.0
         */
        (function ($, document, undefined) {

            var pluses = /\+/g;

            function raw(s) {
                return s;
            }

            function decoded(s) {
                return decodeURIComponent(s.replace(pluses, ' '));
            }

            var config = $.cookie = function (key, value, options) {

                // write
                if (value !== undefined) {
                    options = $.extend({}, config.defaults, options);

                    if (value === null) {
                        options.expires = -1;
                    }

                    if (typeof options.expires === 'number') {
                        var days = options.expires, t = options.expires = new Date();
                        t.setDate(t.getDate() + days);
                    }

                    value = config.json ? JSON.stringify(value) : String(value);

                    return (document.cookie = [
                        encodeURIComponent(key), '=', config.raw ? value : encodeURIComponent(value),
                        options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
                        options.path    ? '; path=' + options.path : '',
                        options.domain  ? '; domain=' + options.domain : '',
                        options.secure  ? '; secure' : ''
                    ].join(''));
                }

                // read
                var decode = config.raw ? raw : decoded;
                var cookies = document.cookie.split('; ');
                for (var i = 0, l = cookies.length; i < l; i++) {
                    var parts = cookies[i].split('=');
                    if (decode(parts.shift()) === key) {
                        var cookie = decode(parts.join('='));
                        return config.json ? JSON.parse(cookie) : cookie;
                    }
                }

                return null;
            };

            config.defaults = {};

            $.removeCookie = function (key, options) {
                if ($.cookie(key) !== null) {
                    $.cookie(key, null, options);
                    return true;
                }
                return false;
            };

        })($, document);

    },
    setupMisc: function() {
        /*
          classnames
          Copyright (c) 2015 Jed Watson.
          Licensed under the MIT License (MIT), see
          http://jedwatson.github.io/classnames
        */
        (function () {
            'use strict';

            function classNames () {

                var classes = '';

                for (var i = 0; i < arguments.length; i++) {
                    var arg = arguments[i];
                    if (!arg) continue;

                    var argType = typeof arg;

                    if ('string' === argType || 'number' === argType) {
                        classes += ' ' + arg;

                    } else if (Array.isArray(arg)) {
                        classes += ' ' + classNames.apply(null, arg);

                    } else if ('object' === argType) {
                        for (var key in arg) {
                            if (arg.hasOwnProperty(key) && arg[key]) {
                                classes += ' ' + key;
                            }
                        }
                    }
                }

                return classes.substr(1);
            }

            if (typeof module !== 'undefined' && module.exports) {
                module.exports = classNames;
            } else if (typeof define === 'function' && typeof define.amd === 'object' && define.amd){
                // AMD. Register as an anonymous module.
                define(function () {
                    return classNames;
                });
            } else {
                window.classNames = classNames;
            }

        }());

        // Protect against browsers without consoles and forgotten console statements
        if(typeof(console) === 'undefined') {
            var console = {};
            console.log = function() {};
        }
    },
    handleUserCookie: function() {
        var cookie = (typeof require !== 'undefined') ? Sefaria.util.cookie : $.cookie;

        if (Sefaria.loggedIn) {
            // If logged in, replace cookie with current system details

            var expires = new Date(); // starts with current time
            expires.setTime(expires.getTime() + 2 * 365 * 24 * 3600 * 1000);  // milliseconds

            cookie("_user", JSON.stringify({
               _uid: Sefaria._uid,
               _partner_group: Sefaria._partner_group,
               _partner_role: Sefaria._partner_role
            }), { path: "/", expires: expires });
            // And store current uid in analytics id
            Sefaria._analytics_uid = Sefaria._uid;
        } else { 
            // If not logged in, get details from cookie
            var c = cookie("_user");
            if (c) {
              c = JSON.parse(c);
              Sefaria._analytics_uid = c._uid;
              Sefaria._partner_group = c._partner_group;
              Sefaria._partner_role = c._partner_role;
            }
        }

    },
    getSelectionBoundaryElement: function(isStart) {
        // http://stackoverflow.com/questions/1335252/how-can-i-get-the-dom-element-which-contains-the-current-selection
        var range, sel, container;
        if (document.selection) {
            range = document.selection.createRange();
            range.collapse(isStart);
            return range.parentElement();
        } else {
            sel = window.getSelection();
            if (sel.getRangeAt) {
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0);
                }
            } else {
                // Old WebKit
                range = document.createRange();
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);
    
                // Handle the case when the selection was selected backwards (from the end to the start in the document)
                if (range.collapsed !== sel.isCollapsed) {
                    range.setStart(sel.focusNode, sel.focusOffset);
                    range.setEnd(sel.anchorNode, sel.anchorOffset);
                }
           }
    
            if (range) {
               container = range[isStart ? "startContainer" : "endContainer"];
    
               // Check if the container is a text node and return its parent if so
               return container.nodeType === 3 ? container.parentNode : container;
            }   
        }
    }
};


Sefaria.hebrew = {
  hebrewNumerals: { 
    "\u05D0": 1,
    "\u05D1": 2,
    "\u05D2": 3,
    "\u05D3": 4,
    "\u05D4": 5,
    "\u05D5": 6,
    "\u05D6": 7,
    "\u05D7": 8,
    "\u05D8": 9,
    "\u05D9": 10,
    "\u05D8\u05D5": 15,
    "\u05D8\u05D6": 16,
    "\u05DB": 20,
    "\u05DC": 30,
    "\u05DE": 40,
    "\u05E0": 50,
    "\u05E1": 60,
    "\u05E2": 70,
    "\u05E4": 80,
    "\u05E6": 90,
    "\u05E7": 100,
    "\u05E8": 200,
    "\u05E9": 300,
    "\u05EA": 400,
    "\u05EA\u05E7": 500,
    "\u05EA\u05E8": 600,
    "\u05EA\u05E9": 700,
    "\u05EA\u05EA": 800,
    1: "\u05D0",
    2: "\u05D1",
    3: "\u05D2",
    4: "\u05D3",
    5: "\u05D4",
    6: "\u05D5",
    7: "\u05D6",
    8: "\u05D7",
    9: "\u05D8",
    10: "\u05D9",
    15: "\u05D8\u05D5",
    16: "\u05D8\u05D6",
    20: "\u05DB",
    30: "\u05DC",
    40: "\u05DE",
    50: "\u05E0",
    60: "\u05E1",
    70: "\u05E2",
    80: "\u05E4",
    90: "\u05E6",
    100: "\u05E7",
    200: "\u05E8",
    300: "\u05E9",
    400: "\u05EA",
    500: "\u05EA\u05E7",
    600: "\u05EA\u05E8",
    700: "\u05EA\u05E9",
    800: "\u05EA\u05EA"
  },
  decodeHebrewNumeral: function(h) {
    // Takes a string representing a Hebrew numeral and returns it integer value. 
    var values = Sefaria.hebrew.hebrewNumerals;

    if (h === values[15] || h === values[16]) {
      return values[h];
    } 
    
    var n = 0
    for (c in h) {
      n += values[h[c]];
    }

    return n;
  },
  encodeHebrewNumeral: function(n) {
    // Takes an integer and returns a string encoding it as a Hebrew numeral. 
    if (n >= 900) {
      return n;
    }

    var values = Sefaria.hebrew.hebrewNumerals;

    if (n === 15 || n === 16) {
      return values[n];
    }
    
    var heb = "";
    if (n >= 100) { 
      var hundreds = n - (n % 100);
      heb += values[hundreds];
      n -= hundreds;
    } 
    if (n >= 10) {
      var tens = n - (n % 10);
      heb += values[tens];
      n -= tens;
    }
    
    if (n > 0) {
      heb += values[n]; 
    } 
    
    return heb;
  },
  encodeHebrewDaf: function(daf, form) {
    // Ruturns Hebrew daf strings from "32b"
    var form = form || "short"
    var n = parseInt(daf.slice(0,-1));
    var a = daf.slice(-1);
    if (form === "short") {
      a = {a: ".", b: ":"}[a];
      return Sefaria.hebrew.encodeHebrewNumeral(n) + a;
    }   
    else if (form === "long"){
      a = {a: 1, b: 2}[a];
      return Sefaria.hebrew.encodeHebrewNumeral(n) + " " + Sefaria.hebrew.encodeHebrewNumeral(a);
    }
  },
  stripNikkud: function(rawString) {
    return rawString.replace(/[\u0591-\u05C7]/g,"");
  },
  isHebrew: function(text) {
    // Returns true if text is (mostly) Hebrew
    // Examines up to the first 60 characters, ignoring punctuation and numbers
    // 60 is needed to cover cases where a Hebrew text starts with 31 chars like: <big><strong>גמ׳</strong></big>
    var heCount = 0;
    var enCount = 0;
    var punctuationRE = /[0-9 .,'"?!;:\-=@#$%^&*()/<>]/;

    for (var i = 0; i < Math.min(60, text.length); i++) {
      if (punctuationRE.test(text[i])) { continue; }
      if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
        heCount++;
      } else {
        enCount++;
      }
    }

    return (heCount >= enCount);
  },
  containsHebrew: function(text) {
    // Returns true if there are any Hebrew characters in text
    for (var i = 0; i < text.length; i++) {
      if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
        return true;
      }
    }
    return false;
  },
  hebrewPlural: function(s) {
    var known = {
      "Daf":      "Dappim",
      "Mitzvah":  "Mitzvot",
      "Mitsva":   "Mitzvot",
      "Mesechet": "Mesechtot",
      "Perek":    "Perokim",
      "Siman":    "Simanim",
      "Seif":     "Seifim",
      "Se'if":    "Se'ifim",
      "Mishnah":  "Mishnayot",
      "Mishna":   "Mishnayot",
      "Chelek":   "Chelekim",
      "Parasha":  "Parshiot",
      "Parsha":   "Parshiot",
      "Pasuk":    "Psukim",
      "Midrash":  "Midrashim",
      "Aliyah":   "Aliyot"
    };

    return (s in known ? known[s] : s + "s");
  },
  intToDaf: function(i) {
    i += 1;
    daf = Math.ceil(i/2);
    return daf + (i%2 ? "a" : "b");
  },
  dafToInt: function(daf) {
    amud = daf.slice(-1)
    i = parseInt(daf.slice(0, -1)) - 1;
    i = amud == "a" ? i * 2 : i*2 +1;
    return i;
  }
};

Sefaria.site = { 
  track: {
    // Helper functions for event tracking (with Google Analytics and Mixpanel)
    event: function(category, action, label, value, options) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/command-queue-reference#send
        ga('send', 'event', category, action, label, value, options);
        //mixpanel.track(category + " " + action, {label: label});
    },
    pageview: function(url) {
        ga('set', 'page', url);
        ga('send', 'pageview');
    },
    setPrimaryCategory: function(category_name) {
        ga('set', 'contentGroup1', category_name);
    },
    setSecondaryCategory: function(category_name) {
        ga('set', 'contentGroup2', category_name);
    },
    setContentLanguage: function(language) {
        ga('set', 'contentGroup5', language);
    },
    setNumberOfPanels: function(val) {
        ga('set', 'dimension1', val);
    },
    setBookName: function(val) {
        ga('set', 'dimension2', val);
        ga('set', 'contentGroup3', val);
    },
    setRef: function(val) {
        ga('set', 'dimension3', val);
    },
    setVersionTitle: function(val) {
        ga('set', 'dimension4', val);
    },
    setPageType: function(val) {
        ga('set', 'dimension5', val);
    },
    setSidebars: function(val) {
        ga('set', 'dimension6', val);
    },
    setUserLoggedIn: function(bool) {
        ga('set', 'dimension7', bool? "Logged In": "Logged Out");
    },
    setUserPartnerGroup: function(val) {
        ga('set', 'dimension8', val);
    },
    setUserPartnerRole: function(val) {
        ga('set', 'dimension9', val);
    },
    setUserID: function(val) {
        sval = String(val);
        ga('set', 'userId', sval);
        ga('set', 'dimension10', sval);
    },
    setUserData: function() {
        Sefaria.site.track.setUserLoggedIn(Sefaria.loggedIn);
        if (Sefaria._partner_group) Sefaria.site.track.setUserPartnerGroup(Sefaria._partner_group);
        if (Sefaria._partner_role) Sefaria.site.track.setUserPartnerRole(Sefaria._partner_role);
        if (Sefaria._analytics_uid) Sefaria.site.track.setUserID(Sefaria._analytics_uid);
    },
    sheets: function(action, label) {
        Sefaria.site.track.event("Sheets", action, label);
    },
    exploreUrl: function(url) {
        Sefaria.site.track.event("Explorer", "Open", url);
        Sefaria.site.track.pageview(url);
    },
    exploreBook: function(book) {
        Sefaria.site.track.event("Explorer", "Book", book);
    },
    exploreBrush: function(book) {
        Sefaria.site.track.event("Explorer", "Brush", book);
    }
  }
};

Sefaria.palette = {
  colors: {
    darkteal:  "#004e5f",
    raspberry: "#7c406f",
    green:     "#5d956f",
    paleblue:  "#9ab8cb",
    blue:      "#4871bf",
    orange:    "#cb6158",
    lightpink: "#c7a7b4",
    darkblue:  "#073570",
    darkpink:  "#ab4e66",
    lavender:  "#7f85a9",
    yellow:    "#ccb479",
    purple:    "#594176",
    lightblue: "#5a99b7",
    lightgreen:"#97b386",
    red:       "#802f3e",
    teal:      "#00827f"  
  }
};
Sefaria.palette.categoryColors = {
  "Commentary":         Sefaria.palette.colors.blue,
  "Tanakh" :            Sefaria.palette.colors.darkteal,
  "Midrash":            Sefaria.palette.colors.green,
  "Mishnah":            Sefaria.palette.colors.lightblue,
  "Talmud":             Sefaria.palette.colors.yellow,
  "Halakhah":           Sefaria.palette.colors.red,
  "Kabbalah":           Sefaria.palette.colors.purple,
  "Philosophy":         Sefaria.palette.colors.lavender,
  "Liturgy":            Sefaria.palette.colors.darkpink,
  "Tosefta":            Sefaria.palette.colors.teal,
  "Parshanut":          Sefaria.palette.colors.paleblue,
  "Chasidut":           Sefaria.palette.colors.lightgreen,
  "Musar":              Sefaria.palette.colors.raspberry,
  "Responsa":           Sefaria.palette.colors.orange,
  "Apocrypha":          Sefaria.palette.colors.lightpink,
  "Other":              Sefaria.palette.colors.darkblue,
  "Quoting Commentary": Sefaria.palette.colors.orange,
  "Commentary2":        Sefaria.palette.colors.blue,
  "Sheets":             Sefaria.palette.colors.raspberry,
  "Community":          Sefaria.palette.colors.raspberry,
  "Targum":             Sefaria.palette.colors.lavender,
  "Modern Works":       Sefaria.palette.colors.raspberry
};
Sefaria.palette.categoryColor = function(cat) {
  if (cat in Sefaria.palette.categoryColors) {
    return Sefaria.palette.categoryColors[cat];
  }
  return "transparent";
};


Sefaria.setup = function() {
    Sefaria.util.setupPrototypes();
    Sefaria.util.setupJQuery();
    Sefaria.util.setupMisc();
    Sefaria.util.handleUserCookie();
    Sefaria._makeBooksDict();
    Sefaria._cacheIndexFromToc(Sefaria.toc);
    Sefaria.site.track.setUserData();
};
Sefaria.setup();

if (typeof module !== 'undefined') {
  module.exports = Sefaria;
}
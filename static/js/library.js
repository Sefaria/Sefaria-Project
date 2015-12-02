sjs = sjs || {};
// Dependancies: util.js, sjs.toc


sjs.library = {
  _texts: {},
  text: function(ref, settings, cb) {
    if (typeof ref == "object") { debugger; }
    var settings = settings || {};
    settings = {
      commentary: settings.commentary || 0,
      context:    settings.context || 0,
      pad:        settings.pad || 0
    };
    var key = this._textKey(ref, settings);
    if (!cb) {
      return this._texts[key];
    }          
    if (key in this._texts) {
      cb(this._texts[key]);
      return this._texts[key];
    } else {
       params = "?" + $.param(settings);
       var url = "/api/texts/" + normRef(ref) + params;
       this._api(url, function(data) {
          this._saveText(data, settings);
          cb(data);
        }.bind(this));
    }
  },
  _textKey: function(ref, settings) {
    // Returns a string used as a key for the cache object of `ref` given `settings`.
    var key = ref;
    if (settings) {
      key = settings.context ? key + "|CONTEXT" : key;
    }
    return key;
  },
  _saveText: function(data, settings) {
        if ("error" in data) { 
          //sjs.alert.message(data.error);
          return;
        }
        var settings     = settings || {};
        data             = this._wrapRefs(data);
        key              = this._textKey(data.ref, settings);
        this._texts[key] = data;
        if (data.ref == data.sectionRef) {
          this._splitTextSection(data);
        } else if (settings.context) {
          // Save a copy of the data at context level
          var newData        = clone(data);
          newData.ref        = data.sectionRef;
          newData.sections   = data.sections.slice(0,-1);
          newData.toSections = data.toSections.slice(0,-1);
          this._saveText(newData);
        }
        var index = {
          title:      data.indexTitle,
          heTitle:    data.heIndexTitle, // This is incorrect for complex texts
          categories: data.categories
        };
        this.index(index.title, index);
  },
  _splitTextSection: function(data) {
    // Takes data for a section level text and populates cache with segment levels.
    // Runs recursively for Refs above section level like "Rashi on Genesis 1".
    // Pad the shorter array to make stepping through them easier.
    var en = typeof data.text == "string" ? [data.text] : data.text;
    var he = typeof data.he == "string" ? [data.he] : data.he;
    var length = Math.max(en.length, he.length);
    var superSectionLevel = data.textDepth == data.sections.length + 1;
    var padContent = superSectionLevel ? [] : "";
    en = en.pad(length, "");
    he = he.pad(length, "");

    var delim = data.ref === data.book ? " " : ":";
    var start = data.textDepth == data.sections.length ? data.sections[data.textDepth-1] : 1;
    for (var i = 0; i < length; i++) {
      var ref          = data.ref + delim + (i+start);
      var sectionRef   = superSectionLevel ? sectionRef : ref;
      var segment_data = clone(data);
      $.extend(segment_data, {
        ref: ref,
        heRef: data.heRef + delim + encodeHebrewNumeral(i+start),
        text: en[i],
        he: he[i],
        sections: data.sections.concat(i+1),
        sectionRef: sectionRef,
        nextSegment: i+start == length ? data.next + delim + 1 : data.ref + delim + (i+start+1),
        prevSegment: i+start == 1      ? null : data.ref + delim + (i+start-1),
      });

      this._saveText(segment_data);
    }
  },
  _wrapRefs: function(data) {
    // Wraps citations found in text of data
    if (!data.text) { return data; }
    if (typeof data.text === "string") {
      data.text = sjs.wrapRefLinks(data.text);
    } else {
      data.text = data.text.map(sjs.wrapRefLinks);
    }
    return data;
  },
  _index: {},
  index: function(text, index) {
    // Cache for text index records
    if (!index) {
      return this._index[text];
    } else {
      this._index[text] = index;
    }
  },
  _cacheIndexFromToc: function(toc) {
    // Unpacks contents of sjs.toc and stores it in index cache.
    for (var i = 0; i < toc.length; i++) {
      if ("category" in toc[i]) {
        sjs.library._cacheIndexFromToc(toc[i].contents)
      } else {
        sjs.library.index(toc[i].title, toc[i]);
      }
    }
  },
  ref: function(ref) {
    // Returns parsed ref in for string `ref`. 
    // This is currently a wrapper for sjs.library text for cases when the textual information is not important
    // so that it can be called without worrying about the `settings` parameter for what is available in cache.
    return this.text(ref) || this.text(ref, {context:1});
  },
  _links: {},
  links: function(ref, cb) {
    if (!cb) {
      return this._links[ref] || [];
    }
    if (ref in this._links) {
      cb(this._links[ref]);
    } else {
       var url = "/api/links/" + normRef(ref) + "?with_text=0";
       this._api(url, function(data) {
          if ("error" in data) { 
            // sjs.alert.message(data.error);
            return;
          }
          this._saveLinksByRef(data);
          this._links[ref] = data;
          this._cacheIndexFromLinks(data);
          cb(data);
        }.bind(this));
    }
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
    // For a set of links from the API, save each set split by the specific ref the link points to.
    var newLinks = {}; // Aggregate links by anchorRef
    // TODO account for links to ranges
    for (var i=0; i < data.length; i++) {
      var newRef = data[i].anchorRef;
      if (newRef in newLinks) {
        newLinks[newRef].push(data[i]);
      } else {
        newLinks[newRef] = [data[i]];
      }
    }
    for (var newRef in newLinks) {
      if (newLinks.hasOwnProperty(newRef)) {
        this._links[newRef] = newLinks[newRef];
      }
    }
  },
  linksLoaded: function(ref) {
    return ref in this._links;
  },
  linkCount: function(ref, filter) {
    if (!(ref in this._links)) { return 0; }
    var links = this._links[ref];
    links = filter ? this._filterLinks(links, filter) : links;
    return links.length;
  },
  _filterLinks: function(links, filter) {
     return links.filter(function(link){
        return (filter.length == 0 ||
                $.inArray(link.category, filter) !== -1 || 
                $.inArray(link.commentator, filter) !== -1 );
      }); 
  },
  _linkSummaries: {},
  linkSummary: function(ref) {
    // Returns an object summarizing the link counts by category and text
    // Takes either a single string `ref` or an array of string refs.
    if (typeof ref == "string") {
      if (ref in this._linkSummaries) { return this._linkSummaries[ref]; }
      links   = this.links(ref);
    } else {
      var links = [];
      ref.map(function(r) {
        var newlinks = sjs.library.links(r);
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
    // Add Zero counts for every commentator in this section not alredy in list
    var baseRef    = typeof ref == "string" ? ref : ref[0]; // TODO handle refs spanning sections
    var sectionRef = sjs.library.ref(baseRef) ? sjs.library.ref(baseRef).sectionRef : baseRef;
    if (ref !== sectionRef) {
      var sectionLinks = sjs.library.links(sectionRef);
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
    summary = $.map(summary, function(value, category) {
      value.category = category;
      value.books = $.map(value.books, function(value, book) {
        var index      = sjs.library.index(book);
        value.book     = index.title;
        value.heBook   = index.heTitle;
        value.category = index.categories[0];
        return value;
      });
      // Sort the books in the category
      value.books.sort(function(a, b) { return a.book > b.book ? 1 : -1; });
      return value;
    });
    // Sort the categories
    summary.sort(function(a, b) {
      // always put Commentary first 
      if      (a.category === "Commentary") { return -1; }
      else if (b.category === "Commentary") { return  1; }
      // always put Modern Works last
      if      (a.category === "Modern Works") { return  1; }
      else if (b.category === "Modern Works") { return -1; }
      return b.count - a.count;
    });
    return summary;
  },
  flatLinkSummary: function(ref) {
    // Returns an array containing texts and categories with counts for ref
    var summary = sjs.library.linkSummary(ref);
    var booksByCat = summary.map(function(cat) { 
      return cat.books.map(function(book) {
        return book;
      });
    });
    var books = [];
    books = books.concat.apply(books, booksByCat);
    return books;     
  },
  topLinks: function(ref) {
    // Return up to 5 top recommended link filters - Not currently used
    // TODO add text specific content rules here (e.g., privlege Tosafot for Bavli)
    var books = this.flatLinkSummary(ref);
    books.sort(function(a,b) { return b.count - a.count; });
    books = books.slice(0, 5);
    return books;
  },
  textTocHtml: function(title, cb) {
    // Returns an HTML fragment of the table of contents of the text 'title'
    if (!title) { return ""; }
    if (title in this._textTocHtml) {
      return this._textTocHtml[title]
    } else {
      $.ajax({
        url: "/api/toc-html/" + title,
        dataType: "html",
        success: function(html) {
          html = this._makeTextTocHtml(html, title);
          this._textTocHtml[title] = html;
          cb(html);
        }.bind(this)
      });
      return null;
    } 
  },
  _makeTextTocHtml: function(html, title) {
    // Modifies Text TOC HTML received from server
    // Replaces links and adds commentary setion
    html = html.replace(/ href="\//g, ' data-ref="');
    var commentaryList  = this.commentaryList(title);
    if (commentaryList.length) {
      var commentaryHtml = "<div class='altStruct' style='display:none'>" + 
                              commentaryList.map(function(item) {
                                  return "<a class='refLink' data-ref='" + item.firstSection + "'>" + 
                                            "<span class='en'>" + item.commentator + "</span>" +
                                            "<span class='he'>" + item.heCommentator + "</span>" +
                                          "</a>";
                              }).join("") +
                            "</div>";
      var $html = $("<div>" + html + "</div>");
      var commentaryToggleHtml = "<div class='altStructToggle'>" +
                                    "<span class='en'>Commentary</span>" +
                                    "<span class='he'>מפרשים</span>" +
                                  "</div>";      
      if ($html.find("#structToggles").length) {
        $html.find("#structToggles").append("<span class='toggleDivider'>|</span>" + commentaryToggleHtml);  
      } else {
        var togglesHtml = "<div id='structToggles'>" +
                            "<div class='altStructToggle active'>" +
                                "<span class='en'>Text</span>" +
                                "<span class='he'>טקסט</span>" +
                              "</div>" + 
                              "<span class='toggleDivider'>|</span>" + commentaryToggleHtml +
                          "</div>";
        $html = $("<div><div class='altStruct'>" + html + "</div></div>");
        $html.prepend(togglesHtml);   
      }
      $html.append(commentaryHtml);
      html = $html.html();
    }
    return html;
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
        var string           = namedSections + ", " + name +  numberedSections;        
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
        var string           = namedSections + ", " + name + " " + numberedSections;        
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
  _textTocHtml: {},
  commentaryList: function(title) {
    // Returns the list of commentaries for 'title' which are found in sjs.toc
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
    var list = clone(sjs.toc);
    for (var i = 0; i < cats.length; i++) {
      var found = false;
      for (var k = 0; k < list.length; k++) {
        if (list[k].category == cats[i]) { 
          list = clone(list[k].contents);
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
    trendingTags: function(cb) {
      var tags = this._trendingTags;
      if (tags) {
        if (cb) { cb(tags); }
      } else {
        var url = "/api/sheets/trending-tags";
         sjs.library._api(url, function(data) {
            this._trendingTags = data;
            if (cb) { cb(data); }
          }.bind(this));
        }
      return tags;
    },
    _tagList: null,
    tagList: function(cb) {
      var tags = this._tagList;
      if (tags) {
        if (cb) { cb(tags); }
      } else {
        var url = "/api/sheets/tag-list";
         sjs.library._api(url, function(data) {
            this._tagList = data;
            if (cb) { cb(data); }
          }.bind(this));
        }
      return tags;
    },
    _sheetsByTag: {},
    sheetsByTag: function(tag, cb) {
      var sheets = this._sheetsByTag[tag];
      if (sheets) {
        if (cb) { cb(sheets); }
      } else {
        var url = "/api/sheets/tag/" + tag;
         $.getJSON(url, function(data) {
            this._sheetsByTag[tag] = data.sheets;
            if (cb) { cb(data.sheets); }
          }.bind(this));
        }
      return sheets;
    },
    _userSheets: {},
    userSheets: function(uid, cb) {
      var sheets = this._userSheets[uid];
      if (sheets) {
        if (cb) { cb(sheets); }
      } else {
        var url = "/api/sheets/user/" + uid;
         sjs.library._api(url, function(data) {
            this._userSheets[uid] = data.sheets;
            if (cb) { cb(data.sheets); }
          }.bind(this));
        }
      return sheets;
    },
  },
  hebrewCategory: function(cat) {
    var categories = {
      "Torah":                "תורה",
      "Tanach":               'תנ"ך',
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
      "Shulchan Arukh":       "שולחן ערוך"
    };
    return cat in categories ? categories[cat] : cat;
  },
  search: {
      baseUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search",
      execute_query: function (args) {
          // To replace sjs.search.post in search.js

          /* args can contain
           query: query string
           size: size of result set
           from: from what result to start
           get_filters: if to fetch initial filters
           applied_filters: fiter query by these filters
           success: callback on success
           error: callback on error
           */
          if (!args.query) {
              return;
          }

          var url = sjs.library.search.baseUrl;
          url += "?size=" + args.size;
          if (args.from) {
              url += "&from=" + args.from;
          }

          return $.ajax({
              url: url,
              type: 'POST',
              data: JSON.stringify(sjs.library.search.get_query_object(args.query, args.get_filters, args.applied_filters)),
              crossDomain: true,
              processData: false,
              dataType: 'json',
              success: args.success,
              error: args.error
          });
      },
      get_query_object: function (query, get_filters, applied_filters) {
          // query: string
          // get_filters: boolean
          // applied_filters: null or list of applied filters (in format supplied by Filter_Tree...)
          var core_query = {
              "query_string": {
                  "query": query.replace(/(\S)"(\S)/g, '$1\u05f4$2'), //Replace internal quotes with gershaim.
                  "default_operator": "AND",
                  "fields": ["content"]
              }
          };

          var o = {
              "sort": [{
                  "order": {}                 // the sort field name is "order"
              }],
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
              o['query'] = core_query;
              o['aggs'] = {
                  "category": {
                      "terms": {
                          "field": "path",
                          "size": 0
                      }
                  }
              };
          } else if (!applied_filters) {
              o['query'] = core_query;
          } else {
              //Filtered query.  Add clauses.  Don't re-request potential filters.
              var clauses = [];
              for (var i = 0; i < applied_filters.length; i++) {
                  clauses.push({
                      "regexp": {
                          "path": RegExp.escape(applied_filters[i]) + ".*"
                      }
                  })
              }
              o['query'] = {
                  "filtered": {
                      "query": core_query,
                      "filter": {
                          "or": clauses
                      }
                  }
              };
          }
          return o;
      }
  },
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
  },
  _apiCallbacks: {}
};

// Unpack sjs.toc into index cache
sjs.library._cacheIndexFromToc(sjs.toc);


sjs.palette = {
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
};

sjs.categoryColors = {
  "Commentary":         sjs.palette.blue,
  "Tanach" :            sjs.palette.darkteal,
  "Midrash":            sjs.palette.green,
  "Mishnah":            sjs.palette.lightblue,
  "Talmud":             sjs.palette.yellow,
  "Halakhah":           sjs.palette.red,
  "Kabbalah":           sjs.palette.purple,
  "Philosophy":         sjs.palette.lavender,
  "Liturgy":            sjs.palette.darkpink,
  "Tosefta":            sjs.palette.teal,
  "Parshanut":          sjs.palette.paleblue,
  "Chasidut":           sjs.palette.lightgreen,
  "Musar":              sjs.palette.raspberry,
  "Responsa":           sjs.palette.orange,
  "Apocrypha":          sjs.palette.lightpink,
  "Other":              sjs.palette.darkblue,
  "Quoting Commentary": sjs.palette.orange,
  "Commentary2":        sjs.palette.blue,
  "Sheets":             sjs.palette.raspberry,
  "Targum":             sjs.palette.lavender,
  "Modern Works":       sjs.palette.raspberry
};

sjs.categoryColor = function(cat) {
  if (cat in sjs.categoryColors) {
    return sjs.categoryColors[cat];
  }
  return "transparent";
}
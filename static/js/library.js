sjs = sjs || {};

sjs.palette = {
  "green": "#77A485",
  "blue": "#6588C7",
  "tan": "#D3BE90",
  "red": "#D86F6D",
  "navy": "#222F4F",
  "pink": "#D9C6D4",
  "grape": "#7B426E",
  "lightblue": "#95C6D2",
  "darkgreen": "#095868"
};

sjs.categoryColors = {
  "Commentary":         sjs.palette.blue,
  "Tanach" :            sjs.palette.darkgreen,
  "Midrash":            sjs.palette.green,
  "Mishnah":            sjs.palette.lightblue,
  "Talmud":             sjs.palette.tan,
  "Halakhah":           sjs.palette.red,
  "Kabbalah":           sjs.palette.pink,
  "Philosophy":         sjs.palette.grape,
  "Liturgy":            sjs.palette.blue,
  "Tosefta":            sjs.palette.darkgreen,
  "Parshanut":          sjs.palette.tan,
  "Chasidut":           sjs.palette.green,
  "Musar":              sjs.palette.lightblue,
  "Responsa":           sjs.palette.red,
  "Apocrapha":          sjs.palette.pink,
  "Other":              sjs.palette.blue,
  "Quoting Commentary": sjs.palette.lightblue
};

sjs.categoryColor = function(cat) {
  if (cat in sjs.categoryColors) {
    return sjs.categoryColors[cat];
  }
  return "transparent";
}

sjs.library = {
  _texts: {},
  text: function(ref, settings, cb) {
    var key = this._textKey(ref, settings);
    if (!cb) {
      return this._texts[key];
    }          
    if (key in this._texts) {
      cb(this._texts[key]);
      return this._texts[key];
    } else {
       params = "?commentary=0" + (settings && settings.context ? "&context=1" : "&context=0");
       var url = "/api/texts/" + normRef(ref) + params;
       $.getJSON(url, function(data) {
          this._saveText(data, settings);
          cb(data);
        }.bind(this));
    }
  },
  _textKey: function(ref, settings) {
    var key = ref;
    if (settings) {
      key = settings.context ? key + "|CONTEXT" : key;
    }
    return key;
  },
  _saveText: function(data, settings) {
        if ("error" in data) { 
          sjs.alert.message(data.error);
          return;
        }
        var settings = settings || {};
        key = this._textKey(data.ref, settings);
        this._texts[key] = data;
        if (data.ref == data.sectionRef) {
          this._splitTextSection(data);
        } else if (settings.context) {
          var newData         = clone(data);
          newData.ref        = data.sectionRef;
          newData.sections   = data.sections.slice(0,-1);
          newData.toSections = data.toSections.slice(0,-1);
          this._saveText(newData);
        }
        var index = {
          title:      data.indexTitle,
          heTitle:    data.heTitle, // This is incorrect for complex texts
          categories: data.categories
        };
        this.index(index.title, index);
  },
  _splitTextSection: function(data) {
    // Takes data for a section level text and populates cache with segment levels
    // Pad the shorter array to make stepping through them easier.
    var en = data.text;
    var he = data.he;
    var length = Math.max(en.length, he.length);
    en = en.pad(length, "");
    he = he.pad(length, "");

    var delim = data.ref === data.book ? " " : ":";
    var start = data.textDepth == data.sections.length ? data.sections[data.textDepth-1] : 1;
    for (var i = 0; i < length; i++) {
      var ref = data.ref + delim + (i+start);
      var segment_data   = clone(data);
      $.extend(segment_data, {
        ref: ref,
        heRef: data.heRef + delim + encodeHebrewNumeral(i+start),
        text: en[i],
        he: he[i],
        nextSegment: i+start == length ? null : data.ref + delim + (i+start+1),
        prevSegment: i+start == 1      ? null : data.ref + delim + (i+start-1),
      });

      this._texts[ref] = segment_data;
    }
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
  _cacheIndexFromToc: function() {
    // Unpacks contents of sjs.toc and stores it in index cache.
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
       $.getJSON(url, function(data) {
          if ("error" in data) { 
            sjs.alert.message(data.error);
            return;
          }
          this._links[ref] = data;
          this.cacheIndexFromLinks(data);
          cb(data);
        }.bind(this));
    }
  },
  cacheIndexFromLinks: function(links) {
    for (var i=0; i< links.length; i++) {
      // Cache partial index information
      if (this.index(links[i].commentator)) { continue; }
      var index = {
        title:      links[i].commentator,
        heTitle:    links[i].heCommentator,
        categories: [links[i].category],
      };
      this.index(links[i].commentator, index);
    }
  },
  bulkLoadLinks: function(ref, cb) {
    if (ref in this._links) {
      cb();
    } else {
      var url = "/api/links/" + normRef(ref) + "?with_text=0";
      $.getJSON(url, function(data) {
        if ("error" in data) { 
          sjs.alert.message(data.error);
          return;
        }
        var newLinks = {}; // Aggregate links on anchorRef
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
        this._links[ref] = true; // Mark this bulk ref as loaded
        this.cacheIndexFromLinks(data);
        cb();
      }.bind(this));         
    }
  },
  linksLoaded: function(ref) {
    return ref in this._links;
  },
  linkCount: function(ref) {
   return ref in this._links ? this._links[ref].length : 0;
  },
  _linkSummaries: {},
  linkSummary: function(ref) {
    // Returns an object summarizing the link counts by category and text
    if (ref in this._linkSummaries) { return this._linkSummaries[ref]; }
    var links   = ref in this._links ? this._links[ref] : [];
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
      value.books.sort(function(a,b) { return a.book > b.book; });
      return value;
    });
    // Sort the categories
    summary.sort(function(a,b) { return b.count - a.count; });
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
    // Return up to 5 top recommended link filters
    // TODO add text specific content rules here (e.g., privlege Tosafot for Bavli)
    var books = this.flatLinkSummary(ref);
    books.sort(function(a,b) { return b.count - a.count; });
    books = books.slice(0, 5);
    return books;
  },
  textTocHtml: function(title, cb) {
    // Returns an HTML fragment of the table of contents of the text 'title'
    if (!title) { return "[empty title]"; }
    if (title in this._textTocHtml) {
      return this._textTocHtml[title]
    } else {
      $.ajax({
        url: "/api/toc-html/" + title,
        dataType: "html",
        success: function(html) {
          html = html.replace(/ href="\//g, ' data-ref="');
          this._textTocHtml[title] = html;
          cb(html);
        }.bind(this)
      });
      return null;
    } 
  },
  _textTocHtml: {},
  hebrewCategory: function(cat) {
    categories = {
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
      "Maharsha":             'מהרשא'
    };
    return cat in categories ? categories[cat] : cat;
  }
};
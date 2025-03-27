Sefaria = Sefaria || {};

Sefaria.pageSize = 100;

$.extend(Sefaria, {
    currentPage: "search",
    currentFacet: null,

    FilterTree: function() {
        Sefaria.search.FilterNode.call(this); //Inherits from FilterNode
        this.path = "_root";
        this.title = "All Sources";
        this.heTitle = "כל המקורות";
        this.rawTree = {};
        this.registry = {};
        this.orphanFilters = [];
    }
});

Sefaria.search = Sefaria.search || {};
$.extend(Sefaria.search, {
        filters_rendered: false,
        filter_tree: {},
        query_context: 1,
        presentation_context: 1,
        presentation_field: "content",
        content_fields: {
            1: "content",
            3: "context_3",
            7: "context_7"
        },
        query: "",
        page: 0,
        hits: {},
        //aggs: {},
        $header: $("#searchHeader"),
        $results: $("#searchResults"),
        $filters: $("#searchFilters"),
        $desc: $('#description'),

        handleStateChange: function (event) {
            if (!(event.state)) {
                //new page load
                return;
            }

            var state = event.state;
            Sefaria.search.clear_available_filters();
            Sefaria.search.filter_tree = new Sefaria.FilterTree();

            if ("lang" in state) {
                if (state["lang"] == "he") {
                    $("body").addClass("hebrew");
                    $("body").removeClass("english");
                }
                else if (state["lang"] == "en") {
                    $("body").addClass("english");
                    $("body").removeClass("hebrew");
                }
            }
            if (!("q" in state)) {
                Sefaria.search.show_empty();
                return;
            }

            if ("page" in state) {
                Sefaria.search.page = parseInt(vars["page"])
            }
            /*
             if ("pctx" in state) {
             Sefaria.search.set_presentation_context(parseInt(state["pctx"]));
             }
             if ("qctx" in state) {
             Sefaria.search.set_query_context(state["qctx"]);
             }
             */
            if ("q" in state) {
                var query = state["q"].replace(/\+/g, " ");
                $(".searchInput").val(query);
                Sefaria.search.query = query;
            }

            if ("filters" in state) {
                var f = state["filters"].split("|");
                Sefaria.search.filter_tree.setAppliedFilters(f);
            }
            Sefaria.search.post();
        },
        get_lang: function () {
            if ($("body").hasClass("english")) {
                return "en";
            }
            else if ($("body").hasClass("hebrew")) {
                return "he";
            }
        },
        updateUrlParams: function (push) {
            //Note that this is different than Sefaria.updateUrlParams, which is used for the reader
            var params = {};
            params["lang"] = this.get_lang();

            if (this.query) params["q"] = this.query;
            if (this.page > 0) params["page"] = this.page;
            //if (this.query_context != 1) params["qctx"] = this.query_context;
            //if (this.presentation_context != 1) params["pctx"] = this.presentation_context;

            var filters = this.filter_tree.getAppliedFilters();
            if (filters.length > 0) {
                params["filters"] = filters.join("|")
            }

            var serializedParams = [];
            for (var k in params) {
                if (params.hasOwnProperty(k)) {
                    serializedParams.push(k + "=" + encodeURIComponent(params[k]));
                }
            }

            var url = "/search?" + serializedParams.join("&");

            var title = this.get_page_title();
            $('title').text(title);
            this.$desc.text(this.get_description_line())
                .css("color", "#8756aD")
                .animate({color: "black"}, 2000);

            if (push) {
                history.pushState(params, title, url);
            } else {
                history.replaceState(params, title, url);
            }
        },
        get_page_title: function () {
            var lang = this.get_lang();
            var cats = this.get_category_string();

            if (!(this.query)) {
                return (lang == "en") ? "Search Jewish Texts | Sefaria.org" : "חיפוש מקורות בספריא";
            }

            var line = '"' + this.query + '" ';
            if (cats.length > 0) {
                line += (lang == "en") ? " in " : " ב";
                line += cats;
                line += ' (' + String(this.hits.total) + ')';
            } else {
                line += '(' + String(this.hits.total) + ')';
                if (lang == 'en') {
                    line += ' | Sefaria Search';
                } else if (lang == 'he') {
                    line += ' | חיפוש מקורות';
                }
            }
            return line;
        },
        get_description_line: function () {
            if (!(this.query) || !(this.hits)) return "";  // the !this.hits clause is likely superfluous.
            var lang = this.get_lang();
            var cats = this.get_category_string();
            var line;
            if (lang == "en") {
                line = String(this.hits.total) + ' results for "' + this.query + '"';
                if (cats.length > 0) {
                    line += " in " + cats;
                }
            }
            else if (lang == "he") {
                line = String(this.hits.total) + ' תוצאות עבור ' + '"' + this.query + '"';
                if (cats.length > 0) {
                    line += " ב" + cats;
                }
            }
            return line;
        },
        get_category_string: function () {
            var lang = this.get_lang();

            var titles = this.filter_tree.getSelectedTitles(this.get_lang());
            if (titles.length == 0) return "";
            else if (titles.length == 1) return titles[0];

            var res = titles.slice(0, -1).join(", ");
            res += ((lang == "en") ? " and " : " ו") + titles.slice(-1);
            return res;
        },

        /*
         set_presentation_context: function (level) {
         this.presentation_context = level;
         this.presentation_field = this.content_fields[level];
         this.updateUrlParams(true);
         //this.render()
         },
         */
        resultsHtml: function (results) {
            var html = "";
            var previousRef = null;
            var previousHeRef = null;
            var dups = "";
            var dupCount = 0;

            for (var i = 0; i < results.length; i++) {
                if (results[i]._type == "text") {
                    if (results[i]._source.ref == previousRef) {
                        dups += this.textResult(results[i]);
                        dupCount++;
                    } else {
                        if (dups.length > 0) {  // Deal with the backlog of duplicates
                            var sTrig = "<div class='similar-trigger-box'>" +
                                "<span class='similar-title he'>" + dupCount + ((dupCount > 1) ? " גרסאות נוספות" : " גרסה נוספת") + "</span>" +
                                "<span class='similar-title en'>" + dupCount + " more version" + ((dupCount > 1) ? "s" : "") + "</span>" +
                                "</div>";
                            html = html.slice(0, -6) + sTrig + html.slice(-6); // Insert before that last </div>.  This is brittle
                            html += "<div class='similar-box'>" +
                                "<div class='similar-results'>" + dups +
                                "</div></div>";
                            dups = "";
                            dupCount = 0;
                        }
                        html += this.textResult(results[i]);
                    }
                    previousRef = results[i]._source.ref;
                    previousHeRef = results[i]._source.heRef;
                } else if (results[i]._type == "sheet") {
                    html += this.sheetResult(results[i]);
                }
            }
            if (results.length == 0) {
                html = "<div id='emptySearch' class='well'>" +
                    "<b>Sefaria Search is still under development.</b><br />" +
                    "Hebrew words are searched exactly as entered; different forms of the same word may produce different results." +
                    "</div>";
            }
            return html;
        },
        textResult: function (result) {
            var s = result._source;
            var snippet;
            if (result.highlight && result.highlight[this.presentation_field]) {
                snippet = result.highlight[this.presentation_field].join("...");
            } else {
                snippet = s[this.presentation_field];
            }
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            html = "<div class='result'>" +
                '<a href="/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.query + '">' +
                '<span class="en">' + s.ref + '</span>' +
                '<span class="he">' + s.heRef + '</span>' +
                "</a>" +
                "<div class='snippet'>" + snippet + "</div>" +
                "<div class='version'>" + s.version + "</div>" +
                "</div>";  // There is a process is resultsHtml that inserts before this last </div>.  This is brittle
            return html;
        },

        sheetResult: function (result) {
            var s = result._source;
            var snippet = result.highlight ? result.highlight.content.join("...") : s.content;
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            html = "<div class='result'>" +
                '<a href="/sheets/' + s.sheetId + '">' + s.title + "</a>" +
                "<div class='snippet'>" + snippet + "</div>" +
                "<div class='version'>" + s.version + "</div>" +
                "</div>";
            return html;
        },
        render_filters: function () {
            if (!this.filters_rendered) {
                this.$filters.show();
                var filters = this.filter_tree.toHtml();
                this.$filters.append(filters);
                this.filter_tree.reapplyOldFilters();

                $("#searchFilters .filter").change(function (e) {
                    if (this.checked) {
                        Sefaria.search.filter_tree.getChild(this.id).setSelected(true);
                    } else {
                        Sefaria.search.filter_tree.getChild(this.id).setUnselected(true);
                    }
                    Sefaria.search.post(true, true)
                });
                $(".filter-parent span").click(function (e) {  // If text is clicked, propgate click to checkbox
                    $(this).closest("li").find(".filter").first().trigger('click');
                });
                $("li.filter-parent ul").hide(); //hide the child lists
                $("li.filter-parent i").click(function () {
                    $(this).toggleClass('fa-angle-down'); // toggle the font-awesome icon class on click
                    $(this).next("ul").toggle(); // toggle the visibility of the child list on click
                });

                // todo - show or hide the full filter list on a resize event
                if ($(window).width() >= 800) {
                    $("#_root").closest(".filter-parent").children("i").trigger("click"); // Open first element
                }

                this.filters_rendered = true;
            }
        },

        clear_available_filters: function () {
            this.$filters.empty();
            this.$filters.hide();
            this.$results.empty();
            this.$desc.empty();
            this.hits = {};
            this.page = 0;
            this.filters_rendered = false;
        },

        show_empty: function () {
            Sefaria.search.$results.empty();
            Sefaria.search.$results.append("<div id='search-instructions' class='well'>" +
                "<span class='en'>Enter a word or words to search for in the box above. Enclose phrases with quotes.  You can enter your search in either Hebrew or English.  After submitting a search, you can filter your search to specific categories or books.</span>" +
                "<span class='he'>" +
                'הקלידו מילה/ים לחיפוש בתיבה מעל. ניתן להקליד ביטויים ע"י הקפתם במרכאות. החיפוש יכול להיעשות באנגלית או בעברית. אחרי ביצוע החיפוש, ניתן לסנן את התוצאות לקטגוריות או ספרים מסויימים.'
                + "</span>" +
                "</div>");
        },

        render: function (hold_results) {
            this.$header.empty();
            if (!hold_results) {
                this.$results.empty();
            }
            this.$results.find(".moreResults").remove();
            if (!this.filters_rendered) {
                this.render_filters();
                if (this.filter_tree.getAppliedFilters().length > 0) {
                    //Filters carried over from previous search.  Execute second search to apply filters.
                    this.post(false, false, true);
                    return;
                }
            }
            var results = this.resultsHtml(this.hits.hits);
            if (this.hits.hits.length == (hold_results ? Sefaria.pageSize : Sefaria.pageSize * (this.page + 1))) {
                results += "<div class='moreResults'><span class='en'>More results</span><span class='he'>תוצאות נוספות</span></div>"
            }
            this.$desc.text(this.get_description_line());
            this.$results.append(results);
            $(".similar-title").on('click', function () {
                $(this).parent().parent().next(".similar-box").find(".similar-results").toggle();
            });
            $(".moreResults").click(function () {
                $(".moreResults").off("click").css("color", "grey");
                Sefaria.search.page = Sefaria.search.page + 1;
                Sefaria.search.post(true, false, false, true);
            });
        },
        query_object: function () {
            return Sefaria.search.get_query_object(this.query, !this.filters_rendered, this.filter_tree.hasAppliedFilters() && this.filter_tree.getAppliedFilters())
        },
        post: function (updateurl, push, leave_alive, hold_results) {
            if (Sefaria.search.active_post && !(leave_alive)) {
                Sefaria.search.active_post.abort(); //Kill any earlier query
            }

            this.$header.html("Searching <img src='/static/img/ajax-loader.gif' />");

            var qobj = this.query_object();

            var url = Sefaria.search.baseUrl;
            if (!hold_results)
                url += "?size=" + ((this.page + 1) * Sefaria.pageSize);
            else {
                url += "?size=" + Sefaria.pageSize;
                if (this.page) {
                    url += "&from=" + (this.page * Sefaria.pageSize);
                }
            }
            Sefaria.search.active_post = $.ajax({
                url: url,
                type: 'POST',
                data: JSON.stringify(qobj),
                crossDomain: true,
                processData: false,
                dataType: 'json',
                success: function (data) {
                    Sefaria.search.hits = data.hits;
                    if (data.aggregations && data.aggregations.category) {
                        //Sefaria.search.aggs = data.aggregations;
                        Sefaria.search.filter_tree.updateAvailableFilters(data.aggregations.category.buckets);
                    }
                    Sefaria.search.render(hold_results);
                    if (updateurl) Sefaria.search.updateUrlParams(push);
                    Sefaria.search.active_post = false;
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    if (textStatus == "abort") {
                        return;
                    }
                    var html = "<div id='emptySearch' class='well'>" +
                        "<b>Sefaria Search encountered an error.</b><br />" +
                        "This feature is still in development. We're currently working to make our search experience both robust and useful. Please try your search again later." +
                        "</div>";
                    Sefaria.search.$results.html(html);
                    Sefaria.search.active_post = false;
                }
            });

            $(".searchInput").blur();

            Sefaria.track.event("Search","Search",this.query);
        }
    }
);

/* Working with filter trees:
1) Add all Available Filters with addAvailableFilter
2) _build
*/

$.extend(Sefaria.search.FilterNode.prototype, {
    //Extend the 'set...' methods to also mutate DOM
    $el : function() {
        var selector = ".filter#" + this.getId();
        return $(selector);
    },
    setSelected : function(propogateParent, noPropogateChild) {
        //default is to propogate children and not parents.
        //Calls from front end should use (true, false), or just (true)
        this.selected = 1;
        this.$el().prop('indeterminate', false);
        this.$el().prop('checked', true);
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
        this.$el().prop('indeterminate', false);
        this.$el().prop('checked', false);
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
        this.$el().prop('indeterminate', true);
        this.$el().prop('checked', false);
        if(this.parent) this.parent._deriveState();
    },
    toHtml: function() {
        var html = '<li'
            + (this.hasChildren()?" class='filter-parent'":"")
            + '> <input type="checkbox" class="filter " '
            + 'id="'+ this.getId() + '"'
            + (this.isSelected()?' checked="checked" ':'')
            + (this.isPartial()?' indeterminate="indeterminate" ':'')
            + ' name="' + this.getId() + '" />'
            + '<span class="en">' + this.title + '&nbsp;(' + this.doc_count + ')&nbsp;</span>'
            + '<span class="he" dir="ltr">' + this.heTitle + '&nbsp;(' + this.doc_count + ')&nbsp;</span>';
        if (this.hasChildren()) {
            html += '<i class="fa fa-caret-down"></i><ul>';
            for (var i = 0; i < this.children.length; i++) {
                html += this.children[i].toHtml();
            }
            html += "</ul>";
        }
        html += ' </li> ';
        return html;
    }
});
Sefaria.FilterTree.prototype = Object.create(Sefaria.search.FilterNode.prototype);
Sefaria.FilterTree.prototype.constructor = Sefaria.FilterTree;
$.extend(Sefaria.FilterTree.prototype, {

    setUnselected: function(propogateParent, noPropogateChild) {
        Sefaria.search.filter_tree.orphanFilters = [];
        Sefaria.search.FilterNode.prototype.setUnselected.call(this, propogateParent, noPropogateChild);
    },
    updateAvailableFilters: function(filters) {
        this.orphanFilters = this.getAppliedFilters();
        this.rawTree = {};
        this.registry = {};
        this.children = [];

        // Initially, add already applied filters, with empty doc_count
        for (var j = 0; j < this.orphanFilters.length; j++) {
            this.addAvailableFilter(this.orphanFilters[j], {"doc_count": 0});
        }

        // Then add results from this query
        for (var i = 0; i < filters.length; i++) {
            this.addAvailableFilter(filters[i]["key"], {"doc_count":filters[i]["doc_count"]});
        }
        this._build();
    },
    addAvailableFilter: function(key, data) {
        //key is a '/' separated key list, data is an arbitrary object
        //Based on http://stackoverflow.com/a/11433067/213042
        var keys = key.split("/");
        var base = this.rawTree;

        // If a value is given, remove the last name and keep it for later:
        var lastName = arguments.length === 2 ? keys.pop() : false;

        // Walk the hierarchy, creating new objects where needed.
        // If the lastName was removed, then the last object is not set yet:
        var i;
        for(i = 0; i < keys.length; i++ ) {
            base = base[ keys[i] ] = base[ keys[i] ] || {};
        }

        // If a value was given, set it to the last name:
        if( lastName ) {
            base = base[ lastName ] = data;
        }

        // Could return the last object in the hierarchy.
        // return base;
    },
    _aggregate: function() {
        //Iterates the raw tree to aggregate doc_counts from the bottom up
        //Nod to http://stackoverflow.com/a/17546800/213042
        walker("_root", this.rawTree);
        function walker(key, branch) {
            if (branch !== null && typeof branch === "object") {
                // Recurse into children
                $.each(branch, walker);
                // Do the summation with a hacked object 'reduce'
                if ((!("doc_count" in branch)) || (branch["doc_count"] === 0)) {
                    branch["doc_count"] = Object.keys(branch).reduce(function (previous, key) {
                        if (typeof branch[key] === "object" && "doc_count" in branch[key]) {
                            previous += branch[key].doc_count;
                        }
                        return previous;
                    }, 0);
                }
            }
        }
    },

    _build: function() {
        //Aggregate counts, then sort rawTree into FilterNodes and add Hebrew using Sefaria.toc as reference
        //Nod to http://stackoverflow.com/a/17546800/213042
        this._aggregate();
        this.doc_count = this.rawTree.doc_count;
        this.registry[this.getId()] = this;

        var ftree = this;
        var path = [];

        //Manually add base commentary branch
        var commentaryNode = new Sefaria.search.FilterNode();
        var rnode = ftree.rawTree["Commentary"];
        if (rnode) {
            $.extend(commentaryNode, {
                "title": "Commentary",
                "path": "Commentary",
                "heTitle": "מפרשים",
                "doc_count": rnode.doc_count
            });
            ftree.registry[commentaryNode.path] = commentaryNode;
        }

        //End commentary base hack

        for(var j = 0; j < Sefaria.toc.length; j++) {
            var b = walk(Sefaria.toc[j]);
            if (b) this.append(b)
        }
        if (rnode) this.append(commentaryNode);

        function walk(branch, parentNode) {
            var node = new Sefaria.search.FilterNode();

            if("category" in branch) { // Category node
                if(branch["category"] == "Commentary") { // Special case commentary

                    path.unshift(branch["category"]);  // Place "Commentary" at the *beginning* of the path
                     $.extend(node, {
                         "title": parentNode.title,
                         "path": path.join("/"),
                         "heTitle": parentNode.heTitle
                     });
                } else {
                    path.push(branch["category"]);  // Place this category at the *end* of the path
                    $.extend(node, {
                       "title": path.slice(-1)[0],
                       "path": path.join("/"),
                       "heTitle": branch["heCategory"]
                    });
                }
                for(var j = 0; j < branch["contents"].length; j++) {
                    var b = walk(branch["contents"][j], node);
                    if (b) node.append(b)
                }
            }
            else if ("title" in branch) { // Text Node
                path.push(branch["title"]);
                $.extend(node, {
                   "title": path.slice(-1)[0],
                   "path": path.join("/"),
                   "heTitle": branch["heTitle"]
                });
            }

            try {
                var rawnode = ftree.rawTree;
                var i;
                for (i = 0; i < path.length; i++) {
                    //For TOC nodes that we don't have results for, this will throw an exception, caught below.
                    rawnode = rawnode[path[i]];
                }

                node["doc_count"] = rawnode.doc_count;
                //Do we really need both?
                ftree.registry[node.getId()] = node;
                ftree.registry[node.path] = node;

                if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
                    commentaryNode.append(node);
                    path.shift();
                    return false;
                }

                path.pop();
                return node;
            }
            catch (e) {
                if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
                    path.shift();
                } else {
                    path.pop();
                }
                return false;
            }
        }
    },
    getSelectedTitles: function(lang) {
        if (this.isUnselected() || this.isSelected()) {
            return [];
        }
        var results = [];
        for (var i = 0; i < this.children.length; i++) {
            results = results.concat(this.children[i].getSelectedTitles(lang));
        }
        return results;
    },
    getAppliedFilters: function() {
        if (this.isSelected()) {
            return [];
        }
        var results = [];
        results = results.concat(this.orphanFilters);
        for (var i = 0; i < this.children.length; i++) {
            results = results.concat(this.children[i].getAppliedFilters());
        }
        return results;
    },
    setAppliedFilters: function(paths) {
        this.orphanFilters = []; //double check this
        for (var i = 0; i < paths.length; i++) {
            var child = this.getChild(paths[i]);
            if(child) {
                child.setSelected(true);
            } else {
                this.orphanFilters.push(paths[i]);
            }
        }
    },
    reapplyOldFilters: function() {
        if (this.orphanFilters.length > 0) {
            this.setAppliedFilters(this.orphanFilters);
        }
    },
    getChild: function(path) {
        return this.registry[path];
    }
});


$(function() {

    $("body").addClass("searchPage");

    $("#languageToggle").show();
    $("#languageToggle #bilingual").hide();
	$("#hebrew, #english").on("click", function() { Sefaria.search.updateUrlParams(true); });

    window.addEventListener('popstate', Sefaria.search.handleStateChange);

	var vars = getUrlVars();
    Sefaria.search.filter_tree = new Sefaria.FilterTree();

    if (!("q" in vars)) {  //empty page
        Sefaria.search.show_empty();
        Sefaria.search.updateUrlParams();
        return
    }
    var query = decodeURIComponent(vars["q"]).replace(/\+/g, " ");
    $(".searchInput").val(query);
    Sefaria.search.query = query;

    if ("lang" in vars) {
        if (vars["lang"] == "he") { $("body").addClass("hebrew"); $("body").removeClass("english"); }
        else if (vars["lang"] == "en") { $("body").addClass("english"); $("body").removeClass("hebrew"); }
    }
    if ("page" in vars) {
        Sefaria.search.page = parseInt(vars["page"])
    }
    /*
    if ("pctx" in vars) {
        Sefaria.search.set_presentation_context(parseInt(vars["pctx"]));
    }
    if ("qctx" in vars) {
        Sefaria.search.set_query_context(vars["qctx"]);
    }
    */

    if ("filters" in vars) {
        var f = vars["filters"].split("|");
        Sefaria.search.filter_tree.setAppliedFilters(f);
    }

    Sefaria.search.post(true);

});

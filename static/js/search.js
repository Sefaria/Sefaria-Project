sjs = sjs || {};

sjs.pageSize = 100;

$.extend(sjs, {
    currentPage: "search",
    currentFacet: null,
    searchUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search?size=" + sjs.pageSize,

    search: {
        filters_rendered: false,
        filter_tree: {},
        query_context: 1,
        presentation_context: 1,
        query_field: "content",
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

        handleStateChange: function(event) {
            if(!(event.state)) {
                //new page load
                return;
            }

            var state = event.state;
            sjs.search.clear_available_filters();
            sjs.search.filter_tree = new sjs.FilterTree();

            if ("lang" in state) {
                if (state["lang"] == "he") { $("body").addClass("hebrew"); $("body").removeClass("english"); }
                else if (state["lang"] == "en") { $("body").addClass("english"); $("body").removeClass("hebrew"); }
            }
            if (!("q" in state)) {
                sjs.search.show_empty();
                return;
            }

            if ("page" in state) {
                sjs.search.page = parseInt(vars["page"])
            }
            /*
            if ("pctx" in state) {
                sjs.search.set_presentation_context(parseInt(state["pctx"]));
            }
            if ("qctx" in state) {
                sjs.search.set_query_context(state["qctx"]);
            }
            */
            if ("q" in state) {
                var query = state["q"].replace(/\+/g, " ");
                $(".searchInput").val(query);
                sjs.search.query = query;
            }

            if ("filters" in state) {
                var f = state["filters"].split("|")
                sjs.search.filter_tree.setAppliedFilters(f);
            }
            sjs.search.post();
        },
        get_lang: function() {
            if ($("body").hasClass("english")) {
                return "en";
            }
            else if ($("body").hasClass("hebrew")) {
                return "he";
            }
        },
        updateUrlParams: function (push) {
            //Note that this is different than sjs.updateUrlParams, which is used for the reader
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
            for (var k in params){
                if (params.hasOwnProperty(k)) {
                    serializedParams.push(k + "=" + encodeURIComponent(params[k]));
                }
            }

            var url = "/search?" + serializedParams.join("&");

            var title =  this.get_page_title();
            $('title').text(title);
            this.$desc.text(this.get_description_line());

            if (push) {
                history.pushState(params, title, url);
            } else {
                history.replaceState(params, title, url);
            }
        },
        get_page_title: function() {
            var lang = this.get_lang();
            var cats = this.get_category_string();

            if(!(this.query)) {
                return (lang=="en")?"Search Jewish Texts | Sefaria.org":"חיפוש מקורות בספאריה";
            }

            var line =  '"' + this.query + '" ';
            if (cats.length > 0) {
                line += (lang == "en")?" in ":" ב";
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
        get_description_line: function() {
            if(!(this.query) || !(this.hits)) return "";  // the !this.hits clause is likely superfluous.
            var lang = this.get_lang();
            var cats = this.get_category_string();
            var line;
            if (lang == "en") {
                line = String(this.hits.total) + ' results for "' + this.query + '"';
                if(cats.length > 0) {
                    line += " in " + cats;
                }
            }
            else if (lang == "he") {
                line = String(this.hits.total) + ' תוצאות עבור ' + '"' + this.query + '"';
                if(cats.length > 0) {
                    line += " ב" + cats;
                }
            }
            return line;
        },
        get_category_string: function() {
            var lang = this.get_lang();

            var titles = this.filter_tree.getSelectedTitles(this.get_lang());
            if(titles.length == 0) return "";
            else if (titles.length == 1) return titles[0];

            var res = titles.slice(0,-1).join(", ");
            res += ((lang == "en")?" and ":" ו") + titles.slice(-1);
            return res;
        },

        escape_query: function (raw_query) {
            return raw_query.replace(/(\S)"(\S)/g, '$1\u05f4$2'); //Replace internal quotes with gershaim.
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
                                        "<span class='similar-title he'>" + dupCount + ((dupCount > 1)?" גרסאות נוספות":" גרסה נוספת") + "</span>" +
                                        "<span class='similar-title en'>" + dupCount + " more version" + ((dupCount > 1)?"s":"") +"</span>" +
                                        "</div>";
                            html = html.slice(0,-6) + sTrig + html.slice(-6); // Insert before that last </div>.  This is brittle
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
            '<a href="/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '">' +
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
                        sjs.search.filter_tree.getChild(this.id).setSelected(true);
                    } else {
                        sjs.search.filter_tree.getChild(this.id).setUnselected(true);
                    }
                    sjs.search.post(true, true)
                });
                $(".filter-parent span").click(function (e) {
                    $(this).closest("li").find(".filter").first().trigger('click');
                });
                $("li.filter-parent ul").hide(); //hide the child lists
                $("li.filter-parent i").click(function () {
                    $(this).toggleClass('fa-angle-down'); // toggle the font-awesome icon class on click
                    $(this).next("ul").toggle(); // toggle the visibility of the child list on click
                });
                $("#_root").closest(".filter-parent").children("i").trigger("click"); // Open first element
                this.filters_rendered = true;
            }
        },

        clear_available_filters: function () {
            this.$filters.empty();
            this.$filters.hide();
            this.hits = {};
            this.filters_rendered = false;
        },

        show_empty: function() {
            sjs.search.$results.empty();
            sjs.search.$results.append("<div id='search-instructions' class='well'>" +
            "<span class='en'>Enter a word or words to search for in the box above. Enclose phrases with quotes.  You can enter your search in either Hebrew or English.  After submitting a search, you can filter your search to specific categories or books.</span>" +
            "<span class='he'>" +
            'הקלידו מילה/ים לחיפוש בתיבה מעל. ניתן להקליד ביטויים ע"י הקפתם במרכאות. החיפוש יכול להיעשות באנגלית או בעברית. אחרי ביצוע החיפוש, ניתן לסנן את התוצאות לקטגוריות או ספרים מסויימים.'
            + "</span>" +
            "</div>");
        },

        render: function () {
            this.$header.empty();
            this.$results.find(".moreResults").remove();
            if (!this.filters_rendered) {
                this.render_filters();
                if (this.filter_tree.getAppliedFilters().length > 0) {
                    //Filters carried over from previous search.  Execute second search to apply filters.
                    this.post();
                    return;
                }
            }
            var results = this.resultsHtml(this.hits.hits);
            if (this.hits.hits.length == sjs.pageSize) {
                results += "<div class='moreResults'>More results</div>"
            }
            this.$desc.text(this.get_description_line());
            this.$results.append(results);
            $(".similar-title").on('click', function () {
                $(this).parent().parent().next(".similar-box").find(".similar-results").toggle();
            });
            $(".moreResults").click(function () {
                sjs.search.page = sjs.search.page + 1;
                sjs.search.post(true);
            });
        },
        query_object: function () {
            var core_query = {
                "query_string": {
                    "query": this.escape_query(this.query),
                    "default_operator": "AND",
                    "fields": [this.query_field]
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
//                        "context_3": {"fragment_size":600},
//                        "context_7": {"fragment_size": 1400}
                    }
                }
            };

            if (!this.filters_rendered) {
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
            } else if (!(this.filter_tree.hasAppliedFilters())) {
                o['query'] = core_query;
            } else {
                //Filtered query.  Add clauses.  Don't re-request potential filters.
                var clauses = [];
                var appliedFilters = this.filter_tree.getAppliedFilters();
                for (var i = 0; i < appliedFilters.length; i++) {
                    clauses.push({
                        "regexp": {
                            "path": RegExp.escape(appliedFilters[i]) + ".*"
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
        },
        post: function (updateurl, push) {
            if (this.page == 0) {
                this.$results.empty();
                //$(window).scrollTop(0);
                this.$header.html("Searching <img src='/static/img/ajax-loader.gif' />");
            }

            var qobj = this.query_object();

            var url = sjs.searchUrl;
            if (this.page) {
                url += "&from=" + (this.page * sjs.pageSize);
            }
            $.ajax({
                url: url,
                type: 'POST',
                data: JSON.stringify(qobj),
                crossDomain: true,
                processData: false,
                dataType: 'json',
                success: function (data) {
                    sjs.search.hits = data.hits;
                    if (data.aggregations) {
                        //sjs.search.aggs = data.aggregations;
                        sjs.search.filter_tree.updateAvailableFilters(data.aggregations.category.buckets);
                    }
                    sjs.search.render();
                    if(updateurl) sjs.search.updateUrlParams(push);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    var html = "<div id='emptySearch' class='well'>" +
                        "<b>Sefaria Search encountered an error.</b><br />" +
                        "This feature is still in development. We're currently working to make our search experience both robust and useful. Please try your search again later." +
                        "</div>";
                    sjs.search.$results.html(html);
                }
            });

            $(".searchInput").blur();

            sjs.track.search(this.query);
        }
    },
    //FilterTree object - for category filters
    FilterNode: function() {
        this.children = [];
        this.parent = null;
        this.selected = 0; //0 - not selected, 1 - selected, 2 - partially selected
    },

    FilterTree: function() {
        sjs.FilterNode.call(this); //Inherits from FilterNode
        this.path = "_root";
        this.title = "All Sources";
        this.heTitle = "כל המקורות";
        this.rawTree = {};
        this.registry = {};
        this.orphanFilters = [];
    }

});
/* Working with filter trees:
1) Add all Available Filters with addAvailableFilter
2) _build

 */
sjs.FilterNode.prototype = {
    $el : function() {
        var selector = ".filter#" + this.getId();
        return $(selector);
    },
    append : function(child) {
        this.children.push(child);
        child.parent = this;
    },
    hasChildren: function() {
        return (this.children.length > 0);
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
            + '<span class="he" dir="rtl">' + this.heTitle + '&nbsp;(' + this.doc_count + ')&nbsp;</span>';
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
};


sjs.FilterTree.prototype = Object.create(sjs.FilterNode.prototype)
sjs.FilterTree.prototype.constructor = sjs.FilterTree;
$.extend(sjs.FilterTree.prototype, {

    setUnselected: function(propogateParent, noPropogateChild) {
        sjs.search.filter_tree.orphanFilters = [];
        sjs.FilterNode.prototype.setUnselected.call(this, propogateParent, noPropogateChild);
    },
    updateAvailableFilters: function(filters) {
        this.orphanFilters = this.getAppliedFilters();
        this.rawTree = {};
        this.registry = {};
        this.children = [];
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

        // Return the last object in the hierarchy:
        return base;
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
                if (!("doc_count" in branch)) {
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
        //Aggregate counts, then sort rawTree into FilterNodes and add Hebrew using sjs.toc as reference
        //Nod to http://stackoverflow.com/a/17546800/213042
        this._aggregate();
        this.doc_count = this.rawTree.doc_count;
        this.registry[this.getId()] = this;

        var ftree = this;
        var path = [];

        for(var j = 0; j < sjs.toc.length; j++) {
            var b = walk(sjs.toc[j]);
            if (b) this.append(b)
        }

        function walk(branch) {
            var node = new sjs.FilterNode();
            if("category" in branch) { // Category node
                path.push(branch["category"]);
                for(var j = 0; j < branch["contents"].length; j++) {
                    var b = walk(branch["contents"][j]);
                    if (b) node.append(b)
                }
            }
            else if ("title" in branch) { // Text Node
                path.push(branch["title"]);
            }

            try {
                var rawnode = ftree.rawTree;
                var i;
                for (i = 0; i < path.length; i++) {
                    rawnode = rawnode[path[i]];
                }
                $.extend(node, {
                    "title": path[i - 1],
                    "path": path.join("/"),
                    "heTitle": branch["heCategory"] || branch["heTitle"],
                    "doc_count": rawnode.doc_count
                });
                //Do we really need both?
                ftree.registry[node.getId()] = node;
                ftree.registry[node.path] = node;
                path.pop();
                return node;
            }
            catch (e) {
                path.pop();
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
	$("#hebrew, #english").on("click", function() { sjs.search.updateUrlParams(true); });

    window.addEventListener('popstate', sjs.search.handleStateChange);

	var vars = getUrlVars();
    sjs.search.filter_tree = new sjs.FilterTree();

    if (!("q" in vars)) {  //empty page
        sjs.search.show_empty();
        sjs.search.updateUrlParams();
        return
    }

    var query = vars["q"].replace(/\+/g, " ");
    $(".searchInput").val(query);
    sjs.search.query = query;

    if ("lang" in vars) {
        if (vars["lang"] == "he") { $("body").addClass("hebrew"); $("body").removeClass("english"); }
        else if (vars["lang"] == "en") { $("body").addClass("english"); $("body").removeClass("hebrew"); }
    }
    if ("page" in vars) {
        sjs.search.page = parseInt(vars["page"])
    }
    /*
    if ("pctx" in vars) {
        sjs.search.set_presentation_context(parseInt(vars["pctx"]));
    }
    if ("qctx" in vars) {
        sjs.search.set_query_context(vars["qctx"]);
    }
    */

    if ("filters" in vars) {
        var f = vars["filters"].split("|");
        sjs.search.filter_tree.setAppliedFilters(f);
    }

    sjs.search.post(true);

});
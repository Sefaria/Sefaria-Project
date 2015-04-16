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
        content_field: "content",
        content_fields: {
            1: "content",
            3: "context_3",
            7: "context_7"
        },
        query: "",
        hits: {},
        $header: $("#searchHeader"),
        $results: $("#searchResults"),
        $filters: $("#searchFilters"),

        set_presentation_context: function (level) {
            this.presentation_context = level;
            this.content_field = this.content_fields[level];
            //this.render()
        },
        resultsHtml: function (results) {
                var html = "";

                for (var i = 0; i < results.length; i++) {
                    if (results[i]._type == "text") {
                        html += this.textResult(results[i]);
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
            if (result.highlight && result.highlight[this.content_field]) {
                snippet = result.highlight[this.content_field].join("...");
            } else {
                snippet = s[this.content_field];
            }
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            html = "<div class='result'>" +
            '<a href="/' + normRef(s.ref) + '">' +
            '<span class="en">' + s.ref + '</span>' +
            '<span class="he">' + s.heRef + '</span>' +
            "</a>" +
            "<div class='snippet'>" + snippet + "</div>" +
            "<div class='version'>" + s.version + "</div>" +
            "</div>";
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
        render_filters: function() {
            if (!this.filters_rendered) {
                this.$filters.show();
                var filters = this.filter_tree.toHtml();
                this.$filters.append(filters);
                this.filter_tree.reapplyOldFilters();

                $("#searchFilters .filter").change(function(e) {
                    if (this.checked) {
                        sjs.search.filter_tree.getChild(this.id).setSelected(true);
                    } else {
                        sjs.search.filter_tree.getChild(this.id).setUnselected(true);
                    }
                    sjs.search.post()
                });
                $("li.filter-parent ul").hide(); //hide the child lists
                $("li.filter-parent i").click(function () {
                    $(this).toggleClass('fa-angle-down'); // toggle the font-awesome icon class on click
                    $(this).next("ul").toggle(); // toggle the visibility of the child list on click
                });
            this.filters_rendered = true;
            }
        },
        clear_available_filters: function() {
            this.$filters.empty();
            this.filters_rendered = false;
        },
        render: function(page) {
            this.$header.empty();
            //this.$header.html(this.hits.total + " results for <b>" + this.query + "</b>");
            this.$results.find(".moreResults").remove();
            if (!this.filters_rendered) {
                this.render_filters();
                if(this.filter_tree.getAppliedFilters().length > 0) {
                    //Filters carried over from previous search.  Execute second search to apply filters.
                    this.post();
                    return;
                }
            }
            var results = this.resultsHtml(this.hits.hits);
            if (this.hits.hits.length == sjs.pageSize) {
                results += "<div class='moreResults'>More results</div>"
            }
            this.$results.append(results);
            $(".moreResults").click(function () {
                sjs.search.post(page + 1);
            });
        },
        query_object: function() {
            var core_query = {
                "query_string": {
                    "query": this.query,
                    "default_operator": "AND",
                    "fields": [this.content_field]
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
                        "content": {"number_of_fragments" : 0},
                        "context_3": {"number_of_fragments" : 0},
                        "context_7": {"number_of_fragments" : 0}
                    }
                }
            };

            if(!this.filters_rendered) {
                //Initial, unfiltered query.  Get potential filters.
                o['query'] = core_query;
                o['aggs'] =  {
                  "category": {
                      "terms" :{
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
                            "path": appliedFilters[i] + ".*"
                        }
                    })
                }
                o['query'] = {
                  "filtered": {
                     "query": core_query,
                      "filter": {
                         "or" : clauses
                      }
                    }
               };
            }

            return o;
        },
        post: function (page) {
            var page = page || 0;
            if (!page) {
                this.$results.empty();
                //$(window).scrollTop(0);
                this.$header.html("Searching <img src='/static/img/ajax-loader.gif' />");
            }

            var qobj = this.query_object();

            var url = sjs.searchUrl;
            if (page) {
                url += "&from=" + (page * sjs.pageSize);
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
                        if(jQuery.isEmptyObject(sjs.search.filter_tree.rawTree)) sjs.search.filter_tree = new sjs.FilterTree();
                        sjs.search.filter_tree.updateAvailableFilters(data.aggregations.category.buckets);
                    }
                    sjs.search.render(page);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    var html = "<div id='emptySearch' class='well'>" +
                    "<b>Sefaria Search encountered an error.</b><br />" +
                    "This feature is still in development. We're currently working to make our search experience both robust and useful. Please try your search again later." +
                    "</div>";
                    sjs.search.$results.html(html);
                }
            });

            $("#goto").blur();

            sjs.track.search(this.query);
        }
    },
    //FilterTree object - build for category filters
    FilterNode: function() {
        this.children = [];
        this.parent = null;
        this.selected = 0; //0 - not selected, 1 - selected, 2 - partially selected
    },

    FilterTree: function() {
        sjs.FilterNode.call(this); //Inherits from FilterNode
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
        $.each(this.rawTree, walker);
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
        //Aggregate counts, then sort rawTree into sortedTree and add Hebrew using sjs.toc as reference
        //Nod to http://stackoverflow.com/a/17546800/213042
        this._aggregate();

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

    toHtml: function() {
        var html = '<ul>';
        if (this.hasChildren()) {
            for (var i = 0; i < this.children.length; i++) {
                html += this.children[i].toHtml();
            }
        }
        html += "</ul>";
        return html;
    },

    getAppliedFilters: function() {
        var results = [];
        results = results.concat(this.orphanFilters);
        for (var i = 0; i < this.children.length; i++) {
            results = results.concat(this.children[i].getAppliedFilters());
        }
        return results;
    },
    setAppliedFilters: function(paths) {
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
    },
    _deriveState: function() {
        //noop on root node
    }
});


$(function() {

	$("#gotoBox").insertAfter("#searchHeader");
    $("#gotoBox").addClass("searchPage");
    $("body").addClass("searchPage");

    $("#languageToggle").show();
    $("#languageToggle #bilingual").hide();

	var vars = getUrlVars();
    if ("context" in vars) {
        sjs.search.set_presentation_context(vars["context"]);
    }
	if ("q" in vars) {
		var query = vars["q"].replace(/\+/g, " ")
		$("#goto").val(query);
        sjs.search.query = query;
        sjs.search.clear_available_filters();
		sjs.search.post();
	}			
	$(window).bind("statechange", function(e) {
		var State = History.getState();
		if (State && State.data && State.data.q) {
			page = State.data.page || 0;
            sjs.search.query = State.data.q;
            sjs.search.clear_available_filters();
			sjs.search.post(page);
		}
	})
});
sjs = sjs || {};

sjs.pageSize = 100;

$.extend(sjs, {
    currentPage: "search",
    currentFacet: null,
    searchUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search?size=" + sjs.pageSize,

    search: {
        available_filters: [],
        applied_filters: [],
        filters_rendered: false,
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
            '<a href="/' + normRef(s.ref) + '">' + s.ref + "</a>" +
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
        filterHtml: function() {
            //sort
            var html="<ul>";
            for(var i = 0; i < this.available_filters.length; i++) {
                var checked = false;
                if ($.inArray(this.available_filters[i]["key"], this.applied_filters) > -1) {
                    checked = true;
                }
                html += '<li><input type="checkbox" class="filter filter_leaf" ' + (checked?'checked="checked"':'') + ' name="' + this.available_filters[i]["key"] +  '"/> ' + this.available_filters[i]["key"] + ' (' + this.available_filters[i]["doc_count"] + ')'  + ' </li>';
            }
            html += "</ul>";
            return html;
        },
        render_filters: function() {
            if (!this.filters_rendered) {
                this.$filters.show();
                var filters = this.filterHtml();
                this.$filters.append(filters)
                $("#searchFilters .filter").change(function(e) {
                    if (this.checked) {
                        sjs.search.applied_filters.push(this.name)
                    } else {
                        var index = sjs.search.applied_filters.indexOf(this.name);
                        if (index > -1) {
                            sjs.search.applied_filters.splice(index, 1);
                        }
                    }
                    sjs.search.post()
                });
            this.filters_rendered = true;
            }
        },
        clear_available_filters: function() {
            this.$filters.empty();
            //this.applied_filters = [];
            this.available_filters = [];
            this.filters_rendered = false;
        },
        render: function() {
            this.$header.html(this.hits.total + " results for <b>" + this.query + "</b>");
            this.$results.find(".moreResults").remove();
            if (!this.filters_rendered) {
                this.render_filters();
                if(this.applied_filters.length > 0) {
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
            } else {
                //Filtered query.  Add clauses.  Don't re-request potential filters.
                var clauses = [];
                for (var i = 0; i < this.applied_filters.length; i++) {
                    clauses.push({
                        "regexp": {
                            "path": this.applied_filters[i] + ".*"
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
                        sjs.search.available_filters = data.aggregations.category.buckets;
                    }
                    sjs.search.render();
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
        this.selected = 0; //0 - not selected, 1 - selected, 2 - partially selected
    },

    FilterTree: function() {
        sjs.FilterNode.call(this); //Inherits from FilterNode
        this.rawTree = {};
        this.sortedTree = [];
    }

});
/* Working with filter trees:
1) Add all Available Filters with addAvailableFilter
2) _build

 */
sjs.FilterNode.prototype = {
    append : function(child) {
        this.children.push(child);
    }
};


sjs.FilterTree.prototype = Object.create(sjs.FilterNode.prototype)
sjs.FilterTree.prototype.constructor = sjs.FilterTree;
$.extend(sjs.FilterTree.prototype, {
    addAvailableFilter: function(key, heKey, data) {
        //key is a '/' separated key list, data is an arbitrary object
        //Based on http://stackoverflow.com/a/11433067/213042
        var keys = key.split("/");
        var heKeys = heKey.split("/");
        var base = this.rawTree;

        // If a value is given, remove the last name and keep it for later:
        var lastName = arguments.length === 3 ? keys.pop() : false;

        // Walk the hierarchy, creating new objects where needed.
        // If the lastName was removed, then the last object is not set yet:
        var i;
        for(i = 0; i < keys.length; i++ ) {
            base = base[ keys[i] ] = base[ keys[i] ] || {"_he": heKeys[i]};
        }

        // If a value was given, set it to the last name:
        if( lastName ) {
            base = base[ lastName ] = data;
            base["_he"] = heKeys[i];
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
        //Aggregate counts, then sort rawTree into sortedTree using sjs.toc as reference
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
                    "heTitle": rawnode._he,
                    "doc_count": rawnode.doc_count
                });
                path.pop();
                return node;
            }
            catch (e) {
                path.pop();
                return false;
            }
        }
    }
});


$(function() {

	$("#goto").addClass("searchPage");			
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
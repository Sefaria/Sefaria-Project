sjs = sjs || {};

sjs.pageSize = 100;

$.extend(sjs, {
    currentPage: "search",
    currentFacet: null,
    searchUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search?size=" + sjs.pageSize,

    search: {
        available_filters: [],
        applied_filters: [],
        filters_shown: false,
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
            if (this.available_filters.length > 0) {
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
                    sjs.search.search()
                });
            this.filters_shown = true;
            }
        },
        clear_filters: function() {
            this.$filters.empty();
            this.applied_filters = [];
            this.available_filters = [];
            this.filters_shown = false;
        },
        render: function() {
            this.$header.html(this.hits.total + " results for <b>" + this.query + "</b>");
            this.$results.find(".moreResults").remove();
            if (!this.filters_shown) {
                this.render_filters();
            }
            var results = this.resultsHtml(this.hits.hits);
            if (this.hits.hits.length == sjs.pageSize) {
                results += "<div class='moreResults'>More results</div>"
            }
            this.$results.append(results);
            $(".moreResults").click(function () {
                sjs.search(this.query, page + 1);
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


            if(this.applied_filters.length == 0) {
                //Initial, unfiltered query.  Get potential filters.
                o['query'] = core_query;
                o['aggs'] =  {
                  "category": {
                    "terms" :{
                      "field": "path"
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
        search: function (page) {
            var page = page || 0;
            if (!page) {
                this.$results.empty();
                $(window).scrollTop(0);
                this.$header.html("Searching <img src='/static/img/ajax-loader.gif' />");
            }

            var post = this.query_object();

            var url = sjs.searchUrl;
            if (page) {
                url += "&from=" + (page * sjs.pageSize);
            }
            $.ajax({
                url: url,
                type: 'POST',
                data: JSON.stringify(post),
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

            var facetsHtml = function (facets) {
                facets = facets.category.terms;
                var html = "";
                for (var i = 0; i < facets.length; i++) {
                    html += "<div class='facet' data-facet='" + facets[i].term + "'>" +
                    facets[i].term + " (" + facets[i].count + ")" +
                    "</div>";
                }
                return html;
            };

            $("#goto").blur();

            sjs.track.search(this.query);
        }
    }
});

$(function() {

	$("#goto").addClass("searchPage");			

	var vars = getUrlVars();
    if ("context" in vars) {
        sjs.search.set_presentation_context(vars["context"]);
    }
	if ("q" in vars) {
		var query = vars["q"].replace(/\+/g, " ")
		$("#goto").val(query);
        sjs.search.query = query;
        sjs.search.clear_filters();
		sjs.search.search();
	}			
	$(window).bind("statechange", function(e) {
		var State = History.getState();
		if (State && State.data && State.data.q) {
			page = State.data.page || 0;
            sjs.search.query = State.data.q;
            sjs.search.clear_filters();
			sjs.search.search(page);
		}
	})
});
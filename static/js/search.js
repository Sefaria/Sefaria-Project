sjs = sjs || {};

sjs.pageSize = 100;

$.extend(sjs, {
    currentPage: "search",
    currentFacet: null,
    searchUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search?size=" + sjs.pageSize,

    search: {
        category_filters: [],
        query_context: 1,
        presentation_context: 1,
        query: "",
        hits: {},
        $header: $("#searchHeader"),
        $results: $("#searchResults"),
        $facets: $("#searchFacets"),
        set_presentation_context: function (level) {
            this.presentation_context = level;
            this.render()
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
            var snippet = result.highlight ? result.highlight.content.join("...") : s.content;
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
        render: function() {
            this.$header.html(this.hits.total + " results for <b>" + this.query + "</b>");
            this.$results.find(".moreResults").remove();
            var results = this.resultsHtml(this.hits.hits);
            if (this.hits.hits.length == sjs.pageSize) {
                results += "<div class='moreResults'>More results</div>"
            }
            this.$results.append(results);
            $(".moreResults").click(function () {
                sjs.search(this.query, page + 1);
            });
        },
        search: function (page) {
            var page = page || 0;
            if (!page) {
                this.$results.empty();
                $(window).scrollTop(0);
                this.$header.html("Searching <img src='/static/img/ajax-loader.gif' />");
            }

            var post = {
                "query": {
                    "query_string": {
                        "query": this.query,
                        "default_operator": "AND"
                    }
                },
                "highlight": {
                    "pre_tags": ["<b>"],
                    "post_tags": ["</b>"],
                    "fields": {
                        "content": {}
                    }
                }
            };

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
                    sjs.search.render();
                },
                error: function () {
                    html = "<div id='emptySearch' class='well'>" +
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
	if ("q" in vars) {
		var query = vars["q"].replace(/\+/g, " ")
		$("#goto").val(query);
        sjs.search.query = query;
		sjs.search.search();
	}			
	$(window).bind("statechange", function(e) {
		var State = History.getState();
		if (State && State.data && State.data.q) {
			page = State.data.page || 0;
            sjs.search.query = State.data.q;
			sjs.search.search(page);
		}
	})
});
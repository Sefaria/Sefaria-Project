sjs = sjs || {};

sjs.pageSize = 40;

$.extend(sjs, {
	currentPage: "search",
	currentFacet: null,
	searchUrl: "http://search.sefaria.org:9200/sefaria/_search?size=" + sjs.pageSize,
	search: function(query, page) {

			$header = $("#searchHeader");
			$results = $("#searchResults");
			$facets = $("#searchFacets");
			$header.text("");

			var page = page || 0;
			if (!page) {
				$results.empty();
				$(window).scrollTop(0);
			}

			var post =   {
							"query" : { 
								"query_string" : {
									"query" : query,
									"default_operator": "AND"
								} 
							},
							"highlight" : {
								"pre_tags" : ["<b>"],
        						"post_tags" : ["</b>"],
						        "fields" : {
						            "content" : {}
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
				success: function(data) {
					$header.html(data.hits.total + " results for <b>" + query + "</b>");
					$results.find(".moreResults").remove();
					var results = resultsHtml(data.hits.hits);
					if (data.hits.hits.length == sjs.pageSize) {
						results += "<div class='moreResults'>More results</div>"
					}
					$results.append(results);
					$(".moreResults").click(function(){
						sjs.search(query, page+1);
					});
				},
				error: function() {
					html = "<div id='emptySearch' class='well'>" +
						"<b>Sefaria Search encountered an error.</b><br />" +
						"This feature is still in development. We're currently working to make our search experience both robust and useful. Please try your search again later." + 
					"</div>";
					$results.html(html);
				}
			});

			var resultsHtml = function(results) {
				var html = "";

				for (var i = 0; i < results.length; i++) {
					if (results[i]._type == "text") {
						html += textResult(results[i]);
					} else if (results[i]._type == "sheet") {
						html += sheetResult(results[i]);
					}
				}
				if (results.length == 0) {
					html = "<div id='emptySearch' class='well'>" +
								"<b>Sefaria Search is still under development.</b><br />" +
								"Hebrew words are searched exactly as entered; different forms of the same word may produce different results." + 
							"</div>";
				}		
				return html;
			}

			var textResult = function(result) {
					var s = result._source;
					var snippet = result.highlight ? result.highlight.content.join("...") : s.content;
					snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
					html = "<div class='result'>" +
								'<a href="/' + normRef(s.ref)+ '">' + s.ref + "</a>" +
								"<div class='snippet'>" + snippet + "</div>" +
								"<div class='version'>" + s.version + "</div>" +
							"</div>";
					return html;
			};

			var sheetResult = function(result) {
					var s = result._source;
					var snippet = result.highlight ? result.highlight.content.join("...") : s.content;
					snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
					html = "<div class='result'>" +
								'<a href="/sheets/' + s.sheetId+ '">' + s.title + "</a>" +
								"<div class='snippet'>" + snippet + "</div>" +
								"<div class='version'>" + s.version + "</div>" +
							"</div>";
					return html;
			};

			var facetsHtml = function(facets) {
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

			sjs.track.search(query);
		}
});

$(function() {

	$("#goto").addClass("searchPage");			

	var vars = getUrlVars();
	if ("q" in vars) {
		var query = vars["q"].replace(/\+/g, " ")
		$("#goto").val(query);
		sjs.search(query);
	}			
	$(window).bind("statechange", function(e) {
		var State = History.getState();
		if (State && State.data && State.data.q) {
			page = State.data.page || 0;
			sjs.search(State.data.q, page);
		}
	})
});
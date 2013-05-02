{% load sefaria_tags %}

<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};
	
	$.extend(sjs, {
		books: {{ titlesJSON|default:"[]" }},
		currentFacet: null,
		navQuery: function(query) {
			window.location = "/" + normRef(query);
		},
		search: function(query, page) {
			if (sjs.currentPage !== 'search') {
				window.location="/search?q=" + query.replace(/ /g, "+"); 
			}

			$header = $("#searchHeader");
			$results = $("#searchResults");
			$facets = $("#searchFacets");
			$header.text("");

			page = page || 0;
			var pageSize = 40;
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
							"facets" : {
								"category" : { "terms" : {"field" : "categories"} },
							},
							"highlight" : {
								"pre_tags" : ["<b>"],
        						"post_tags" : ["</b>"],
						        "fields" : {
						            "content" : {}
						        }
    						}
						};
			if (sjs.currentFacet) {
				post["facets"] = {
					"category" : { "terms" : {"field" : "categories"} },
				};
 			}

 			var url = "http://localhost:9200/sefaria/_search?size=" + pageSize;
 			if (page) {
 				url += "&from=" + (page * pageSize);
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
					if (data.hits.hits.length == pageSize) {
						results += "<div class='moreResults'>More results</div>"
					}
					$results.append(results);
					$(".moreResults").click(function(){
						sjs.search(query, page+1);
					});
					$facets.html(facetsHtml(data.facets));

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
								"Hebrew words are searched exactly as entered; use of vowels, prefixes and suffixes may affect your results." + 
							"</div>";
				}		
				return html;
			}

			var textResult = function(result) {
					var s = result._source;
					var snippet = result.highlight ? result.highlight.content.join("...") : s.content;
					snippet = snippet.replace(/^[ .,;:!-)\]]+/, "");
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
					snippet = snippet.replace(/^[ .,;:!-)\]]+/, "");
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

			History.pushState({q: query}, "Search Jewish Texts | Sefaria.org", "/search?q=" + query);
			sjs.track.search(query);
		}
	});

	$(function() {
		// Open a text Box
		$("#goto").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches);
			}
		}).keypress(function(e) {
			if (e.keyCode == 13) {
				handleSearch();
			}
		});
		$("#openText").mousedown(handleSearch);

		var handleSearch = function() {
			$("#goto").focus();
			var query = $("#goto").val();
			if (query) {
				$("#goto").autocomplete("close");
				
				q = parseRef(query);
				console.log(q);
				if ($.inArray(q.book.replace(/_/g, " "), sjs.books) > 0) {
					sjs.navQuery(query);
					sjs.track.ui("Nav Query");
				} else {
					sjs.search(q.ref)
					sjs.track.ui("Search");
				}
			}
		}

		$(document).on("click touch", ".facet", function(e) {
			sjs.currentFacet = $(this).attr("data-facet");
			sjs.search($("#goto").val());
			$(this).addClass("active");
		});

		// Top Menus showing / hiding
		$("#sefaria, #textsMenu").on("click touch", function(e) {
			e.stopPropagation();
			if ($(this).hasClass("menuOpen")) { return; }
			$(".menuOpen").removeClass("menuOpen");
			$(this).addClass("menuOpen");
		});
		$("#textsMenu .category").on("mouseenter touch", function(e){
			if ($(this).hasClass("menuOpen")) { return; }
			$("#textsMenu .category.menuOpen").removeClass("menuOpen");
			$(this).addClass("menuOpen");
			$(this).parents(".category").addClass("menuOpen");
			e.stopPropagation();
		});
		$(window).click(function(){
			$(".menuOpen").removeClass("menuOpen");
		});

	    // Fill text details in Text Menu with AJAX 
	    $("#textsList .title a").on("click", function(e) {
	        e.preventDefault();
	        e.stopPropagation();

	        var $details = $(this).closest(".text").find(".details");
	        closing = $details.children().length

	        if (closing) {
	            $details.empty()
	            	.closest(".text").removeClass("hasDetails");
	        } else {
		        var url = "/api/counts" + $(this).attr("href");
		        $.getJSON(url, sjs.makeTextDetails);
		        $details.addClass("makeTarget");	        	
	        }

	    });
	    $("#textsList .text").on("click", function() {
	    	if (!$(this).hasClass("hasDetails")) {
	    		$(this).find(".title a").trigger("click");
	    	}
	    });

	    // Move Goto box, controls into hidden menu for small screen size 
	    var mobileLayout = function() {
	    	var width = $(window).width();
	    	var $gotoBox = $("#gotoBox");
			var $controls = $("#controls");

			// gotoBox into options bar	    	
	    	if (width >= 500 && $gotoBox.parent().attr("id") === "rightButtons") {
	    		$("#breadcrumbs").before($gotoBox);
	    	} else if (width < 500 && $gotoBox.next().attr("id") === "breadcrumbs") {
	    		$gotoBox.appendTo("#rightButtons");
	    	}

	    	// Source Sheets controls into options bar
	    	if (width >= 800 && $controls.parent().attr("id") === "rightButtons") {
	    		$("#sheet").before($controls);
	    	} else if (width < 800 && $controls.next().attr("id") === "sheet") {
	    		$controls.prependTo("#rightButtons");
	    	}
	    };
	    $(window).resize(mobileLayout);
	    mobileLayout();

	    // Show Options Bar button 
	    var showOptionsBar = function() {
	    	$("#accountBox").appendTo("#rightButtons");
	    	$("#rightButtons").show();
	    };
	    var hideOptionsBar = function() {
	    	$("#accountBox").prependTo("#rightButtons");
	    	$("#rightButtons").css("display", "");
	    };
	    $("#showOptions").click(function(e){
	    	if ($("#rightButtons").is(":visible")) {
	    		hideOptionsBar();
	    	} else {
	    		showOptionsBar();
	    		e.stopPropagation();
	    	}
	    })
	    $("#rightButtons").click(function(e){e.stopPropagation();});
	    $(window).click(hideOptionsBar);
	});
{% endautoescape %}
</script>
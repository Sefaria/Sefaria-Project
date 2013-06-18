{% load sefaria_tags %}

<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};
	
	$.extend(sjs, {
		books: {{ titlesJSON|default:"[]" }},
		help: {
			videos: {
				intro:       "http://www.youtube.com/embed/LAIZizctIyo?enablejsapi=1&rel=0&autoplay=1",
				tutorial:    "http://www.youtube.com/embed/LAIZizctIyo?enablejsapi=1&rel=0&autoplay=1",
				sheets:      "http://www.youtube.com/embed/upvq_OPZkzU?enablejsapi=1&rel=0&autoplay=1",
				translate:   "http://www.youtube.com/embed/aNg2AHC_xXY?enablejsapi=1&rel=0&autoplay=1",
				add:         "http://www.youtube.com/embed/aNg2AHC_xXY?enablejsapi=1&rel=0&autoplay=1",
				edit:        "http://www.youtube.com/embed/aNg2AHC_xXY?enablejsapi=1&rel=0&autoplay=1",
				connections: "http://www.youtube.com/embed/aNg2AHC_xXY?enablejsapi=1&rel=0&autoplay=1",
				newtext:     "http://www.youtube.com/embed/aNg2AHC_xXY?enablejsapi=1&rel=0&autoplay=1"
			}
		},
		navQuery: function(query) {
			window.location = "/" + normRef(query);
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
				if ($.inArray(q.book.replace(/_/g, " "), sjs.books) > 0) {
					sjs.navQuery(query);
					sjs.track.ui("Nav Query");
				} else {
					if (sjs.currentPage !== 'search') {
						window.location="/search?q=" + query.replace(/ /g, "+"); 
					} else {
						History.pushState({q: query}, "Search Jewish Texts | Sefaria.org", "/search?q=" + query);
					}
				}
			}
		};

		/*
		$(document).on("click touch", ".facet", function(e) {
			sjs.currentFacet = $(this).attr("data-facet");
			sjs.search($("#goto").val());
			$(this).addClass("active");
		});
		*/

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


	    // Help modal - open/close
	    $("#help").click(function(e){
	    	$("#overlay, #helpModal").show().position({of: window});
	    	$(".menuOpen").removeClass("menuOpen");
	    	e.preventDefault();
	    	e.stopPropagation();
	    });
	    $("#helpClose").click(function() {
	    	$("#overlay, #helpModal").hide();
    		var iframe = $("#helpVideo")[0].contentWindow;
    		iframe.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
	    });

	    // Help modal - switch videos
	    $("#helpVideoButtons .btn").click(function(){
	    	$("#helpVideoButtons .btn").removeClass("btn-success");
	    	$(this).addClass("btn-success");
	    	var vid = this.id.substring(5) // remove 'help-' from id
	    	var url = sjs.help.videos[vid];
	    	$("#helpVideo").attr("src", url); 
	    })


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
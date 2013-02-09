{% load sefaria_tags %}


<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};
	
	$.extend(sjs, {
		books: {{ titlesJSON|default:"[]" }},
	});

	$(function() {
		// Open a text Box
		$("#goto").autocomplete({ source: sjs.books })
			.keypress(function(e) {
				if (e.keyCode == 13) {
					$("#openText").trigger("click");
				}
		});
		$("#openText").mousedown(function() { 
			if ($("#goto").val()) {
				window.location = makeRef(parseRef($("#goto").val()));
			}
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

	    // Move Goto box into hidden menu for small screen size 
	    var placeGoto = function() {
	    	var width = $(window).width();
	    	var $gotoBox = $("#gotoBox");
	    	if (width >= 500 && $gotoBox.parent().attr("id") === "rightButtons") {
	    		$("#breadcrumbs").before($gotoBox);
	    	} else if (width < 500 && $gotoBox.next().attr("id") === "breadcrumbs") {
	    		$gotoBox.appendTo("#rightButtons");
	    	}
	    };
	    $(window).resize(placeGoto);
	    placeGoto();

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
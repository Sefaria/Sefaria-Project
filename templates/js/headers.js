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
	});
{% endautoescape %}
</script>
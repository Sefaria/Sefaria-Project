(function() {
    var sefaria = {
        init: function() {
        	var wrapRefs = function(titles) {

				var refReStr = "(" + titles.books.join("|") + ") (\\d+[ab]?)(:(\\d+)([\\-–]\\d+(:\\d+)?)?)?";
				var refRe = new RegExp(refReStr, "gi");
				
				var wrapTextNode = function(node) {
					var refText = text.replace(refRe, '<span class="sefariaLink" data-ref="$1.$3$4">$1 $3$4</span>');
				};
				
        	};
        	$.getJSON("https://www.sefaria.org/api/index/titles", wrapRefs)
        }	
    }; 
    
    if (typeof jQuery=='undefined') {
        jq = document.createElement( 'script' ); jq.type = 'text/javascript'; jq.async = true;
        jq.src = ('https:' == document.location.protocol ? 'https://' : 'http://') + 'ajax.googleapis.com/ajax/libs/jquery/1/jquery.min.js';  
        jq.onload=bookmarklet.init;  
        document.body.appendChild(jq);  
    }  
    else {  
        sefaria.init();  
    }	
})(); 
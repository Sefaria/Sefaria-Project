{% autoescape off %}
//called as sefaria.tag("#element-id");

(function(ns){

    //Test browser support
    var supports = !!document.querySelectorAll; //&& !!window.addEventListener;
    if ( !supports ) return;

    //private scoping
    var base_url = 'http://www.sefaria.org/';
    var books = {
        "en" : {{ books.en }},
        "he" : {{ books.he }}
    };
    var book_reg = RegExp('(' + books.en.join('|') + '|' + books.he.join('|') + ')','gi');

    //function priv(){}

    //public api
    ns.link = function(selector) {
        var elems = document.querySelectorAll(selector);
        for (var i = 0; i < elems.length; i++) {
            var elem = elems[i];
            var initialHtml = elem.innerHTML;
            elem.innerHTML = initialHtml.replace(book_reg, "<span class='sefaria-reference'>$&</span>")
        }
    };

}(this.sefaria = this.sefaria || {}));

{% endautoescape %}

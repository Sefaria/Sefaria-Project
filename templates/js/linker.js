{% autoescape off %}

(function(ns){

    //Test browser support
    var supports = !!document.querySelector; //&& !!window.addEventListener;
    if ( !supports ) return;

    //private scoping
    var base_url = 'http://www.sefaria.org/';
    var books = {
        "en" : {{ books.en }},
        "he" : {{ books.he }}
    };
    function priv(){}

    //public api
    ns.tag = function(selector) {
        var elem = document.querySelector(selector)

    };

}(this.sefaria = this.sefaria || {}));



//called as this.sefaria.tag("#element-id");
{% endautoescape %}

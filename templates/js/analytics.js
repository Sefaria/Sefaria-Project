{% if not OFFLINE and GOOGLE_ANALYTICS_CODE %}
    // GOOGLE ANALYTICS
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

    ga('create', '{{ GOOGLE_ANALYTICS_CODE }}', 'auto');
    // Send first pageview after S2 is loaded, so that more data can be added.
    // ga('send', 'pageview');


    window.onerror = function(msg, url, lineNumber) {
        ga('send', 'event', 'Javascript Errors',  msg, url + ':' + lineNumber);
    };
{% else  %}
    var ga = function(){};
    ga._mock = true;
{% endif %}
window.ga = ga;

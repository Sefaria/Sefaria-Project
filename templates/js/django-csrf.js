// --- Django CSRF support for AJAX -----------
//
// Included into server-rendered pages via `include`, so Django inlines
// {{ csrf_token }} directly below. We use that value, never the csrftoken
// cookie: on a cauldron the inherited .sefaria.org cookie can disagree with
// what Django validates against, yielding a 403. Bundled React pages instead
// use the runtime reader in static/js/sefaria/csrf.js.

jQuery(document).ajaxSend(function(event, xhr, settings) {
    function sameOrigin(url) {
        // url could be relative or scheme relative or absolute
        var host = document.location.host; // host + port
        var protocol = document.location.protocol;
        var sr_origin = '//' + host;
        var origin = protocol + sr_origin;
        // Allow absolute or scheme relative URLs to same origin
        return (url == origin || url.slice(0, origin.length + 1) == origin + '/') ||
            (url == sr_origin || url.slice(0, sr_origin.length + 1) == sr_origin + '/') ||
            // or any other URL that isn't scheme relative or absolute i.e relative.
            !(/^(\/\/|http:|https:).*/.test(url));
    }
    function safeMethod(method) {
        return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
    }

    if (!safeMethod(settings.type) && sameOrigin(settings.url)) {
        xhr.setRequestHeader("X-CSRFToken", "{{ csrf_token }}");
    }
});
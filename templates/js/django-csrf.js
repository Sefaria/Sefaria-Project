// --- Django CSRF support for AJAX -----------
//
// NOTE: getCsrfToken() below is intentionally a standalone copy of
// static/js/sefaria/csrf.js. This file is included inline (via Django's include
// tag) into legacy server-rendered pages that do NOT load the webpack bundle, so
// it cannot import the shared helper. Keep the meta-tag-first logic here in sync
// with sefaria/csrf.js. The bundled twin (static/js/lib/django-csrf.js) imports
// the shared helper instead of duplicating it.

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

    function getCsrfToken() {
        // Read the server-rendered token, never the cookie. A cauldron host
        // inherits the parent-domain (.sefaria.org) csrftoken cookie alongside
        // its own; a cookie read returns the first match while Django validates
        // against the last, so the cookie can disagree with what Django expects
        // (a 403). The meta tag always matches what Django validates. There is
        // no cookie fallback by design — see static/js/sefaria/csrf.js.
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) { return meta.content; }
        console.warn('csrf-token meta tag missing — POST will likely 403. Add <meta name="csrf-token"> to this page.');
        return '';
    }

    if (!safeMethod(settings.type) && sameOrigin(settings.url)) {
        xhr.setRequestHeader("X-CSRFToken", getCsrfToken());
    }
});
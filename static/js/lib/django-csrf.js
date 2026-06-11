var $  = require('jquery');
// Canonical CSRF token reader (meta tag first, cookie fallback). Shared with the
// fetch()-based call sites so the dual-cookie fix lives in exactly one place.
var getCsrfToken = require('../sefaria/csrf').getCsrfToken;

function init() {
    $(document).ajaxSend(function(event, xhr, settings) {
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
            // Prefer the server-rendered token over the cookie. A cauldron host
            // inherits the parent-domain (.sefaria.org) csrftoken cookie alongside
            // its own, and getCookie returns the first match while Django validates
            // against the last — the meta tag always matches what Django validates.
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta && meta.content) { return meta.content; }
            return getCookie('csrftoken');
        }

        if (!safeMethod(settings.type) && sameOrigin(settings.url)) {
            xhr.setRequestHeader("X-CSRFToken", getCsrfToken());
        }
    });
}

module.exports.init = init;
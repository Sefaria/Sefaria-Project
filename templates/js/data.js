{% load sefaria_tags %}
{% autoescape off %}
//all vars in this file will be available in global js scope

//used to pass down Django settings which are needed in javascript.
var DJANGO_SETTINGS = {
  OFFLINE: "{{ OFFLINE }}" === "True" ? true : false,
  GOOGLE_ANALYTICS_CODE: "{{ GOOGLE_ANALYTICS_CODE }}"
};

var ga;
if (DJANGO_SETTINGS.OFFLINE || typeof window === 'undefined') {
  console.log("WINDOW UNDEFINED");
  ga = function() {};
} else {
  console.log("WINDOW all good");
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
}

var DJANGO_DATA_VARS = {
  _dataLoaded:         true,
  toc:                 {{ toc_json }},
  search_toc:          {{ search_toc_json }},
  terms:               {{ terms_json}},
  books:               {{ titlesJSON }},
  calendar:            {
                          parasha: "{{ parasha_ref }}",
                          parashaName: "{{ parasha_name }}",
                          heParashaName: "{{ he_parasha_name }}",
                          haftara: "{{ haftara_ref }}",
                          daf_yomi: "{{ daf_yomi_ref }}"
                       },
  searchBaseUrl:       '{{ SEARCH_URL|default:"http://localhost:9200" }}',
  searchIndex:         '{{ SEARCH_INDEX_NAME }}',
  loggedIn:            {% if user.is_authenticated %}true{% else %}false{% endif %},
  is_moderator:        {% if user.is_staff %}true{% else %}false{% endif %},
  is_editor:           {% if user|has_group:"Editors" %}true{% else %}false{% endif %},
  notificationCount:   {{ notifications_count|default:'0' }},
  notifications:       {{ notifications_json|default:'[]' }},
  notificationsHtml:   "{{ notifications_html|escape_quotes }}",
  recentlyViewed:      {{ recentlyViewed|jsonify }},
  globalWarningMessage: {% if GLOBAL_WARNING %}"{{ GLOBAL_WARNING_MESSAGE}}"{% else %}null{% endif %},
  interruptingMessage: {{ interrupting_message_json|default:'null' }},
  _email:              "{{ request.user.email|default:'' }}",
  _uid:                {{ request.user.id|default:"null" }},
  _partner_group:      "{{ partner_group }}",
  _partner_role:       "{{ partner_role }}"
};
{% endautoescape %}

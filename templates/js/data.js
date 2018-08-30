{% load sefaria_tags %}
{% autoescape off %}
//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = {
  _dataLoaded:          true,
  toc:                  {{ toc_json }},
  search_toc:           {{ search_toc_json }},
  terms:                {{ terms_json}},
  books:                {{ titlesJSON }},
  calendars:            {{ calendars }},
  searchBaseUrl:       '{{ SEARCH_URL|default:"http://localhost:9200" }}',
  searchIndexText:     '{{ SEARCH_INDEX_NAME_TEXT }}',
  searchIndexSheet:    '{{ SEARCH_INDEX_NAME_SHEET }}',
  loggedIn:             {% if user.is_authenticated %}true{% else %}false{% endif %},
  is_moderator:         {% if user.is_staff %}true{% else %}false{% endif %},
  is_editor:            {% if user|has_group:"Editors" %}true{% else %}false{% endif %},
  notificationCount:    {{ notifications_count|default:'0' }},
  notifications:        {{ notifications_json|default:'[]' }},
  notificationsHtml:    "{{ notifications_html|escape_quotes }}",
  recentlyViewed:       {{ recentlyViewed|jsonify }},
  interfaceLang:        "{{ request.interfaceLang }}",
  globalWarningMessage: {% if GLOBAL_WARNING %}"{{ GLOBAL_WARNING_MESSAGE}}"{% else %}null{% endif %},
  interruptingMessage:  {{ interrupting_message_json|default:'null' }},
  _email:               "{{ request.user.email|default:'' }}",
  _debug:               {% if DEBUG %}true{% else %}false{% endif %},
  _uid:                 {{ request.user.id|default:"null" }},
  _partner_group:       "{{ partner_group }}",
  _partner_role:        "{{ partner_role }}"
};
{% endautoescape %}

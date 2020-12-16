{% load sefaria_tags %}
{% autoescape off %}
//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = {
  _dataLoaded:          true,
  toc:                  {{ toc_json }},
  search_toc:           {{ search_toc_json }},
  topic_toc:            {{ topic_toc_json }},
  terms:                {{ terms_json}},
  books:                {{ titles_json }},
  searchIndexText:     '{{ SEARCH_INDEX_NAME_TEXT }}',
  searchIndexSheet:    '{{ SEARCH_INDEX_NAME_SHEET }}',

  /*calendars:            {{ calendars }}, //not in baseprops
  notificationCount:    {{ notifications_count|default:'0' }},
  notificationsHtml:    "{{ notifications_html|escape_quotes }}", //not in baseprops
  saved:                {{ saved|jsonify|default:'[]'}}, //not in baseprops
  last_place:           {{ last_place|jsonify|default:'[]'}},
  _uid:                 {{ request.user.id|default:"null" }},
  _email:               "{{ request.user.email|default:'' }}",
  slug:                 "{{ slug|default:'' }}",
  full_name:            "{{ full_name|escape_quotes|default:'' }}",
  following:            {{ following|jsonify|default:'[]' }}, //not in baseprops
  profile_pic_url:      "{{ profile_pic_url|default:'' }}",
  is_moderator:         {{ is_moderator|yesno:'true, false' }},
  is_editor:            {{ is_editor|yesno:'true, false' }},
  is_history_enabled:   {% if request.user.is_authenticated %}{{reading_history|yesno:'true,false'}}{% else %}true{% endif %},
  interfaceLang:        "{{ request.interfaceLang }}",
  interruptingMessage:  {{ interrupting_message_json|default:'null' }},
  _siteSettings:        {{ SITE_SETTINGS|jsonify }},
  _debug:               {% if DEBUG %}true{% else %}false{% endif %},*/
};
{% endautoescape %}

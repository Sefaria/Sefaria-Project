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
  calendars:            {{ calendars }},
  searchIndexText:     '{{ SEARCH_INDEX_NAME_TEXT }}',
  searchIndexSheet:    '{{ SEARCH_INDEX_NAME_SHEET }}',
  is_moderator:         {{ is_moderator|yesno:'true, false' }},
  is_editor:            {{ is_editor|yesno:'true, false' }},
  notificationCount:    {{ notifications_count|default:'0' }},
  notifications:        {{ notifications_json|default:'[]' }},
  notificationsHtml:    "{{ notifications_html|escape_quotes }}",
  saved:                {{ saved|jsonify }},
  slug:                 "{{ slug|default:'' }}",
  full_name:            "{{ full_name|default:'' }}",
  following:            {{ following|default:'[]' }},
  profile_pic_url:      "{{ profile_pic_url|default:'' }}",
  last_place:           {{ last_place|jsonify}},
  following:            {{ following|default:'[]' }},
  interfaceLang:        "{{ request.interfaceLang }}",
  interruptingMessage:  {{ interrupting_message_json|default:'null' }},
  _siteSettings:        {{ SITE_SETTINGS|jsonify }},
  _email:               "{{ request.user.email|default:'' }}",
  _debug:               {% if DEBUG %}true{% else %}false{% endif %},
  _uid:                 {{ request.user.id|default:"null" }},
  _partner_group:       "{{ partner_group }}",
  _partner_role:        "{{ partner_role }}"
};
{% endautoescape %}

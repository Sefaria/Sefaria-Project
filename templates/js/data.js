{% load sefaria_tags %}
{% autoescape off %}
//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = {
  _dataLoaded:          true,
  toc:                  {{ toc_json }},
  topic_toc:            {{ topic_toc_json }},
  terms:                {{ terms_json}},
  books:                {{ titles_json }},
  searchIndexText:     '{{ SEARCH_INDEX_NAME_TEXT }}',
  searchIndexSheet:    '{{ SEARCH_INDEX_NAME_SHEET }}',
  virtualBooks:     {{virtual_books}}
};
{% endautoescape %}



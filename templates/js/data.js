{% load sefaria_tags %}
{% autoescape off %}

//all vars in this file will be available in global js scope
//The data her all comes from context_processors.py `large_data()` which in turn gets it from sefaria.text.Library functions that handle retrieving and caching it. 
//The data here is also cached because it also needs to be available to the Node server side rendering server.  
//For that to happen, any variable that gets added here needs to conform to that standard - a library function that can get/set+cache it and then also adding it to the list of
// keys in the variables `cacheKeyMapping`, `sharedCacheData` in `server.js`.  

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



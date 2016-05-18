{% autoescape off %}
var Sefaria = Sefaria || {};

var data = {
  toc:                {{ toc_json }},  
  books:              {{ titlesJSON }},
  booksDict:          {}, // populated below
  calendar:           {
                           parasha: "{{ parasha_ref }}",
                           parashaName: "{{ parasha_name }}",
                           haftara: "{{ haftara_ref }}",
                           daf_yomi: "{{ daf_yomi_ref }}"
                      },
  searchBaseUrl:      '{{ SEARCH_URL|default:"http://localhost:9200" }}',
  searchIndex:        '{{ SEARCH_INDEX_NAME }}',
  loggedIn:           {% if user.is_authenticated %}true{% else %}false{% endif %},
  is_moderator:       {% if user.is_staff %}true{% else %}false{% endif %},
  notificationCount:  {{ notifications_count|default:'0' }},
  notifications:      {{ notifications_json|default:'[]' }},
  _email:             "{{ request.user.email|default:'null' }}",
  _uid:               {{ request.user.id|default:"null" }}
};

// Transform books array into a dictionary for quick lookup
for (var i = 0; i < data.books.length; i++) {
  data.booksDict[data.books[i]] = 1;
}

for (var prop in data) {
  if (data.hasOwnProperty(prop)) {
    Sefaria[prop] = data[prop];
  }
}

if (typeof module !== 'undefined') {
  module.exports = Sefaria;
}
{% endautoescape %}
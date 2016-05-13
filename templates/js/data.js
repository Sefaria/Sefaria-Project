{% autoescape off %}
var Sefaria = Sefaria || {};

var data = {
    books:              {{ books }},
    booksDict:          {}, // populated below
    toc:                {{ toc }},
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

// Transform Sefaria.books array into a dictionary for quick lookup
for (var i = 0; i < Sefaria.books.length; i++) {
    Sefaria.booksDict[Sefaria.books[i]] = 1;
}


if (typeof module !== 'undefined') {
  module.exports = Sefaria;
}

{% endautoescape %}
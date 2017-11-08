{% autoescape off %}
{{ data_js }}
{{ sefaria_js }}
{% endautoescape %}
console.log("setting host at end of package");
Sefaria.apiHost = "https://www.sefaria.org";
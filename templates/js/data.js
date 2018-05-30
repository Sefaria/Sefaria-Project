{% autoescape off %}
//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = JSON.parse({{ data_props }});
{% endautoescape %}

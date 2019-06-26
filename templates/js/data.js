{% autoescape off %}
//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = {{ data_props }};


console.log(DJANGO_DATA_VARS);
{% endautoescape %}

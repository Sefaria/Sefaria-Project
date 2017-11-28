const React        = require('react'),
      ReactDOM     = require('react-dom'),
      DjangoCSRF   = require('./lib/django-csrf'),
    $            = require('./sefaria/sefariaJquery'),
      Form         = require('react-json-editor');


DjangoCSRF.init();

window.SefariaJsonEditor = function(schemaName, container) {

  if (schemaName in schemas) {
    var schema = schemas[schemaName];
  } else {
    alert("Unrecognized schema name");
    return;
  }

  const onSubmit = function(data, buttonValue, errors) {
    $.post("/api/" + schemaName + "/" + data.name,
      {"json": JSON.stringify(data)},
      function(data) { alert("Saved.")}
    );
  };

  ReactDOM.render(<Form 
          			schema={schema}
         			onSubmit={onSubmit} />,
          		  container);
};

const schemas = {
  "terms": {
    "title": "Terms Form",
    "description": "A form for editing Terms",
    "type": "object",
    "required": [
        "name",
        "titles",
      ],
    "properties": {
      "name": {
        "title": "Primary English Term name",
        "description": "The primary term name in English",
        "type": "string",
      },
      "titles": {
        "title": "List of variations of this term in English and Hebrew",
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "lang": {
              "type": "string"
            },
            "primary": {
                "type": "boolean"
            }
          }
        },
      	"required": ["text", "lang"],
      }
    }
  }
};
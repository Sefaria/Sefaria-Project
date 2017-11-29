const React           = require('react'),
      ReactDOM        = require('react-dom'),
      $               = require('jquery'),
      {default: Form} = require('react-jsonschema-form'),
      DjangoCSRF      = require('./lib/django-csrf');

DjangoCSRF.init();

window.SefariaJsonEditor = function(schemaName, initData, container) {

  if (schemaName in schemas) {
    var schema = schemas[schemaName];
  } else {
    alert("Unrecognized schema name");
    return;
  }

  const onSubmit = function(form) {
    var data = form.formData;
    $.post("/api/" + schemaName + "/" + data.name + "?update=1",
      {"json": JSON.stringify(data)},
      function(data) { 
      	if ("error" in data) {
      		alert(data.error);
      	} else {
      		alert("Saved.");      		
      	}
      }
    );
  };

  const log = data => { console.log(data); };
  ReactDOM.render(<Form 
					schema={schema}
					formData={initData}
					onSubmit={onSubmit}
					onError={log} />,
				  container);
};

const schemas = {
  "terms": {
    "type": "object",
    "required": [
        "name",
        "titles",
      ],
    "properties": {
      "name": {
        "title": "Primary English Term",
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
              "type": "string",
              "enum": ["en", "he"]
            },
            "primary": {
                "type": "boolean"
            }
          }
        },
      	"required": ["text", "lang"],
      }
    },
    "x-ordering": ["name", "titles"]
  }
};
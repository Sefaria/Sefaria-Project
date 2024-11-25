import "core-js/stable";
import "regenerator-runtime/runtime";
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from 'jquery';
import Form from 'react-jsonschema-form';
import DjangoCSRF  from './lib/django-csrf';

DjangoCSRF.init();

window.SefariaJsonEditor = function(schemaName, initData, container) {

  if (schemaName in schemas) {
    var schema = schemas[schemaName];
  } else {
    alert("Unrecognized schema name");
    return;
  }

  const isUpdate = initData.isUpdate;
  delete initData.isUpdate;

  const onSubmit = function(form) {
    var data = form.formData;
    alert("Saving... Please wait for confirmation.");
    $.post("/api/" + schemaName + "/" + data.name + (isUpdate ? "?update=1" : ""),
      {"json": JSON.stringify(data)},
      function(data) {
      	if ("error" in data) {
      		alert("Error: " + data.error);
      	} else {
      		alert("Saved.");
      	}
      }
    );
  };

  const onDelete = function() {
    if (confirm("Are you sure you want to delete this?")) {
      alert("Deleting... Please wait for confirmation.");
      $.ajax({
        url: "/api/" + schemaName + "/" + data.name,
        method: "DELETE",
        success: function(data) {
          if ("error" in data) {
            alert("Error: " + data.error);
          } else {
            alert("Deleted.");
            window.location = "/";
          }
        }
      });
    }
  };

  const log = data => { console.log(data); };
  ReactDOM.render(
    <div>
      <Form
				schema={schema}
				formData={initData}
				onSubmit={onSubmit}
				onError={log} />
      { isUpdate ? <div className="btn btn-danger" style={{"float":"right"}} onClick={onDelete}>Delete</div> : null }
    </div>,
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
      },
      "scheme": {
        "title": "Optional name of a term scheme this term participates in.",
        "type": "string"
      }
    },
    "x-ordering": ["name", "titles", "scheme"]
  }
};

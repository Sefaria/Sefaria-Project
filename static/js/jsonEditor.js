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
      var uiSchema = schemas[`${schemaName}UI`];
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
                uiSchema={uiSchema}
				formData={initData}
				onSubmit={onSubmit}
				onError={log} />
      { isUpdate ? <div className="btn btn-danger" style={{"float":"right"}} onClick={onDelete}>Delete</div> : null }
    </div>,
		container);
};

const schemas = {
  "termsUI": {
                  "titles":
                      {
                        'ui:options': {
                          orderable: false
                        }
                      },
                   // "scheme": {
                   //    "ui:placeholder": "Select a term scheme"
                   //
                   // }
                },
  "terms": {
    "type": "object",
    "required": [
        "name",
        "titles",
      ],
    "properties": {
      "name": {
        "title": "Primary English Term Name",
        "type": "string",
        "readOnly": true,
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
        "title": "Optional name of a term scheme this term participates in",
        "type": "string",
        "readOnly": true,

      }
    },
    "x-ordering": ["name", "titles", "scheme"]
  }
};
        // "enum": ['', 'Holidays',
        //    'Parasha',
        //    'Tag Category',
        //    'commentary_works',
        //    'he-month',
        //    'pseudo_toc_categories',
        //    'search_filter_categories',
        //    'section_names',
        //    'targum_titles',
        //    'toc_categories']
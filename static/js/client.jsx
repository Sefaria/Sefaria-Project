var $            = require('jquery'),
    React        = require('react'),
    ReactDOM     = require('react-dom'),
    SefariaReact = require('./s2'),
    DjangoCSRF   = require('./django-csrf');

$(function() {
  var container = document.getElementById('s2');
  var component;
  console.log("Django vars = ", Object.keys(DJANGO_VARS));
  console.log("In reader app = ", DJANGO_VARS.inReaderApp);
  if (DJANGO_VARS.inReaderApp) {
    DjangoCSRF.init();


    console.log("IN READER APP");
    component = React.createElement(SefariaReact.ReaderApp, DJANGO_VARS.propsJSON);
    ReactDOM.render(component, container);
  } else {
    var settings = {
      language: DJANGO_VARS.contentLang,
      layoutDefault: "segmented", //$.cookie("layoutDefault") ||
      layoutTalmud:  "continuous", //$.cookie("layoutTalmud")  ||
      layoutTanakh:  "segmented", //$.cookie("layoutTanakh")  ||
      color:         "light", //$.cookie("color")         ||
      fontSize:      62.5 //$.cookie("fontSize")      ||
    };
    var multiPanel    = $(window).width() > 600;
    console.log("NOT IN READER APP");
    component = React.createElement(SefariaReact.ReaderApp, {
      headerMode: true,
      multiPanel: multiPanel,
      initialRefs: [],
      initialFilter: [],
      initialMenu: null,
      initialQuery: null,
      initialSheetsTag: null,
      initialNavigationCategories: [],
      initialSettings: settings,
      initialPanels: [],
      interfaceLang: DJANGO_VARS.interfaceLang
    });
    ReactDOM.render(component, container);
    ReactDOM.render(React.createElement(SefariaReact.Footer), document.getElementById('footer'));

  }
});
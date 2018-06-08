const $            = require('./sefaria/sefariaJquery'),
      React        = require('react'),
      ReactDOM     = require('react-dom'),
      DjangoCSRF   = require('./lib/django-csrf'),
      SefariaReact = require('./ReaderApp');


$(function() {
  var container = document.getElementById('s2');
  var loadingPlaceholder = document.getElementById('appLoading');
  var footerContainer = document.getElementById('footer');
  var component;
  DjangoCSRF.init();
  var renderFunc = ReactDOM.hydrate;
  if (loadingPlaceholder){
    renderFunc = ReactDOM.render;
  }
  if (DJANGO_VARS.inReaderApp) {
    // Rendering a full ReaderApp experience
    Sefaria.unpackDataFromProps(DJANGO_VARS.props);
    component = React.createElement(SefariaReact.ReaderApp, DJANGO_VARS.props);
    renderFunc(component, container);
  
  } else if (DJANGO_VARS.containerId && DJANGO_VARS.reactComponentName) {
    // Rendering just a specifc component to a container
    container = document.getElementById(DJANGO_VARS.containerId);
    component = React.createElement(SefariaReact[DJANGO_VARS.reactComponentName], DJANGO_VARS.props);
    renderFunc(component, container);
    if (footerContainer){
      renderFunc(React.createElement(SefariaReact.Footer), footerContainer);
    }

  
  } else {
    // Rendering the Header & Footer only on top of a static page
    var settings = {
      language: DJANGO_VARS.contentLang,
      layoutDefault: $.cookie("layoutDefault") || "segmented",
      layoutTalmud:  $.cookie("layoutTalmud")  || "continuous",
      layoutTanakh:  $.cookie("layoutTanakh")  || "segmented",
      color:         $.cookie("color")         || "light",
      biLayout:      $.cookie("biLayout")      || "stacked",
      fontSize:      $.cookie("fontSize")      || 62.5
    };
    var multiPanel = $(window).width() > 600;
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
    renderFunc(component, container);
    if (footerContainer){
      renderFunc(React.createElement(SefariaReact.Footer), footerContainer);
    }
  }
});

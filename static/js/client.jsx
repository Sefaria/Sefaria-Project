import $ from './sefaria/sefariaJquery';
import React from 'react';
import ReactDOM from 'react-dom';
import DjangoCSRF from './lib/django-csrf';
const SefariaReact = require('./ReaderApp');


$(function() {
  let container = document.getElementById('s2');
  const loadingPlaceholder = document.getElementById('appLoading');
  const footerContainer = document.getElementById('footerContainer');
  let component = null;
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

  } else {
    // Rendering the Header & Footer only on top of a static page
    let staticProps = {
      multiPanel: $(window).width() > 600,
      headerMode: true,
      initialRefs: [],
      initialFilter: [],
      initialMenu: null,
      initialQuery: null,
      initialSheetsTag: null,
      initialNavigationCategories: [],
      initialNavigationTopicCategory: "",
      initialPanels: [],
    };

    let mergedStaticProps = { ...DJANGO_VARS.props, ...staticProps };
    Sefaria.unpackDataFromProps(mergedStaticProps);
    component = React.createElement(SefariaReact.ReaderApp, mergedStaticProps);
    renderFunc(component, container);
    if (footerContainer){
      renderFunc(React.createElement(SefariaReact.Footer), footerContainer);
    }
  }

  if (DJANGO_VARS.containerId && DJANGO_VARS.reactComponentName) {
    // Render a specifc component to a container
    container = document.getElementById(DJANGO_VARS.containerId);
    component = React.createElement(SefariaReact[DJANGO_VARS.reactComponentName], DJANGO_VARS.props);
    renderFunc(component, container);
  }

});

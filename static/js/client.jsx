import "core-js/stable";
import "regenerator-runtime/runtime";
import $ from './sefaria/sefariaJquery';
import React from 'react';
import ReactDOM from 'react-dom';
import DjangoCSRF from './lib/django-csrf';
const SefariaReact = require('./ReaderApp');
import * as Sentry from "@sentry/react";


$(function() {
  // Initialize Sentry, sentryDSN is defined in base.html
  if (sentryDSN) {
    Sentry.init({
      dsn: sentryDSN,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay(),
      ],
      tracesSampleRate: 0.0,
      replaysSessionSampleRate: 0.01, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
      replaysOnErrorSampleRate: 0.01, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
    });
  }

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
    console.log('🔍 Attempting to render specific component...');
    console.log('Container ID:', DJANGO_VARS.containerId);
    console.log('Component Name:', DJANGO_VARS.reactComponentName);
    console.log('Props:', DJANGO_VARS.props);
    
    container = document.getElementById(DJANGO_VARS.containerId);
    console.log('Container element:', container);
    
    if (SefariaReact[DJANGO_VARS.reactComponentName]) {
      console.log('✅ Component found, creating React element...');
      component = React.createElement(SefariaReact[DJANGO_VARS.reactComponentName], DJANGO_VARS.props);
      console.log('React element created:', component);
      
      try {
        renderFunc(component, container);
        console.log('✅ Component rendered successfully');
      } catch (error) {
        console.error('❌ Error rendering component:', error);
      }
    } else {
      console.error('❌ Component not found:', DJANGO_VARS.reactComponentName);
      console.log('Available components:', Object.keys(SefariaReact));
    }
  }

});

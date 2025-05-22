import "core-js/stable";
import "regenerator-runtime/runtime";
import Sefaria from './sefaria/sefaria';
import React from 'react';
import ReactDOM from 'react-dom';
import DjangoCSRF from './lib/django-csrf';
const SefariaReact = require('./ReaderApp');
import * as Sentry from "@sentry/react";


// Initialize Sentry, sentryDSN is defined in base.html
if (typeof sentryDSN !== "undefined" && sentryDSN) {
  Sentry.init({
    dsn: sentryDSN,
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay(),
    ],
    tracesSampleRate: 0.0,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.01,
  });
}

function renderApp() {
  let container = document.getElementById('s2');
  const loadingPlaceholder = document.getElementById('appLoading');
  const footerContainer = document.getElementById('footerContainer');
  let component = null;
  DjangoCSRF.init();
  let renderFunc = ReactDOM.hydrate;
  if (loadingPlaceholder) {
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
      multiPanel: window.innerWidth > 600,
      headerMode: true,
    };
    let mergedStaticProps = { ...DJANGO_VARS.props, ...staticProps };
    Sefaria.unpackDataFromProps(mergedStaticProps);
    component = React.createElement(SefariaReact.ReaderApp, mergedStaticProps);
    renderFunc(component, container);
    if (footerContainer) {
      renderFunc(React.createElement(SefariaReact.Footer), footerContainer);
    }
  }

  if (DJANGO_VARS.containerId && DJANGO_VARS.reactComponentName) {
    // Render a specific component to a container
    container = document.getElementById(DJANGO_VARS.containerId);
    component = React.createElement(SefariaReact[DJANGO_VARS.reactComponentName], DJANGO_VARS.props);
    renderFunc(component, container);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderApp);
} else {
  renderApp();
}

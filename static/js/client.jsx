import "core-js/stable";
import "regenerator-runtime/runtime";
import $ from './sefaria/sefariaJquery';
import React from 'react';
import ReactDOM from 'react-dom';
import DjangoCSRF from './lib/django-csrf';
const SefariaReact = require('./ReaderApp');
import * as Sentry from "@sentry/react";
import { attachAttributeAnalytics } from './sefaria/attributeAnalytics';


// Attribute-based GA4 tracking (data-anl-event / data-anl-* attributes); see sefaria/attributeAnalytics.js.
// This runs as soon as the bundle loads, before React hydrates, like the inline attach() it replaced in base.html.
attachAttributeAnalytics();


$(function() {
  // no_applink (see sefaria/utils/views_utils.py) is a one-hop marker; strip it so a
  // bookmarked/shared copy of this URL doesn't keep it forever.
  const url = new URL(window.location.href);
  if (url.searchParams.has('no_applink')) {
    url.searchParams.delete('no_applink');
    history.replaceState(null, '', url.toString());
  }

  const remoteConfig = DJANGO_VARS.props?.remoteConfig || {};
  // Initialize Sentry, sentryDSN is defined in base.html
  if (sentryDSN) {
    Sentry.init({
      dsn: sentryDSN,
      release: DJANGO_VARS.props?.appVersion || undefined,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay(),
      ],
      tracesSampleRate: remoteConfig?.sentry?.tracesSampleRate || 0.0,
      sampleRate: remoteConfig?.sentry?.sampleRate || 0.0,
      replaysSessionSampleRate: remoteConfig?.sentry?.replaysSessionSampleRate || 0.0,
      replaysOnErrorSampleRate: remoteConfig?.sentry?.replaysOnErrorSampleRate || 0.0,
    });
  }

  let container = document.getElementById('s2');
  const loadingPlaceholder = document.getElementById('appLoading');
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
    // Rendering the Header only on top of a static page
    let staticProps = {
      multiPanel: $(window).width() > 600,
      headerMode: true,
    };

    let mergedStaticProps = { ...DJANGO_VARS.props, ...staticProps };
    Sefaria.unpackDataFromProps(mergedStaticProps);
    component = React.createElement(SefariaReact.ReaderApp, mergedStaticProps);
    renderFunc(component, container);
  }

  // Handle template-specific component rendering (for pages that don't use ReaderApp)
  if (DJANGO_VARS.containerId && DJANGO_VARS.reactComponentName) {
    // Render a specific component to a container    
    container = document.getElementById(DJANGO_VARS.containerId);
    component = React.createElement(SefariaReact[DJANGO_VARS.reactComponentName], DJANGO_VARS.props);
    renderFunc(component, container);
  }

});

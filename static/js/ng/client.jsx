/**
 * Browser entry for the NG mobile reader (templates/ng/reader.html). Hydrates the server HTML,
 * or renders from scratch when SSR failed and Django served the loading placeholder.
 */
import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import * as Sentry from '@sentry/react';
import DjangoCSRF from '../lib/django-csrf';
import {NgReaderApp, ngUnpackProps} from './index';

function initSentry(dsn, props) {
  if (!dsn) { return; }
  const sentry = (props.remoteConfig && props.remoteConfig.sentry) || {};
  Sentry.init({
    dsn,
    release: props.appVersion || undefined,
    integrations: [new Sentry.BrowserTracing(), new Sentry.Replay()],
    tracesSampleRate: sentry.tracesSampleRate || 0.0,
    sampleRate: sentry.sampleRate || 0.0,
    replaysSessionSampleRate: sentry.replaysSessionSampleRate || 0.0,
    replaysOnErrorSampleRate: sentry.replaysOnErrorSampleRate || 0.0,
    initialScope: {tags: {reader: 'ng'}},
  });
}

function start() {
  const vars = window.DJANGO_VARS || {};
  const props = vars.props || {};
  initSentry(vars.sentryDSN, props);
  DjangoCSRF.init();
  ngUnpackProps(props);
  const container = document.getElementById('s2');
  const mount = document.getElementById('appLoading') ? ReactDOM.render : ReactDOM.hydrate;
  mount(<NgReaderApp {...props} />, container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

/**
 * Browser entry for Library Next (templates/library_next/app.html and the dev harness).
 * Reads DJANGO_VARS, seeds the shared Sefaria data layer the way the classic client does, then
 * renders <App/> into #library-next-root (client-rendered; no hydration).
 */
import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import Sefaria from '../sefaria/sefaria';
import DjangoCSRF from '../lib/django-csrf';
import { setLang } from './i18n';
import './strings';
import './routes';
import App from './App';

function start() {
  const vars = window.DJANGO_VARS || {};
  const props = vars.props || {};
  const data = typeof DJANGO_DATA_VARS === 'undefined' ? undefined : DJANGO_DATA_VARS;  // /data.<cache>.js
  Sefaria.setup(data, props, true);
  Sefaria.util._initialPath = props.path || window.location.pathname;
  DjangoCSRF.init();
  setLang(props.interfaceLang || 'english');
  window.Sefaria = Sefaria;  // handy in devtools; not relied on by the app
  ReactDOM.render(<App props={props} />, document.getElementById('library-next-root'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

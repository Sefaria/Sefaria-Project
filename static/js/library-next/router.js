/**
 * Client-side router for Library Next: a registry of routes, `pushState` navigation and hooks.
 *
 *   import { registerRoute, Link, navigate, useRoute, useRouteParams } from '../router';
 *   registerRoute({
 *     name: 'topic',
 *     path: '/topics/:slug',                  // or match(pathname, search) → params | null
 *     component: TopicPage,                   // receives { params, pathname, search, query }
 *     title: (params, t) => params.slug,      // document.title, without the site suffix
 *   });
 *   <Link to="/topics/moses">…</Link>         // same-origin SPA navigation; full load for
 *                                             // unknown paths, modifier clicks, target=_blank
 *   navigate('/search?q=light', { replace: false });
 *
 * `path` patterns: static segments, `:param` and a trailing `*` (captured as `params.rest`,
 * may be empty). Routes are matched in registration order; the first match wins.
 */
import React, { useEffect, useState } from 'react';

const routes = [];
const listeners = new Set();

export function compilePath(pattern) {
  const keys = [];
  let wildcard = false;
  const parts = pattern.replace(/\/+$/, '').split('/').filter(Boolean).map(seg => {
    if (seg === '*') { wildcard = true; return ''; }
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).filter(Boolean);
  const body = parts.length ? '/' + parts.join('/') : '';
  const re = new RegExp('^' + body + (wildcard ? '(?:/(.*))?' : '') + '/?$');
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) { return null; }
    const params = {};
    keys.forEach((k, i) => { params[k] = safeDecode(m[i + 1]); });
    if (wildcard) { params.rest = m[keys.length + 1] ? safeDecode(m[keys.length + 1]) : ''; }
    return params;
  };
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

/** Register a route. Re-registering a `name` replaces the earlier entry in place. */
export function registerRoute(route) {
  if (!route || !route.name || !route.component) {
    throw new Error('registerRoute needs { name, component } and `path` or `match`');
  }
  const match = route.match || (route.path ? compilePath(route.path) : null);
  if (!match) { throw new Error(`Route ${route.name} needs \`path\` or \`match\``); }
  const entry = { ...route, match };
  const i = routes.findIndex(r => r.name === route.name);
  if (i >= 0) { routes[i] = entry; } else { routes.push(entry); }
  return entry;
}

export function hasRoute(name) {
  return routes.some(r => r.name === name);
}

export function getRoutes() {
  return routes.slice();
}

export function parseQuery(search) {
  const out = {};
  new URLSearchParams(search || '').forEach((v, k) => { out[k] = v; });
  return out;
}

/** `{ route, params, pathname, search, query }` for a location, or null when nothing matches. */
export function matchRoute(pathname, search = '') {
  for (const route of routes) {
    const params = route.match(pathname, search);
    if (params) { return { route, params, pathname, search, query: parseQuery(search) }; }
  }
  return null;
}

function splitTo(to) {
  const url = new URL(to, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  return url;
}

export function isInternal(to) {
  if (typeof window === 'undefined') { return false; }
  const url = splitTo(to);
  return url.origin === window.location.origin && !!matchRoute(url.pathname, url.search);
}

let current = null;

function locate() {
  if (typeof window === 'undefined') { return null; }
  current = matchRoute(window.location.pathname, window.location.search);
  return current;
}

export function currentRoute() {
  return current || locate();
}

function notify() {
  locate();
  listeners.forEach(fn => fn(current));
}

/**
 * Go to `to`. Known paths update history and re-render; unknown paths or other origins fall
 * through to the server with a full navigation.
 */
export function navigate(to, { replace = false, scroll = true } = {}) {
  if (typeof window === 'undefined') { return; }
  const url = splitTo(to);
  if (url.origin !== window.location.origin || !matchRoute(url.pathname, url.search)) {
    window.location.assign(url.href);
    return;
  }
  const href = url.pathname + url.search + url.hash;
  window.history[replace ? 'replaceState' : 'pushState']({ libraryNext: true }, '', href);
  notify();
  if (scroll) { window.scrollTo(0, 0); }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify);
}

/** The current match (`{ route, params, pathname, search, query }` or null); re-renders on navigation. */
export function useRoute() {
  const [match, setMatch] = useState(currentRoute);
  useEffect(() => subscribe(setMatch), []);
  return match;
}

export function useRouteParams() {
  const match = useRoute();
  return match ? match.params : {};
}

function isModifiedEvent(e) {
  return e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.button !== 0;
}

/**
 * An anchor that navigates in place when the target is a known route. Extra props land on the
 * `<a>`; `onClick` runs first and can `preventDefault()` to cancel.
 */
export function Link({ to, replace = false, onClick, children, ...rest }) {
  const handle = (e) => {
    if (onClick) { onClick(e); }
    if (e.defaultPrevented || isModifiedEvent(e) || (rest.target && rest.target !== '_self')) { return; }
    if (!isInternal(to)) { return; }  // let the browser do a full navigation
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

/** Test helper: forget every route and listener. */
export function _resetRouter() {
  routes.length = 0;
  listeners.clear();
  current = null;
}

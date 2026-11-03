/**
 * Placeholder routes for every library URL the Django seam sends to the shell. Each is
 * registered only if a feature has not registered that name yet, so this file never needs
 * editing when a feature lands.
 */
import { registerRoute, hasRoute } from './router';
import { placeholderFor } from './pages/Placeholder';

export const ROUTE_NAMES = ['home', 'texts', 'texts-category', 'calendars', 'topics', 'topic', 'search', 'my', 'ref'];

// First path segments that belong to classic pages or non-page URLs. The ref catch-all never
// claims them, so <Link> and navigate() fall through to the server for those.
export const NOT_A_REF = new Set([
  'api', 'static', 'interface', 'login', 'logout', 'register', 'sheets', 'settings', 'profile', 'collections',
  'community', 'notifications', 'translations', 'people', 'explore', 'visualize', 'modtools', 'admin', 'activity',
  'about', 'donate', 'team', 'products', 'help', 'account', 'enable-library-assistant', 'linker-editor', 'random',
  'compare', 'garden', 'download', 'torahtracker', 'dashboard', 'new-home', 'texts', 'topics', 'calendars', 'search',
  'my', 'data.js', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'apple-app-site-association', 'sitemaps',
]);

/** The text catch-all: one path segment that is not a known classic page, e.g. /Genesis.1 or /Rashi_on_Genesis. */
export function matchRef(pathname) {
  const m = /^\/([^/]+)\/?$/.exec(pathname);
  if (!m) { return null; }
  const segment = decodeURIComponent(m[1]);
  if (NOT_A_REF.has(segment) || NOT_A_REF.has(segment.toLowerCase()) || /\.(html|js|css|png|svg|ico|json|xml|txt)$/.test(segment)) {
    return null;
  }
  return { tref: segment.replace(/_/g, ' ') };
}

const placeholders = [
  { name: 'home', path: '/', titleKey: 'page.home' },
  { name: 'texts', path: '/texts', titleKey: 'page.texts' },
  { name: 'texts-category', path: '/texts/*', titleKey: 'page.texts' },
  { name: 'calendars', path: '/calendars', titleKey: 'page.calendars' },
  { name: 'topics', path: '/topics', titleKey: 'page.topics' },
  { name: 'topic', path: '/topics/*', titleKey: 'page.topics' },
  { name: 'search', path: '/search', titleKey: 'page.search' },
  { name: 'my', path: '/my/*', titleKey: 'page.my' },
  { name: 'ref', match: matchRef, titleKey: 'page.reader' },
];

export function registerPlaceholders() {
  placeholders.forEach(({ name, path, match, titleKey }) => {
    if (hasRoute(name)) { return; }
    registerRoute({
      name,
      path,
      match,
      component: placeholderFor(titleKey),
      title: (params, t) => (name === 'ref' && params.tref ? params.tref : t(titleKey)),
    });
  });
}

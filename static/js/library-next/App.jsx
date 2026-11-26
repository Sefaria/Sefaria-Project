/**
 * Root component: resolves the current route and renders its page inside the shell.
 * `props` are the Django props (DJANGO_VARS.props); pages that need identity read them via
 * the `user` prop the shell passes down or `Sefaria._uid`.
 */
import React, { useEffect } from 'react';
import Shell from './Shell';
import NotFound from './pages/NotFound';
import { useRoute } from './router';
import { useT } from './i18n';

export default function App({ props = {} }) {
  const match = useRoute();
  const { t } = useT();
  useEffect(() => {
    if (typeof document === 'undefined') { return; }
    const page = match && match.route.title ? match.route.title(match.params, t) : (match ? '' : t('notfound.title'));
    document.title = page ? `${page} | ${t('site.name')}` : t('site.name');
  }, [match, t]);
  const Page = match ? match.route.component : NotFound;
  const pageProps = match
    ? { params: match.params, pathname: match.pathname, search: match.search, query: match.query }
    : { params: {}, pathname: typeof window !== 'undefined' ? window.location.pathname : '/', search: '', query: {} };
  return (
    <Shell user={props}>
      <Page {...pageProps} />
    </Shell>
  );
}

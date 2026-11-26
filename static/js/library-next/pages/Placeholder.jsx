/**
 * Stand-in page for routes a feature agent has not shipped yet. Renders the page title and
 * "This part of Library Next is being built", with a link to the classic page.
 *
 *   registerRoute({ name: 'texts', path: '/texts', component: placeholderFor('page.texts') });
 */
import React from 'react';
import { useT } from '../i18n';

export default function Placeholder({ titleKey, title, pathname }) {
  const { t } = useT();
  const heading = title || (titleKey ? t(titleKey) : t('site.name'));
  const classicHref = `${pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')}?library=classic`;
  return (
    <section className="ln-container ln-placeholder">
      <h1 className="ln-page-title">{heading}</h1>
      <p className="ln-placeholder-body">{t('placeholder.body')}</p>
      <a className="ln-btn" href={classicHref}>{t('placeholder.classic')}</a>
    </section>
  );
}

/**
 * A route component bound to a title key; `params`/`pathname` come from the router. A `tref`
 * param (the text catch-all) becomes the heading.
 */
export const placeholderFor = (titleKey) => function PlaceholderRoute({ pathname, params }) {
  return <Placeholder titleKey={titleKey} title={params && params.tref} pathname={pathname} />;
};

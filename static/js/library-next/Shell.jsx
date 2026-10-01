/**
 * The Library Next shell: header (logo, search, persona chip, language controls, My Library),
 * `<main>` with the routed page, footer, assistant dock, toasts, modal host and onboarding.
 *
 * Pages render inside `<main>`; everything else here is chrome. Overlay helpers are re-exported
 * so features can `import { toast, openModal, closeModal } from '../Shell'`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useT, switchInterfaceLang, pick } from './i18n';
import { Link, navigate, useRoute } from './router';
import { usePersona, PERSONA_IDS, PERSONAS, PersonaIcon } from './persona';
import { useContentLang, CONTENT_LANGS, CONTENT_LANG_LABELS } from './contentLang';
import { toast, openModal, closeModal, dismissToast, useOverlays } from './overlays';
import AssistantDock, { AssistantHeaderButton } from './AssistantDock';
import Onboarding, { openOnboarding } from './Onboarding';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';

export { toast, openModal, closeModal };

const Logo = ({ lang }) => (
  <Link to="/" className="ln-logo" aria-label="Sefaria">
    <img src={lang === 'he' ? '/static/img/library-logo-hebrew.svg' : '/static/img/library-logo-english.svg'} alt="Sefaria" height="22" />
  </Link>
);

function SearchBox({ t }) {
  const route = useRoute();
  const initial = route && route.route.name === 'search' ? (route.query.q || '') : '';
  const [q, setQ] = useState(initial);
  useEffect(() => { setQ(initial); }, [initial]);
  const submit = (e) => {
    e.preventDefault();
    const query = q.trim();
    if (query) { navigate(`/search?q=${encodeURIComponent(query)}`); }
  };
  return (
    <form className="ln-search" role="search" onSubmit={submit} action="/search" method="get">
      <label className="ln-sr-only" htmlFor="ln-search-input">{t('search.label')}</label>
      <input id="ln-search-input" name="q" type="search" value={q} onChange={e => setQ(e.target.value)}
             placeholder={t('search.placeholder')} autoComplete="off" />
      <button type="submit" className="ln-search-submit" aria-label={t('search.submit')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" />
        </svg>
      </button>
    </form>
  );
}

function PersonaChip({ t, lang }) {
  const { persona, setPersona, def } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) { return undefined; }
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); } };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const choose = (id) => {
    setPersona(id);
    setOpen(false);
    toast(t('persona.changed', { persona: pick(PERSONAS[id].label) }));
  };
  return (
    <div className="ln-chip-wrap" ref={ref}>
      <button type="button" className="ln-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
              data-persona={persona}>
        <PersonaIcon persona={persona} size={18} />
        <span className="ln-chip-label">{pick(def.label)}</span>
      </button>
      {open && (
        <div className="ln-menu" role="menu" aria-label={t('persona.menuTitle')}>
          <div className="ln-menu-title">{t('persona.menuTitle')}</div>
          {PERSONA_IDS.map(id => (
            <button key={id} type="button" role="menuitemradio" aria-checked={id === persona} className="ln-menu-item"
                    onClick={() => choose(id)}>
              <PersonaIcon persona={id} size={20} />
              <span>
                <span className="ln-menu-item-label">{pick(PERSONAS[id].label)}</span>
                <span className="ln-menu-item-sub">{pick(PERSONAS[id].tagline)}</span>
              </span>
            </button>
          ))}
          <button type="button" role="menuitem" className="ln-menu-item ln-menu-item-quiet" onClick={() => { setOpen(false); openOnboarding(); }}>
            <span className="ln-menu-item-label">{t('onboarding.title')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function InterfaceLangToggle({ t, lang }) {
  const other = lang === 'he' ? 'english' : 'hebrew';
  return (
    <button type="button" className="ln-lang-toggle" lang={lang === 'he' ? 'en' : 'he'} aria-label={t('lang.interface')}
            onClick={() => switchInterfaceLang(other)}>
      {lang === 'he' ? t('lang.switchToEnglish') : t('lang.switchToHebrew')}
    </button>
  );
}

export function ContentLangControl({ t, compact = false, className = '' }) {
  const [contentLang, setContentLang] = useContentLang();
  return (
    <div className={`ln-segmented ${compact ? 'compact' : ''} ${className}`} role="radiogroup" aria-label={t('contentLang.label')}>
      {CONTENT_LANGS.map(code => (
        <button key={code} type="button" role="radio" aria-checked={contentLang === code}
                className={`ln-segment ${contentLang === code ? 'active' : ''}`} onClick={() => setContentLang(code)}>
          {pick(CONTENT_LANG_LABELS[code])}
        </button>
      ))}
    </div>
  );
}

function Toasts() {
  const { toasts } = useOverlays();
  if (!toasts.length) { return null; }
  return (
    <div className="ln-toasts" role="status" aria-live="polite">
      {toasts.map(item => (
        <button key={item.id} type="button" className="ln-toast" onClick={() => dismissToast(item.id)}>{item.text}</button>
      ))}
    </div>
  );
}

function ModalHost({ t }) {
  const { modal } = useOverlays();
  useEffect(() => {
    if (!modal) { return undefined; }
    const esc = (e) => { if (e.key === 'Escape' && modal.dismissible) { closeModal(); } };
    document.addEventListener('keydown', esc);
    document.body.classList.add('ln-modal-open');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('ln-modal-open'); };
  }, [modal]);
  if (!modal) { return null; }
  return (
    <div className="ln-modal-backdrop" onMouseDown={e => { if (modal.dismissible && e.target === e.currentTarget) { closeModal(); } }}>
      <div className="ln-modal" role="dialog" aria-modal="true" aria-label={modal.label || undefined}>
        {modal.dismissible && (
          <button type="button" className="ln-modal-close" aria-label={t('modal.close')} onClick={closeModal}>×</button>
        )}
        {modal.node}
      </div>
    </div>
  );
}

export default function Shell({ children, user }) {
  const { t, lang, dir } = useT();
  const { persona } = usePersona();
  return (
    <div className="ln-shell" dir={dir} lang={lang} data-persona={persona}>
      <a href="#ln-main" className="ln-skip">{t('nav.skip')}</a>
      <header className="ln-header">
        <div className="ln-header-row">
          <Logo lang={lang} />
          <nav className="ln-nav" aria-label={t('site.name')}>
            <Link to="/texts">{t('nav.texts')}</Link>
            <Link to="/topics">{t('nav.topics')}</Link>
            <Link to="/calendars">{t('nav.calendars')}</Link>
          </nav>
          <SearchBox t={t} />
          <ContentLangControl t={t} compact className="ln-header-lang" />
          <div className="ln-header-tools">
            <PersonaChip t={t} lang={lang} />
            <AssistantHeaderButton />
            <InterfaceLangToggle t={t} lang={lang} />
            <Link to="/my" className="ln-my-link">{t('nav.my')}</Link>
          </div>
        </div>
      </header>
      <main id="ln-main" className="ln-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="ln-footer">
        <div className="ln-footer-row">
          <span className="ln-footer-note">{t('footer.poc')}</span>
          <a href="https://www.sefaria.org/about">{t('footer.about')}</a>
          <a href={`${typeof window !== 'undefined' ? window.location.pathname : '/'}?library=classic`}>{t('footer.classic')}</a>
        </div>
      </footer>
      <AssistantDock user={user} />
      <Toasts />
      <ModalHost t={t} />
      <Onboarding />
    </div>
  );
}

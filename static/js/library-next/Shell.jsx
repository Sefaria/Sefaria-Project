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
import AssistantDock from './AssistantDock';
import Onboarding, { openOnboarding } from './Onboarding';
import Sefaria from '../sefaria/sefaria';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';

export { toast, openModal, closeModal };

const Logo = ({ lang }) => (
  <Link to="/" className="ln-logo" aria-label="Sefaria">
    <img src={lang === 'he' ? '/static/img/library-logo-hebrew.svg' : '/static/img/library-logo-english.svg'} alt="Sefaria" height="22" />
  </Link>
);

const SUGGEST_TYPES = { ref: 1, Topic: 1, PersonTopic: 1, AuthorTopic: 1, TocCategory: 1 };

/** `/api/name` completions (books, refs, topics, categories) → `{ key, title, type, href }`. */
export function suggestionsFrom(data) {
  const out = [];
  for (const o of (data && data.completion_objects) || []) {
    if (!SUGGEST_TYPES[o.type]) { continue; }
    const href = o.type === 'ref' ? `/${String(o.key).replace(/ /g, '_')}`
      : o.type === 'TocCategory' ? `/texts/${[].concat(o.key).join('/')}`
        : `/topics/${o.key}`;
    out.push({ key: `${o.type}:${o.key}`, title: o.title, type: o.type === 'ref' ? 'ref' : (o.type === 'TocCategory' ? 'category' : 'topic'), href });
  }
  return out.slice(0, 8);
}

function SearchBox({ t }) {
  const route = useRoute();
  const initial = route && route.route.name === 'search' ? (route.query.q || '') : '';
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(initial); }, [initial]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2 || !Sefaria.getName) { setItems([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      Promise.resolve(Sefaria.getName(query, 8)).then(d => { if (live) { setItems(suggestionsFrom(d)); setActive(-1); } }).catch(() => { if (live) { setItems([]); } });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);
  const go = (href) => { setOpen(false); setItems([]); navigate(href); };
  const submit = (e) => {
    e.preventDefault();
    if (open && active >= 0 && items[active]) { go(items[active].href); return; }
    const query = q.trim();
    if (query) { setOpen(false); navigate(`/search?q=${encodeURIComponent(query)}`); }
  };
  const onKey = (e) => {
    if (!items.length) { return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(a => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };
  const listOpen = open && items.length > 0;
  return (
    <form className="ln-search" role="search" onSubmit={submit} action="/search" method="get">
      <label className="ln-sr-only" htmlFor="ln-search-input">{t('search.label')}</label>
      <input id="ln-search-input" name="q" type="search" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey}
             placeholder={t('search.placeholder')} autoComplete="off" role="combobox" aria-autocomplete="list"
             aria-expanded={listOpen} aria-controls="ln-search-suggest" aria-activedescendant={listOpen && active >= 0 ? `ln-suggest-${active}` : undefined} />
      <button type="submit" className="ln-search-submit" aria-label={t('search.submit')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" />
        </svg>
      </button>
      {listOpen && (
        <ul className="ln-suggest" id="ln-search-suggest" role="listbox">
          {items.map((item, i) => (
            <li key={item.key} id={`ln-suggest-${i}`} role="option" aria-selected={i === active} className={`ln-suggest-item ${i === active ? 'active' : ''}`}
                onMouseDown={e => { e.preventDefault(); go(item.href); }} onMouseEnter={() => setActive(i)}>
              <span className="ln-suggest-title">{item.title}</span>
              <span className="ln-suggest-type">{t(`search.type.${item.type}`)}</span>
            </li>
          ))}
        </ul>
      )}
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

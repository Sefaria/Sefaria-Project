// Currently Learning POC — homepage list, history-page "Books" view, and the log-in merge prompt.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import Button from './common/Button';
import { DropdownMenu } from './common/DropdownMenu';
import { groupVisitsByDay, relativeDay } from './sefaria/currentlyLearning';

const HOMEPAGE_LIMIT = 3;
const HISTORY_PAGE_SIZE = 20;
const PANEL_LIMIT = 5;

const locale = () => (Sefaria.interfaceLang === 'hebrew' ? 'he-IL' : 'en-US');
const formatTime = (ts) => new Date(ts * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const formatDate = (ts, opts = { month: 'short', day: 'numeric' }) =>
  new Date(ts * 1000).toLocaleDateString(locale(), opts);

// "Today, 11:30" · "Yesterday" · "Nov 1"
const formatWhen = (ts) => {
  if (!ts) return null;
  const day = relativeDay(ts);
  if (day === 'today') return `${Sefaria._('currently_learning.today')}, ${formatTime(ts)}`;
  if (day === 'yesterday') return Sefaria._('currently_learning.yesterday');
  return formatDate(ts);
};

// "Today" · "Yesterday" · "Tuesday, Nov 3"
const formatDayHeading = (ts) => {
  const day = relativeDay(ts);
  if (day === 'today') return Sefaria._('currently_learning.today');
  if (day === 'yesterday') return Sefaria._('currently_learning.yesterday');
  return formatDate(ts, { weekday: 'long', month: 'short', day: 'numeric' });
};

const bookInfo = (item) => {
  const index = Sefaria.index(item.book);
  const title = item.title || (index ? { en: index.title, he: index.heTitle } : { en: item.book, he: item.book });
  const category = item.category || (index && index.categories ? index.categories[0] : '');
  return { title: Sefaria._v(title), category };
};

const refLabel = (item) => Sefaria._v({ en: item.ref, he: item.he_ref || item.ref });

const continueUrl = (item) => {
  const params = Sefaria.util.getUrlVersionsParams(item.versions || {});
  return '/' + Sefaria.normRef(item.ref) + (params ? '?' + params : '');
};

const VisitList = ({ id, visits }) => {
  if (visits === null) {
    return (
      <div id={id} className="clVisits" aria-live="polite">
        <p className="clVisitsMessage">
          <InterfaceText>currently_learning.loading</InterfaceText>
        </p>
      </div>
    );
  }
  if (!visits.length) {
    return (
      <div id={id} className="clVisits">
        <p className="clVisitsMessage">
          <InterfaceText>currently_learning.no_visits</InterfaceText>
        </p>
      </div>
    );
  }
  return (
    <div id={id} className="clVisits">
      {groupVisitsByDay(visits).map((group) => (
        <div className="clVisitDay" key={group.dayStart}>
          <h4 className="clVisitDayHeading">{formatDayHeading(group.timeStamp)}</h4>
          <ul>
            {group.visits.map((v) => (
              <li key={`${v.ref}-${v.time_stamp}`}>
                <time dateTime={new Date(v.time_stamp * 1000).toISOString()}>{formatTime(v.time_stamp)}</time>
                <span aria-hidden="true">·</span>
                <a href={continueUrl(v)}>{refLabel(v)}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
VisitList.propTypes = { id: PropTypes.string.isRequired, visits: PropTypes.array };

const CurrentlyLearningRow = ({ item, canPin, canExpand, onTogglePin, idPrefix = 'cl' }) => {
  const [expanded, setExpanded] = useState(false);
  const [visits, setVisits] = useState(null);
  const [pinBusy, setPinBusy] = useState(false);
  const { title, category } = bookInfo(item);
  const visitsId = `${idPrefix}Visits-${item.book.replace(/[^A-Za-z0-9]/g, '-')}`;
  const when = formatWhen(item.time_stamp);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && visits === null) {
      Sefaria.loadBookVisits(item.book)
        .then((v) => setVisits(Array.isArray(v) ? v : []))
        .catch(() => setVisits([]));
    }
  };

  const togglePin = () => {
    if (pinBusy) return;
    setPinBusy(true);
    Promise.resolve(onTogglePin(item)).finally(() => setPinBusy(false));
  };

  return (
    <li className="clRow">
      <div className="clRowMain">
        <span className="clStripe" style={{ background: Sefaria.palette.categoryColor(category) }} aria-hidden="true" />
        <div className="clRowText">
          <h3 className="clBook">{title}</h3>
          <p className="clPlace">
            <span className="clRef">{refLabel(item)}</span>
            {when && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{when}</span>
              </>
            )}
          </p>
        </div>
        <div className="clActions">
          {canPin && (
            <button
              type="button"
              className={'clIconButton clPinButton' + (item.pinned ? ' pinned' : '')}
              data-prevent-close="true"
              aria-pressed={!!item.pinned}
              aria-label={`${Sefaria._('currently_learning.pin')} ${title}`}
              title={`${Sefaria._(item.pinned ? 'currently_learning.unpin' : 'currently_learning.pin')} ${title}`}
              onClick={togglePin}
            >
              <img
                src={`/static/icons/${item.pinned ? 'lucide_pin_filled' : 'lucide_pin_outline'}.svg`}
                alt=""
                aria-hidden="true"
              />
            </button>
          )}
          <Button href={continueUrl(item)} className="clContinue">
            <InterfaceText>currently_learning.continue</InterfaceText>
          </Button>
          {canExpand && (
            <button
              type="button"
              className={'clIconButton clExpandButton' + (expanded ? ' expanded' : '')}
              data-prevent-close="true"
              aria-expanded={expanded}
              aria-controls={visitsId}
              aria-label={`${Sefaria._('currently_learning.show_history_for')} ${title}`}
              onClick={toggleExpanded}
            >
              <img src="/static/icons/lucide_chevron_down.svg" alt="" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {expanded && <VisitList id={visitsId} visits={visits} />}
    </li>
  );
};
CurrentlyLearningRow.propTypes = {
  item: PropTypes.object.isRequired,
  canPin: PropTypes.bool,
  canExpand: PropTypes.bool,
  onTogglePin: PropTypes.func,
  idPrefix: PropTypes.string,
};

// Placeholder row in the list's own shape (direction from bookshelf-poc's "+ Add more texts" slot).
const SignUpEmptyState = () => {
  const next = typeof window !== 'undefined' ? '?next=' + encodeURIComponent(Sefaria.util.currentPath()) : '';
  return (
    <div className="clEmptyState">
      <span className="clStripe" aria-hidden="true" />
      <div className="clRowText">
        <p className="clEmptyTitle">
          <span aria-hidden="true">+ </span>
          <InterfaceText>currently_learning.empty_title</InterfaceText>
        </p>
        <p className="clEmptyBody">
          <a href={'/register' + next}>
            <InterfaceText>currently_learning.sign_up</InterfaceText>
          </a>{' '}
          <InterfaceText>currently_learning.or</InterfaceText>{' '}
          <a href={'/login' + next}>
            <InterfaceText>currently_learning.log_in</InterfaceText>
          </a>{' '}
          <InterfaceText>currently_learning.empty_body</InterfaceText>
        </p>
      </div>
    </div>
  );
};

// Homepage card (left-to-right layout, from bookshelf-poc's "My bookshelf" cards).
const CurrentlyLearningCard = ({ item, canPin, onTogglePin }) => {
  const [pinBusy, setPinBusy] = useState(false);
  const { title, category } = bookInfo(item);
  const when = formatWhen(item.time_stamp);
  const togglePin = () => {
    if (pinBusy) return;
    setPinBusy(true);
    Promise.resolve(onTogglePin(item)).finally(() => setPinBusy(false));
  };
  return (
    <li className="clCard" style={{ borderTopColor: Sefaria.palette.categoryColor(category) }}>
      <div className="clCardTop">
        <h3 className="clBook">{title}</h3>
        {canPin && (
          <button
            type="button"
            className={'clIconButton clPinButton' + (item.pinned ? ' pinned' : '')}
            aria-pressed={!!item.pinned}
            aria-label={`${Sefaria._('currently_learning.pin')} ${title}`}
            title={`${Sefaria._(item.pinned ? 'currently_learning.unpin' : 'currently_learning.pin')} ${title}`}
            onClick={togglePin}
          >
            <img
              src={`/static/icons/${item.pinned ? 'lucide_pin_filled' : 'lucide_pin_outline'}.svg`}
              alt=""
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <p className="clPlace">
        <span className="clRef">{refLabel(item)}</span>
      </p>
      {when && <p className="clCardWhen">{when}</p>}
      <Button href={continueUrl(item)} className="clContinue">
        <InterfaceText>currently_learning.continue</InterfaceText>
      </Button>
    </li>
  );
};
CurrentlyLearningCard.propTypes = {
  item: PropTypes.object.isRequired,
  canPin: PropTypes.bool,
  onTogglePin: PropTypes.func,
};

// Logged-out sign-up slot in card form.
const SignUpCard = () => {
  const next = typeof window !== 'undefined' ? '?next=' + encodeURIComponent(Sefaria.util.currentPath()) : '';
  return (
    <li className="clCard clSignUpCard">
      <p className="clEmptyTitle">
        <span aria-hidden="true">+ </span>
        <InterfaceText>currently_learning.empty_title</InterfaceText>
      </p>
      <p className="clEmptyBody">
        <a href={'/register' + next}>
          <InterfaceText>currently_learning.sign_up</InterfaceText>
        </a>{' '}
        <InterfaceText>currently_learning.or</InterfaceText>{' '}
        <a href={'/login' + next}>
          <InterfaceText>currently_learning.log_in</InterfaceText>
        </a>{' '}
        <InterfaceText>currently_learning.empty_body</InterfaceText>
      </p>
    </li>
  );
};

// Logged-in list state, shared by the homepage and history page.
const useAccountBooks = (limit) => {
  const initial = Sefaria.currentlyLearning && Sefaria.currentlyLearning.loaded ? Sefaria.currentlyLearning : null;
  const [data, setData] = useState(
    initial ? { items: initial.items.slice(0, limit), total: initial.total } : { items: null, total: 0 }
  );

  const load = useCallback(
    () => Sefaria.loadCurrentlyLearning(limit, 0).then((d) => setData({ items: d.items || [], total: d.total || 0 })),
    [limit]
  );

  useEffect(() => {
    if (!Sefaria._uid) return;
    // SSR data may be stale after client-side reading; refresh on every mount.
    load();
    return Sefaria.onCurrentlyLearningChange(load);
  }, [load]);

  const loadMore = () =>
    Sefaria.loadCurrentlyLearning(HISTORY_PAGE_SIZE, data.items.length).then((d) =>
      setData({ items: data.items.concat(d.items || []), total: d.total || 0 })
    );

  const togglePin = (item) =>
    Sefaria.setBookPinned(item.book, !item.pinned, Math.max(limit, data.items ? data.items.length : 0))
      .then((d) => setData({ items: d.items || [], total: d.total || 0 }))
      .catch(() => null);

  return { ...data, loadMore, togglePin };
};

// Logged-out list state: this device's books, read after mount (localStorage is client-only).
const useDeviceBooks = () => {
  const loggedIn = !!Sefaria._uid;
  const [deviceBooks, setDeviceBooks] = useState(null);
  useEffect(() => {
    if (loggedIn) return;
    const refresh = () => setDeviceBooks(Sefaria.deviceHistoryBooks());
    refresh();
    return Sefaria.onCurrentlyLearningChange(refresh);
  }, [loggedIn]);
  return deviceBooks;
};

const CurrentlyLearning = () => {
  const loggedIn = !!Sefaria._uid;
  const account = useAccountBooks(HOMEPAGE_LIMIT);
  const deviceBooks = useDeviceBooks();

  if (!Sefaria.is_history_enabled) return null;

  const heading = (
    <h2 className="clHeading" id="currentlyLearningHeading">
      <InterfaceText>currently_learning.title</InterfaceText>
    </h2>
  );

  if (!loggedIn) {
    if (deviceBooks === null) return null;
    return (
      <section className="currentlyLearning" aria-labelledby="currentlyLearningHeading">
        <div className="clHeader">{heading}</div>
        <ul className="clCards">
          {deviceBooks.length > 0 && <CurrentlyLearningCard item={deviceBooks[0]} />}
          <SignUpCard />
        </ul>
      </section>
    );
  }

  if (!account.items || !account.items.length) return null;
  return (
    <section className="currentlyLearning" aria-labelledby="currentlyLearningHeading">
      <div className="clHeader">
        {heading}
        {account.total > HOMEPAGE_LIMIT && (
          <a className="clShowMore" href="/history">
            <InterfaceText>currently_learning.show_all</InterfaceText>
            <span aria-hidden="true">({account.total})</span>
          </a>
        )}
      </div>
      <ul className="clCards">
        {account.items.map((item) => (
          <CurrentlyLearningCard key={item.book} item={item} canPin onTogglePin={account.togglePin} />
        ))}
      </ul>
    </section>
  );
};

// History page "Books" view: every book, pinned first, expandable.
const CurrentlyLearningHistory = () => {
  const account = useAccountBooks(HISTORY_PAGE_SIZE);
  if (account.items === null) {
    return (
      <p className="clVisitsMessage">
        <InterfaceText>currently_learning.loading</InterfaceText>
      </p>
    );
  }
  if (!account.items.length) {
    return (
      <p className="clVisitsMessage">
        <InterfaceText>currently_learning.no_books</InterfaceText>
      </p>
    );
  }
  const pinned = account.items.filter((x) => x.pinned);
  const recent = account.items.filter((x) => !x.pinned);
  const list = (items) => (
    <ul className="clList">
      {items.map((item) => (
        <CurrentlyLearningRow key={item.book} item={item} canPin canExpand onTogglePin={account.togglePin} />
      ))}
    </ul>
  );
  return (
    <div className="currentlyLearning clHistory">
      {pinned.length > 0 && (
        <section aria-labelledby="clPinnedHeading">
          <h2 className="clSubheading" id="clPinnedHeading">
            <InterfaceText>currently_learning.pinned</InterfaceText>
          </h2>
          {list(pinned)}
        </section>
      )}
      {recent.length > 0 && (
        <section aria-labelledby="clRecentHeading">
          <h2 className="clSubheading" id="clRecentHeading">
            <InterfaceText>currently_learning.recent</InterfaceText>
          </h2>
          {list(recent)}
        </section>
      )}
      {account.items.length < account.total && (
        <div className="clLoadMore">
          <Button onClick={account.loadMore} className="clContinue clSecondary">
            <InterfaceText>currently_learning.show_more</InterfaceText>
          </Button>
        </div>
      )}
    </div>
  );
};

// Header entry point: the list itself, so readers who never reach the homepage can get back to their books.
const CurrentlyLearningPanelBody = ({ idPrefix }) => {
  const loggedIn = !!Sefaria._uid;
  const account = useAccountBooks(PANEL_LIMIT);
  const deviceBooks = useDeviceBooks();

  if (!loggedIn) {
    if (deviceBooks === null) return null;
    return (
      <div className="currentlyLearning clPanelBody">
        {deviceBooks.length > 0 && (
          <ul className="clList">
            <CurrentlyLearningRow item={deviceBooks[0]} idPrefix={idPrefix} />
          </ul>
        )}
        <SignUpEmptyState />
      </div>
    );
  }
  if (account.items === null) {
    return (
      <div className="currentlyLearning clPanelBody">
        <p className="clVisitsMessage">
          <InterfaceText>currently_learning.loading</InterfaceText>
        </p>
      </div>
    );
  }
  return (
    <div className="currentlyLearning clPanelBody">
      {account.items.length ? (
        <ul className="clList">
          {account.items.map((item) => (
            <CurrentlyLearningRow
              key={item.book}
              item={item}
              canPin
              onTogglePin={account.togglePin}
              idPrefix={idPrefix}
            />
          ))}
        </ul>
      ) : (
        <p className="clVisitsMessage">
          <InterfaceText>currently_learning.no_books</InterfaceText>
        </p>
      )}
      {account.total > PANEL_LIMIT && (
        <div className="clPanelFooter">
          <a className="clShowMore" href="/history">
            <InterfaceText>currently_learning.show_all</InterfaceText>
            <span aria-hidden="true">({account.total})</span>
          </a>
        </div>
      )}
    </div>
  );
};
CurrentlyLearningPanelBody.propTypes = { idPrefix: PropTypes.string.isRequired };

const headerIcon = (
  <img src="/static/icons/currently_learning_mdl.svg" className="button-icon" alt="" aria-hidden="true" />
);

// Desktop: a dropdown panel under the header icon, using the header's existing DropdownMenu.
const CurrentlyLearningHeaderDropdown = () => {
  if (!Sefaria.is_history_enabled) return null;
  const button = (
    <button type="button" className="icon-only clHeaderButton" aria-label={Sefaria._('currently_learning.title')}>
      {headerIcon}
    </button>
  );
  return (
    <DropdownMenu positioningClass="headerDropdownMenu clHeaderDropdown" buttonComponent={button}>
      <div className="clDropdownPanel" role="region" aria-labelledby="clDropdownTitle">
        <h2 className="clHeading" id="clDropdownTitle">
          <InterfaceText>currently_learning.title</InterfaceText>
        </h2>
        <CurrentlyLearningPanelBody idPrefix="clDropdown" />
      </div>
    </DropdownMenu>
  );
};

// Mobile: a sheet from the trailing edge, 85% wide, over a dimmed page.
const CurrentlyLearningSheet = ({ onClose }) => {
  const sheetRef = useRef(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const previous = document.activeElement;
    const focusables = () => Array.from(sheet.querySelectorAll('button, a[href], input')).filter((el) => !el.disabled);
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        const els = focusables();
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, [onClose]);

  // Following a link (Continue learning, a visit, All history) navigates in-app, so close the sheet.
  const onClick = (e) => {
    if (e.target.closest('a[href]')) onClose();
  };

  return ReactDOM.createPortal(
    <div className="clSheetBox">
      <div className="clSheetScrim" onClick={onClose} />
      <div
        className="clSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clSheetTitle"
        ref={sheetRef}
        onClick={onClick}
      >
        <div className="clSheetHeader">
          <h2 className="clHeading" id="clSheetTitle">
            <InterfaceText>currently_learning.title</InterfaceText>
          </h2>
          <button
            type="button"
            className="clIconButton clSheetClose"
            aria-label={Sefaria._('common.close')}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <CurrentlyLearningPanelBody idPrefix="clSheet" />
      </div>
    </div>,
    document.body
  );
};
CurrentlyLearningSheet.propTypes = { onClose: PropTypes.func.isRequired };

const CurrentlyLearningMobileButton = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!Sefaria.is_history_enabled) return null;
  return (
    <>
      <button
        type="button"
        className="clIconButton clHeaderButton clMobileButton"
        aria-label={Sefaria._('currently_learning.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {headerIcon}
      </button>
      {open && <CurrentlyLearningSheet onClose={close} />}
    </>
  );
};

// Shown on arrival when a reader lands in a book somewhere other than their saved place.
// Focus trap + Esc for the Welcome back and First visit dialogs.
const useDialogFocus = (boxRef, onClose) => {
  useEffect(() => {
    const previous = document.activeElement;
    const box = boxRef.current;
    const focusables = () => Array.from(box.querySelectorAll('button, a[href]')).filter((el) => !el.disabled);
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [boxRef, onClose]);
};

// One-time prompt after real reading on a device's first visit (same shell as Welcome back).
const FirstVisitPrompt = ({ item, onClose }) => {
  const boxRef = useRef(null);
  const loggedIn = !!Sefaria._uid;
  const { title } = bookInfo(item);
  const next = '?next=' + encodeURIComponent(continueUrl(item));
  useDialogFocus(boxRef, onClose);
  return (
    <div className="clMergeModalBox clWelcomeBox">
      <div className="whiteOverlay" onClick={onClose} />
      <div
        className="clMergeModal clWelcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clFirstVisitTitle"
        aria-describedby="clFirstVisitBody"
        ref={boxRef}
      >
        <div className="clMergeHeader">
          <h2 id="clFirstVisitTitle" className="clMergeTitle">
            {Sefaria._('currently_learning.first_visit_title').replace('{book}', title)}
          </h2>
          <button
            type="button"
            className="clIconButton clMergeClose"
            aria-label={Sefaria._('common.close')}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p id="clFirstVisitBody" className="clMergeBody">
          <InterfaceText>
            {loggedIn ? 'currently_learning.first_visit_body_in' : 'currently_learning.first_visit_body_out'}
          </InterfaceText>
        </p>
        <div className="clWelcomeActions">
          <Button onClick={onClose} className="clContinue">
            <InterfaceText>currently_learning.first_visit_got_it</InterfaceText>
          </Button>
        </div>
        <p className="clWelcomeFooter">
          {loggedIn ? (
            <a href="/texts" onClick={onClose}>
              <InterfaceText>currently_learning.first_visit_see_books</InterfaceText>
            </a>
          ) : (
            <>
              <a href={'/register' + next} onClick={onClose}>
                <InterfaceText>currently_learning.sign_up</InterfaceText>
              </a>{' '}
              <InterfaceText>currently_learning.welcome_back_signup_rest</InterfaceText>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
FirstVisitPrompt.propTypes = { item: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired };

const WelcomeBackPrompt = ({ item, onContinue, onStay, onLeave }) => {
  const boxRef = useRef(null);
  const loggedIn = !!Sefaria._uid;
  const { title } = bookInfo(item);
  const index = Sefaria.index(item.book);
  const fullRef = refLabel(item);
  const bookPrefix = Sefaria.interfaceLang === 'hebrew' ? index?.heTitle : item.book;
  const place = bookPrefix && fullRef.startsWith(bookPrefix + ' ') ? fullRef.slice(bookPrefix.length + 1) : null;
  const next = '?next=' + encodeURIComponent(continueUrl(item));

  useEffect(() => {
    const previous = document.activeElement;
    const box = boxRef.current;
    const focusables = () => Array.from(box.querySelectorAll('button, a[href]')).filter((el) => !el.disabled);
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onStay();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [onStay]);

  const titleText = Sefaria._('currently_learning.welcome_back_title').replace('{book}', title);
  const bodyText = Sefaria._('currently_learning.welcome_back_body').replace('{ref}', fullRef);
  const continueText = place
    ? Sefaria._('currently_learning.welcome_back_continue').replace('{place}', place)
    : Sefaria._('currently_learning.welcome_back_continue_there');

  return (
    <div className="clMergeModalBox clWelcomeBox">
      <div className="whiteOverlay" onClick={onStay} />
      <div
        className="clMergeModal clWelcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clWelcomeTitle"
        aria-describedby="clWelcomeBody"
        ref={boxRef}
      >
        <div className="clMergeHeader">
          <h2 id="clWelcomeTitle" className="clMergeTitle">
            {titleText}
          </h2>
          <button
            type="button"
            className="clIconButton clMergeClose"
            aria-label={Sefaria._('common.close')}
            onClick={onStay}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p id="clWelcomeBody" className="clMergeBody">
          {bodyText}
        </p>
        <div className="clWelcomeActions">
          <Button onClick={() => onContinue(continueUrl(item))} className="clContinue">
            {continueText}
          </Button>
          <Button onClick={onStay} className="clContinue clSecondary">
            <InterfaceText>currently_learning.welcome_back_stay</InterfaceText>
          </Button>
        </div>
        <p className="clWelcomeFooter">
          {loggedIn ? (
            <a href="/history" onClick={onLeave}>
              <InterfaceText>currently_learning.welcome_back_see_others</InterfaceText>
            </a>
          ) : (
            <>
              <a href={'/register' + next} onClick={onLeave}>
                <InterfaceText>currently_learning.sign_up</InterfaceText>
              </a>{' '}
              <InterfaceText>currently_learning.welcome_back_signup_rest</InterfaceText>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
WelcomeBackPrompt.propTypes = {
  item: PropTypes.object.isRequired,
  onContinue: PropTypes.func.isRequired,
  onStay: PropTypes.func.isRequired,
  onLeave: PropTypes.func.isRequired,
};

// Shown once after logging in to an existing account when this device has logged-out history.
const MergeHistoryModal = ({ books, onDone, demo = false }) => {
  const [selected, setSelected] = useState(() => new Set(books.map((b) => b.book)));
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const n = selected.size;

  const notNow = useCallback(() => {
    if (!demo) Sefaria.discardDeviceHistory();
    onDone();
  }, [onDone, demo]);

  useEffect(() => {
    const previous = document.activeElement;
    const box = boxRef.current;
    const focusables = () => Array.from(box.querySelectorAll('button, input, a[href]')).filter((el) => !el.disabled);
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        notNow();
      } else if (e.key === 'Tab') {
        const els = focusables();
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [notNow]);

  const toggle = (book) => {
    const next = new Set(selected);
    next.has(book) ? next.delete(book) : next.add(book);
    setSelected(next);
    setError(false);
  };

  const add = () => {
    if (!n) {
      setError(true);
      return;
    }
    if (demo) {
      onDone();
      return;
    }
    setBusy(true);
    Sefaria.mergeDeviceHistory(Array.from(selected)).then(() => {
      Sefaria._notifyCurrentlyLearning();
      onDone();
    });
  };

  const body =
    books.length === 1
      ? Sefaria._('currently_learning.merge_body_one')
      : Sefaria._('currently_learning.merge_body').replace('{n}', books.length);
  const addLabel =
    n === 1
      ? Sefaria._('currently_learning.merge_add_one')
      : Sefaria._('currently_learning.merge_add').replace('{n}', n);

  return (
    <div className="clMergeModalBox">
      <div className="whiteOverlay" onClick={notNow} />
      <div
        className="clMergeModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clMergeTitle"
        aria-describedby="clMergeBody"
        ref={boxRef}
      >
        <div className="clMergeHeader">
          <h2 id="clMergeTitle" className="clMergeTitle">
            <InterfaceText>currently_learning.merge_title</InterfaceText>
          </h2>
          <button
            type="button"
            className="clIconButton clMergeClose"
            aria-label={Sefaria._('common.close')}
            onClick={notNow}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p id="clMergeBody" className="clMergeBody">
          {body}
        </p>
        <ul className="clMergeList">
          {books.map((b) => (
            <li key={b.book}>
              <label className="clMergeOption">
                <input type="checkbox" checked={selected.has(b.book)} onChange={() => toggle(b.book)} />
                <span>
                  <span className="clBook">{bookInfo(b).title}</span>
                  <span className="clPlace">
                    {' '}
                    · {refLabel(b)}
                    {b.time_stamp ? `, ${formatWhen(b.time_stamp)}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <p className="clMergeError" role="alert">
            <InterfaceText>currently_learning.merge_choose</InterfaceText>
          </p>
        )}
        <div className="clMergeActions">
          <Button onClick={notNow} className="clContinue clSecondary">
            <InterfaceText>currently_learning.merge_not_now</InterfaceText>
          </Button>
          <Button onClick={add} className="clContinue" disabled={busy}>
            {addLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
MergeHistoryModal.propTypes = {
  books: PropTypes.array.isRequired,
  onDone: PropTypes.func.isRequired,
  demo: PropTypes.bool,
};

export {
  CurrentlyLearning,
  CurrentlyLearningHistory,
  MergeHistoryModal,
  WelcomeBackPrompt,
  FirstVisitPrompt,
  CurrentlyLearningHeaderDropdown,
  CurrentlyLearningMobileButton,
};

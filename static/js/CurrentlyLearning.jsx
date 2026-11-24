// "Currently learning": the reader's most recently read books, each at its last place, on the homepage and in the
// header, and the history page's Books view (the last 30 days, grouped by book).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import Button from './common/Button';
import { DropdownMenu } from './common/DropdownMenu';

const HOMEPAGE_LIMIT = 3; // matches HOMEPAGE_RECENT_BOOKS on the server, which renders the homepage's first list
const PANEL_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const locale = () => (Sefaria.interfaceLang === 'hebrew' ? 'he-IL' : 'en-US');
const formatTime = (ts) => new Date(ts * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const formatDate = (ts, opts = { month: 'short', day: 'numeric' }) =>
  new Date(ts * 1000).toLocaleDateString(locale(), opts);
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// 'today' | 'yesterday' | null, in the reader's time zone
const relativeDay = (ts) => {
  const day = startOfDay(new Date(ts * 1000));
  const today = startOfDay(new Date());
  return day === today ? 'today' : day === today - DAY_MS ? 'yesterday' : null;
};

// "Today, 11:30" · "Yesterday" · "Nov 1"
const formatWhen = (ts) => {
  const day = relativeDay(ts);
  if (day === 'today') return `${Sefaria._('currently_learning.today')}, ${formatTime(ts)}`;
  if (day === 'yesterday') return Sefaria._('currently_learning.yesterday');
  return formatDate(ts);
};

// "Today" · "Yesterday" · "Tuesday, Nov 3"
const formatDay = (ts) => {
  const day = relativeDay(ts);
  if (day) return Sefaria._(`currently_learning.${day}`);
  return formatDate(ts, { weekday: 'long', month: 'short', day: 'numeric' });
};

const bookInfo = (item) => {
  // Logged-in recent books come with their title and category; logged-out ones and history places don't.
  const index = Sefaria.index(item.book);
  const title = item.title || (index ? { en: index.title, he: index.heTitle } : { en: item.book, he: item.book });
  const category = item.category || index?.categories?.[0] || '';
  return { title, category };
};

// Through InterfaceText, so Hebrew gets the Hebrew font.
const BookTitle = ({ title }) => (
  <h3 className="clBook serif">
    <InterfaceText text={title} />
  </h3>
);
BookTitle.propTypes = { title: PropTypes.object.isRequired };

const RefLabel = ({ item }) => <InterfaceText text={{ en: item.ref, he: item.he_ref || item.ref }} />;
RefLabel.propTypes = { item: PropTypes.object.isRequired };

const placeUrl = (item) => {
  const query = new URLSearchParams(Sefaria.util.getUrlVersionsParams(item.versions)).toString();
  return `/${Sefaria.normRef(item.ref)}${query ? `?${query}` : ''}`;
};

const signUpNext = () =>
  typeof window !== 'undefined' ? '?next=' + encodeURIComponent(Sefaria.util.currentPath()) : '';

const SignUpText = () => (
  <>
    <p className="clEmptyTitle serif">
      <span aria-hidden="true">+ </span>
      <InterfaceText>currently_learning.empty_title</InterfaceText>
    </p>
    <p className="clEmptyBody">
      <a href={'/register' + signUpNext()}>
        <InterfaceText>currently_learning.sign_up</InterfaceText>
      </a>{' '}
      <InterfaceText>currently_learning.or</InterfaceText>{' '}
      <a href={'/login' + signUpNext()}>
        <InterfaceText>currently_learning.log_in</InterfaceText>
      </a>{' '}
      <InterfaceText>currently_learning.empty_body</InterfaceText>
    </p>
  </>
);

const useRecentBooks = (limit, reloadKey = 0) => {
  // Up to `limit` recent books, or null while loading. Logged-out readers' books are in a cookie only the
  // browser reads, so they load after mount, as do logged-in books the page wasn't rendered with.
  const [books, setBooks] = useState(() => Sefaria.cachedRecentBooks(limit));
  const load = useCallback(() => {
    Sefaria.recentBooks(limit).then(setBooks, () => setBooks([]));
  }, [limit]);
  useEffect(load, [load, reloadKey]);
  useEffect(() => Sefaria.onRecentBooksChange(load), [load]);
  return books;
};

const ContinueButton = ({ item }) => (
  <Button href={placeUrl(item)} className="clContinue">
    <InterfaceText>currently_learning.continue</InterfaceText>
  </Button>
);
ContinueButton.propTypes = { item: PropTypes.object.isRequired };

// Homepage card
const CurrentlyLearningCard = ({ item }) => {
  const { title, category } = bookInfo(item);
  return (
    <li className="clCard" style={{ borderTopColor: Sefaria.palette.categoryColor(category) }}>
      <BookTitle title={title} />
      <p className="clPlace">
        <span className="clRef">
          <RefLabel item={item} />
        </span>
      </p>
      <p className="clCardWhen">{formatWhen(item.time_stamp)}</p>
      <ContinueButton item={item} />
    </li>
  );
};
CurrentlyLearningCard.propTypes = { item: PropTypes.object.isRequired };

const AllHistoryLink = () => (
  <a className="clShowMore" href="/history">
    <InterfaceText>currently_learning.all_history</InterfaceText>
  </a>
);

const CurrentlyLearning = () => {
  const books = useRecentBooks(HOMEPAGE_LIMIT);
  if (!Sefaria.is_history_enabled || books === null) return null;
  const loggedIn = !!Sefaria._uid;
  if (loggedIn && !books.length) return null;
  return (
    <section className="currentlyLearning sans-serif" aria-labelledby="currentlyLearningHeading">
      <div className="clHeader">
        <h2 className="clHeading" id="currentlyLearningHeading">
          <InterfaceText>currently_learning.title</InterfaceText>
        </h2>
        {loggedIn && <AllHistoryLink />}
      </div>
      <ul className="clCards">
        {/* Logged out: their latest book and an invitation to sign up to keep the rest */}
        {(loggedIn ? books : books.slice(0, 1)).map((item) => (
          <CurrentlyLearningCard key={item.book} item={item} />
        ))}
        {!loggedIn && (
          <li className="clCard clSignUpCard">
            <SignUpText />
          </li>
        )}
      </ul>
    </section>
  );
};

// A book in the header list and on the history page: its last place, with the places before it when `days` is given.
const CurrentlyLearningRow = ({ item, days = null }) => {
  const [expanded, setExpanded] = useState(false);
  const { title, category } = bookInfo(item);
  const daysId = `clDays-${item.book.replace(/[^A-Za-z0-9]/g, '-')}`;
  return (
    <li className="clRow">
      <div className="clRowMain">
        <span className="clStripe" style={{ background: Sefaria.palette.categoryColor(category) }} aria-hidden="true" />
        <div className="clRowText">
          <BookTitle title={title} />
          <p className="clPlace">
            <span className="clRef">
              <RefLabel item={item} />
            </span>
            <span aria-hidden="true"> · </span>
            <span>{formatWhen(item.time_stamp)}</span>
          </p>
        </div>
        <div className="clActions">
          <ContinueButton item={item} />
          {days && days.length > 1 && (
            <button
              type="button"
              className={'clIconButton clExpandButton' + (expanded ? ' expanded' : '')}
              data-prevent-close="true"
              aria-expanded={expanded}
              aria-controls={daysId}
              aria-label={`${Sefaria._('currently_learning.show_history_for')} ${Sefaria._v(title)}`}
              onClick={() => setExpanded(!expanded)}
            >
              <img src="/static/icons/lucide_chevron_down.svg" alt="" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <ul id={daysId} className="clVisits">
          {days.map((place) => (
            <li key={place.time_stamp}>
              <time dateTime={new Date(place.time_stamp * 1000).toISOString()}>{formatDay(place.time_stamp)}</time>
              <span aria-hidden="true"> · </span>
              <a href={placeUrl(place)}>
                <RefLabel item={place} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};
CurrentlyLearningRow.propTypes = { item: PropTypes.object.isRequired, days: PropTypes.array };

const LoadingText = () => (
  <p className="clMessage">
    <InterfaceText>currently_learning.loading</InterfaceText>
  </p>
);

// The header's list: in a dropdown on desktop and a sheet on mobile. Mounted when first opened, and reloaded
// (if the reader has read since) on each open, so the header doesn't load anything on every page.
const CurrentlyLearningPanelBody = ({ openCount }) => {
  const books = useRecentBooks(PANEL_LIMIT, openCount);
  const loggedIn = !!Sefaria._uid;
  if (books === null) return <LoadingText />;
  return (
    <div className="currentlyLearning clPanelBody sans-serif">
      {books.length ? (
        <ul className="clList">
          {(loggedIn ? books : books.slice(0, 1)).map((item) => (
            <CurrentlyLearningRow key={item.book} item={item} />
          ))}
        </ul>
      ) : (
        loggedIn && (
          <p className="clMessage">
            <InterfaceText>currently_learning.no_books</InterfaceText>
          </p>
        )
      )}
      {loggedIn ? (
        <div className="clPanelFooter">
          <AllHistoryLink />
        </div>
      ) : (
        <div className="clEmptyState">
          <span className="clStripe" aria-hidden="true" />
          <div className="clRowText">
            <SignUpText />
          </div>
        </div>
      )}
    </div>
  );
};
CurrentlyLearningPanelBody.propTypes = { openCount: PropTypes.number.isRequired };

const headerIcon = (
  <img src="/static/icons/currently_learning_mdl.svg" className="button-icon" alt="" aria-hidden="true" />
);

const CurrentlyLearningHeaderDropdown = () => {
  const [openCount, setOpenCount] = useState(0);
  if (!Sefaria.is_history_enabled) return null;
  const button = (
    <button type="button" className="icon-only clHeaderButton" aria-label={Sefaria._('currently_learning.title')}>
      {headerIcon}
    </button>
  );
  return (
    <DropdownMenu
      positioningClass="headerDropdownMenu clHeaderDropdown"
      buttonComponent={button}
      onOpen={() => setOpenCount((n) => n + 1)}
    >
      <div className="clDropdownPanel sans-serif" role="region" aria-labelledby="clDropdownTitle">
        <h2 className="clHeading" id="clDropdownTitle">
          <InterfaceText>currently_learning.title</InterfaceText>
        </h2>
        {openCount > 0 && <CurrentlyLearningPanelBody openCount={openCount} />}
      </div>
    </DropdownMenu>
  );
};

// Mobile: a sheet from the trailing edge over a dimmed page.
const CurrentlyLearningSheet = ({ onClose }) => {
  const sheetRef = useRef(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const previous = document.activeElement;
    const focusables = () => Array.from(sheet.querySelectorAll('button, a[href]')).filter((el) => !el.disabled);
    focusables()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        const els = focusables();
        const [first, last] = [els[0], els[els.length - 1]];
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
      previous?.focus?.();
    };
  }, [onClose]);

  // Following a link navigates in-app, so close the sheet.
  const onClick = (e) => {
    if (e.target.closest('a[href]')) onClose();
  };

  return ReactDOM.createPortal(
    <div className="clSheetBox">
      <div className="clSheetScrim" onClick={onClose} />
      <div
        className="clSheet sans-serif"
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
        <CurrentlyLearningPanelBody openCount={1} />
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

const groupPlacesByBook = (places) => {
  // `places` are newest first; so are the books (by their latest place) and each book's places.
  const byBook = new Map();
  for (const place of places) {
    if (!byBook.has(place.book)) byBook.set(place.book, []);
    byBook.get(place.book).push(place);
  }
  return Array.from(byBook.values());
};

// History page "Books" view: the books read in the last 30 days, each at its last place, with its last place on
// each day. "Show more" adds the 30 days before the oldest shown (skipping any stretch with no reading).
const CurrentlyLearningHistory = () => {
  const [places, setPlaces] = useState(null);
  const [older, setOlder] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPlaces = (before) => {
    setLoading(true);
    Sefaria.loadDailyPlaces(before).then(
      (data) => {
        setPlaces((current) => (current || []).concat(data.places || []));
        setOlder(data.older ?? null);
        setLoading(false);
      },
      () => {
        setPlaces((current) => current || []);
        setLoading(false);
      }
    );
  };

  useEffect(() => loadPlaces(Sefaria.util.epoch_time() + 1), []);

  if (places === null) return <LoadingText />;
  if (!places.length) {
    return (
      <p className="clMessage">
        <InterfaceText>currently_learning.no_books</InterfaceText>
      </p>
    );
  }
  return (
    <div className="currentlyLearning clHistory sans-serif">
      <ul className="clList">
        {groupPlacesByBook(places).map((days) => (
          <CurrentlyLearningRow key={days[0].book} item={days[0]} days={days} />
        ))}
      </ul>
      {older !== null && (
        <div className="clLoadMore">
          <Button onClick={() => loadPlaces(older + 1)} disabled={loading} className="clContinue clSecondary">
            <InterfaceText>currently_learning.show_more</InterfaceText>
          </Button>
        </div>
      )}
    </div>
  );
};

export {
  CurrentlyLearning,
  CurrentlyLearningHistory,
  CurrentlyLearningHeaderDropdown,
  CurrentlyLearningMobileButton,
  groupPlacesByBook,
};

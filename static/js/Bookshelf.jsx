import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import Bookshelf from './sefaria/bookshelf';
import { InterfaceText } from './Misc';

/*
 * Bookshelf POC: the reader-header star, the second-visit promo modal, the confirmation toast,
 * and the "My bookshelf" section on the homepage.
 */

const TOAST_MS = 6000;

// Re-render whenever the shelf changes.
const useBookshelfVersion = () => {
  const [version, setVersion] = useState(0);
  useEffect(() => Bookshelf.subscribe(type => {
    if (type === 'change') { setVersion(v => v + 1); }
  }), []);
  return version;
};

// Render only after mount: the anonymous shelf lives in localStorage, which the server can't see.
const useMounted = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
};

const nextParam = () => "?next=" + encodeURIComponent(Sefaria.util.currentPath());
const bookTitle = (book) => {
  const index = Sefaria.index(book);
  return Sefaria._v({en: book, he: index && index.heTitle ? index.heTitle : book});
};
const categoryColor = (book) => {
  const index = Sefaria.index(book);
  return Sefaria.palette.categoryColor(index && index.categories ? index.categories[0] : "");
};
const displayRef = (book) => Bookshelf.formatRef(Bookshelf.lastRef(book), Bookshelf.isTalmud(book));


const StarIcon = ({filled}) => (
  <svg className="bookshelfStarIcon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"
      fill={filled ? "var(--talmud-gold)" : "none"}
      stroke={filled ? "#8A7440" : "currentColor"}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);


const BookshelfStar = ({book}) => {
  useBookshelfVersion();
  const mounted = useMounted();
  const [pulse, setPulse] = useState(false);

  useEffect(() => Bookshelf.subscribe((type, payload) => {
    if (type === 'toast' && payload.book === book && !payload.removed) {
      setPulse(true);
    }
  }), [book]);

  if (!book) { return null; }
  const filled = mounted && Bookshelf.has(book);
  const label = filled ? `Remove ${book} from your bookshelf` : `Add ${book} to your bookshelf`;

  const onClick = (e) => {
    e.preventDefault();
    Bookshelf.toggle(book).catch(err => {
      if (err === 'full') { Bookshelf.showLimit(book); }
    });
  };

  return (
    <button
      type="button"
      className={classNames({saveButton: 1, bookshelfStar: 1, filled, pulse})}
      aria-label={label}
      aria-pressed={filled}
      title={label}
      onClick={onClick}
      onAnimationEnd={() => setPulse(false)}
    >
      <StarIcon filled={filled} />
    </button>
  );
};
BookshelfStar.propTypes = {
  book: PropTypes.string,
};


const PromoShelfAnimation = ({book}) => (
  <div className="bookshelfPromoShelf" aria-hidden="true">
    <div className="bookshelfPromoShelfTitle">My bookshelf</div>
    <div className="bookshelfPromoSlots">
      <div className="bookshelfPromoSlot">
        <div className="bookshelfPromoCard" style={{borderTopColor: categoryColor(book)}}>
          <div className="bookshelfPromoCardTitle">{bookTitle(book)}</div>
          <div className="bookshelfPromoCardRef">{displayRef(book) || book}</div>
          <span className="bookshelfPromoCardButton">Learn →</span>
        </div>
      </div>
      <div className="bookshelfPromoSlot" />
      <div className="bookshelfPromoSlot" />
    </div>
  </div>
);


const BookshelfPromoModal = ({promo, onClose}) => {
  const dialogRef = useRef(null);
  const {book, variant, animate} = promo;

  useEffect(() => {
    dialogRef.current && dialogRef.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const addToShelf = () => {
    onClose();
    Bookshelf.add(book, 'promo');
  };

  return (
    <div id="interruptingMessageBox" className={classNames("sefariaModalBox bookshelfPromo", {bookshelfPromoLimit: variant === 'limit'})}>
      <div id="interruptingMessageOverlay" onClick={onClose}></div>
      <div
        id="interruptingMessage"
        className="sefariaModalContentBox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookshelfPromoTitle"
        tabIndex="-1"
        ref={dialogRef}
      >
        <button type="button" id="interruptingMessageClose" className="sefariaModalClose" aria-label={Sefaria._("common.close")} onClick={onClose}>×</button>
        <div className="sefariaModalContent">
          {animate ? <PromoShelfAnimation book={book} /> : null}
          <h2 id="bookshelfPromoTitle" className="serif sans-serif-in-hebrew">
            {variant === 'limit' ? "Want to add more texts to your bookshelf?" : `Learning ${bookTitle(book)} again?`}
          </h2>
          {variant === 'add' ? (
            <>
              <p className="bookshelfPromoBody">Add it to your bookshelf on the Sefaria homepage and pick up where you left off.</p>
              <button type="button" className="button white control-elem" onClick={addToShelf}>Add to bookshelf</button>
              <div className="sefariaModalBottomContent">
                <button type="button" className="bookshelfLinkButton" onClick={onClose}>Not now</button>
              </div>
            </>
          ) : (
            <>
              <p className="bookshelfPromoBody">
                {variant === 'limit' ? "Create a free account to save as many as you like." : "Sign up or log in to add this text to your bookshelf."}
              </p>
              <a className="button white control-elem" href={"/register" + nextParam()} onClick={() => Bookshelf.setPending(book)}>
                <InterfaceText>common.sign_up</InterfaceText>
              </a>
              <div className="sefariaModalBottomContent">
                <InterfaceText>misc.already_have_an_account</InterfaceText>&nbsp;
                <a href={"/login" + nextParam()} onClick={() => Bookshelf.setPending(book)}>Log in</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
BookshelfPromoModal.propTypes = {
  promo: PropTypes.shape({book: PropTypes.string, variant: PropTypes.string, animate: PropTypes.bool}).isRequired,
  onClose: PropTypes.func.isRequired,
};


const BookshelfToast = ({toast, onClose}) => {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) { return; }
    const timer = setTimeout(onClose, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, paused]);

  const {book, source, removed} = toast;
  let secondLine = null;
  if (!removed && source === 'promo') {
    secondLine = Sefaria._uid ? (
      <div className="bookshelfToastHint">
        To save more books, click <StarIcon filled={false} /><span className="sr-only">the star</span> at the top of any text.
      </div>
    ) : (
      <div className="bookshelfToastHint">
        <a href={"/register" + nextParam()}>Sign up</a> or <a href={"/login" + nextParam()}>log in</a> to save more books.
      </div>
    );
  }

  return (
    <div
      className="bookshelfToast"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <button type="button" className="bookshelfToastClose" aria-label={Sefaria._("common.close")} onClick={onClose}>×</button>
      {removed ? (
        <div>{bookTitle(book)} was removed from your bookshelf.</div>
      ) : (
        <div>
          <span className="bookshelfToastCheck" aria-hidden="true">✓</span>{" "}
          {bookTitle(book)} was added to your bookshelf on the Sefaria homepage. <a href="/">View bookshelf</a>
        </div>
      )}
      {secondLine}
    </div>
  );
};
BookshelfToast.propTypes = {
  toast: PropTypes.shape({book: PropTypes.string, source: PropTypes.string, removed: PropTypes.bool}).isRequired,
  onClose: PropTypes.func.isRequired,
};


/** Promo modal and toast, mounted once in ReaderApp. */
const BookshelfOverlay = () => {
  const [promo, setPromo] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsubscribe = Bookshelf.subscribe((type, payload) => {
      if (type === 'promo') { setPromo(Bookshelf.takePromo()); }
      if (type === 'toast') { setToast({...payload, id: Date.now()}); }
    });
    const queued = Bookshelf.takePromo();
    if (queued) { setPromo(queued); }
    return unsubscribe;
  }, []);

  return (
    <>
      {promo ? <BookshelfPromoModal promo={promo} onClose={() => setPromo(null)} /> : null}
      {toast ? <BookshelfToast key={toast.id} toast={toast} onClose={() => setToast(null)} /> : null}
    </>
  );
};


const BookshelfCard = ({book}) => {
  const ref = Bookshelf.lastRef(book);
  const display = displayRef(book);
  const href = "/" + Sefaria.normRef(ref || book);
  return (
    <div className="bookshelfCard" style={{borderTopColor: categoryColor(book)}}>
      <h3 className="bookshelfCardTitle">{bookTitle(book)}</h3>
      {display ? <div className="bookshelfCardPlace">You were last learning {display}</div> : null}
      <a
        className="button small bookshelfCardButton"
        href={href}
        aria-label={display ? `Continue learning ${book} from ${display.replace(book, '').trim()}` : `Start learning ${book}`}
      >
        {display ? "Continue learning" : "Start learning"}
      </a>
    </div>
  );
};


const BookshelfSignUpSlot = () => (
  <div className="bookshelfCard bookshelfSignUpSlot">
    <h3 className="bookshelfCardTitle">+ Add more texts</h3>
    <div className="bookshelfCardPlace">Sign up to keep more books here and pick up where you left off.</div>
    <div className="bookshelfSignUpLinks">
      <a href="/register?next=/">Sign up</a> or <a href="/login?next=/">log in</a>
    </div>
  </div>
);


/** "My bookshelf" section above Browse the Library. */
const BookshelfHome = () => {
  useBookshelfVersion();
  const mounted = useMounted();
  if (!mounted) { return null; }
  const books = Bookshelf.homeBooks();
  if (!books.length) { return null; }
  return (
    <section className="bookshelfHome" aria-labelledby="bookshelfHomeTitle" id="bookshelf">
      <h2 id="bookshelfHomeTitle" className="bookshelfHomeTitle">My bookshelf</h2>
      <div className="bookshelfGrid">
        {books.map(book => <BookshelfCard book={book} key={book} />)}
        {!Sefaria._uid ? <BookshelfSignUpSlot /> : null}
      </div>
    </section>
  );
};


export { BookshelfStar, BookshelfOverlay, BookshelfHome };

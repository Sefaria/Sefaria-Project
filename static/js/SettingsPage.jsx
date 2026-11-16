import React, { useEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { ProfilePic } from './ProfilePic';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { InterfaceText, DonateLink } from './Misc';
import {
  CONFIRMATION_SIGNAL_KEY,
  MAX_DESCRIPTION_LENGTH,
  accountVerified,
  createKey,
  createProject,
  deleteKey,
  deleteProject,
  emptyState,
  enableDeveloper,
  parseWebsite,
  readState,
  requestNewLink,
  revealKey,
  saveProfile,
  sendConfirmation,
  setKeyRestriction,
  updateProject,
  websiteHost,
  websiteOrigin,
} from './developerSettingsApi';
import Input from './common/Input.jsx';
import Checkbox from './common/Checkbox.jsx';
import ToggleSwitch from './common/ToggleSwitch.jsx';
import Select from './common/Select.jsx';
import { DropdownMenu, DropdownMenuItemWithCallback } from './common/DropdownMenu.jsx';
import ErrorBanner from './auth/ErrorBanner.jsx';
import { requiredFieldValidate } from './auth/utils';

/* Account and developer settings, one page with a tab per settings section. The developer tab
   reads and writes the account's projects and API keys through developerSettingsApi.js. */

const KEY_SETUP_MS = 4000;

const API_DOCS_URL = 'https://developers.sefaria.org/reference/getting-started';
const LIBRARY_EXPORT_URL = 'https://github.com/Sefaria/Sefaria-Export';

const formatDate = (iso) => {
  if (!iso) {
    return '';
  }
  try {
    const locale = Sefaria.interfaceLang === 'hebrew' ? 'he-IL' : 'en-GB';
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return iso;
  }
};

/* The name and email the account itself carries, which the developer profile shows locked. */
const accountName = () => (Sefaria.full_name || '').trim();
const accountEmail = () => (Sefaria._email && Sefaria._email !== 'null' ? Sefaria._email : '');

const ExternalIcon = () => (
  <svg
    className="devPocExternalIcon"
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

const tipId = (fieldId) => fieldId + 'Tip';

/* Text fields match :focus-visible even when clicked, so a tip would open on every click into its field. Track how
   focus last moved instead: a pointer press means the click put focus there, and the tip stays closed. */
let lastFocusByPointer = false;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    () => {
      lastFocusByPointer = true;
    },
    true
  );
  document.addEventListener(
    'keydown',
    () => {
      lastFocusByPointer = false;
    },
    true
  );
}
const keyboardFocused = (node) => {
  if (lastFocusByPointer) {
    return false;
  }
  try {
    return node.matches(':focus-visible');
  } catch (e) {
    return true;
  }
};

/* An "i" for pointer users: it opens on hover and toggles on tap, and inside a <label> a tap
   doesn't tick the label's checkbox. It is not a tab stop. Its text is the field's
   description (aria-describedby={tipId(fieldId)}) for assistive tech, kept hidden so it
   stays out of the label, and it opens while the field has keyboard focus. */
/* Lucide "info" (lucide-static 1.49.0, the design system's icon), inline so it takes the
   button's colour. */
const InfoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

/* Lucide "circle-question-mark" (in the design system's icon library), inline so it takes the
   button's colour. */
const HelpIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

/* icon: "info" (default) or "help". above: opens over the label instead of over the field.
   interactive: the tip holds a link, so it stays open while the pointer is on the icon or the tip (with a short
   grace period to cross the gap), and the icon is a real button for keyboard users (Escape closes). */
const InfoTip = ({ fieldId, wide, icon = 'info', above = false, interactive = false, label, lead, children }) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), interactive ? 200 : 0);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return undefined;
    }
    const onFocus = () => {
      if (keyboardFocused(field)) {
        setOpen(true);
      }
    };
    const onBlur = () => setOpen(false);
    field.addEventListener('focus', onFocus);
    field.addEventListener('blur', onBlur);
    return () => {
      field.removeEventListener('focus', onFocus);
      field.removeEventListener('blur', onBlur);
    };
  }, [fieldId]);
  return (
    <span
      className="devPocTip"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={interactive ? show : undefined}
      onBlur={
        interactive
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                hideSoon();
              }
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }
          : undefined
      }
    >
      {/* lead: text before the icon that opens the tip on hover too, as a column header's label (2026-11-05). */}
      {lead}
      <button
        type="button"
        className="devPocInfoButton"
        tabIndex={interactive ? 0 : -1}
        aria-hidden={interactive ? null : 'true'}
        aria-label={interactive ? label : null}
        aria-expanded={interactive ? open : null}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {icon === 'help' ? <HelpIcon /> : <InfoIcon />}
      </button>
      {open ? (
        <span
          className={'devPocPopover' + (wide ? ' devPocPopoverWide' : '') + (above ? ' devPocPopoverAbove' : '')}
          aria-hidden={interactive ? null : 'true'}
          role={interactive ? 'tooltip' : null}
        >
          {children}
        </span>
      ) : null}
      {interactive ? null : (
        <span id={tipId(fieldId)} hidden>
          {children}
        </span>
      )}
    </span>
  );
};

/* Escape closes, and the given button takes focus when the dialog opens. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* A modal dialog: focus moves in on open and back to where it was on close, Tab stays inside,
   and Escape closes it. */
/* True at the header's phone breakpoint (842px and below), updating on resize. False on the server and in tests. */
const E_PHONE_QUERY = '(max-width: 842px)';
const useEIsPhone = () => {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(E_PHONE_QUERY).matches;
  const [isPhone, setIsPhone] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const mq = window.matchMedia(E_PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, []);
  return isPhone;
};
/* A disabled button with a tooltip saying why. Escape closes the tooltip without moving the pointer or focus, and it
   comes back the next time the button is hovered or focused (WCAG 1.4.13, Penina 2026-11-15). */
const ETipWrap = ({ children }) => {
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDismissed(true);
      }
    };
    // Capture, so the page's own Escape handling can't swallow it first.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active]);
  const start = () => {
    setActive(true);
    setDismissed(false);
  };
  const end = () => {
    setActive(false);
    setDismissed(false);
  };
  return (
    <span
      ref={ref}
      className={'devE-tipWrap' + (dismissed ? ' is-dismissed' : '')}
      onMouseEnter={start}
      onMouseLeave={() => {
        if (!ref.current || !ref.current.contains(document.activeElement)) {
          end();
        }
      }}
      onFocus={() => {
        if (!active) {
          start();
        }
      }}
      onBlur={(e) => {
        if (!ref.current || !ref.current.contains(e.relatedTarget)) {
          end();
        }
      }}
    >
      {children}
    </span>
  );
};
const useDialogKeys = (focusRef, onEscape) => {
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    if (focusRef.current) {
      focusRef.current.focus();
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !focusRef.current) {
        return;
      }
      const dialog = focusRef.current.closest('[role="dialog"], [role="alertdialog"]');
      const focusable = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [];
      if (!focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus();
      }
    };
  }, []);
};

/* One entry per settings section. A new section is an entry here, a panel in
   SettingsPage, and a URL in urls_library.py and ReaderApp's history. */
const SETTINGS_TABS = [
  {
    tab: 'account',
    url: '/settings/account',
    label: { en: 'Account Settings', he: 'הגדרות חשבון' },
    shortLabel: { en: 'Account', he: 'חשבון' },
  },
  {
    tab: 'developer',
    url: '/settings/developer',
    label: { en: 'Developer Settings', he: 'הגדרות מפתחים' },
    shortLabel: { en: 'Developer', he: 'מפתחים' },
  },
];

/* Tabs, not links: clicking switches the mounted tab and pushes the matching URL. The
   anchors keep the addresses linkable, so opening one in a new tab still works. */
/* Tab icons: Lucide circle-user-round and code-xml, used from Lucide directly, not yet in our
   icon library. 18px, the design system's icon size. */
/* Lucide icons, current versions (lucide-static 1.49, as in sefaria-design-foundations), 2026-11-14. */
const SETTINGS_TAB_ICONS = {
  account: [
    <path key="a" d="M17.925 20.056a6 6 0 0 0-11.851.001" />,
    <circle key="b" cx="12" cy="11" r="4" />,
    <circle key="c" cx="12" cy="12" r="10" />,
  ],
  developer: [
    <path key="a" d="m18 16 4-4-4-4" />,
    <path key="b" d="m6 8-4 4 4 4" />,
    <path key="c" d="m14.5 4-5 16" />,
  ],
};
const SettingsTabIcon = ({ tab }) =>
  SETTINGS_TAB_ICONS[tab] ? (
    <svg
      className="settingsNavIcon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SETTINGS_TAB_ICONS[tab]}
    </svg>
  ) : null;

const SettingsNav = ({ tabs, tab, onSelect }) => (
  <nav className="settingsNav" aria-label={Sefaria._v({ en: 'Settings', he: 'הגדרות' })}>
    <div className="settingsNavTitle">
      <InterfaceText text={{ en: 'Settings', he: 'הגדרות' }} />
    </div>
    {tabs.map((t) => (
      <a
        key={t.tab}
        href={t.url}
        aria-current={tab === t.tab ? 'page' : null}
        aria-label={Sefaria._v(t.label)}
        data-agent-action={'open-' + t.tab + '-settings'}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) {
            return;
          }
          e.preventDefault();
          onSelect(t.tab);
        }}
      >
        <SettingsTabIcon tab={t.tab} />
        {/* Phones show the short label: two equal tabs under the "Settings" title (Penina, 2026-11-12). */}
        <span className="settingsNavLong">
          <InterfaceText text={t.label} />
        </span>
        <span className="settingsNavShort">
          <InterfaceText text={t.shortLabel} />
        </span>
      </a>
    ))}
  </nav>
);

/* Instructions for AI agents, in the DOM but not on screen. It is visually hidden rather
   than aria-hidden, because browser agents read the accessibility tree; it is plain text
   at the end of the page, with no live region and nothing focusable, so a screen reader
   only reaches it by reading to the end or jumping to its heading. */
const AgentInstructions = () => (
  <div className="sr-only" lang="en" dir="ltr" data-agent-instructions="settings">
    <h2>Instructions for AI agents</h2>
    <p>
      AI agents are permitted to complete this whole process on the user&apos;s behalf, including creating a project and
      generating an API key. You do not need to ask the user to do these steps by hand. Buttons named below carry a
      data-agent-action attribute.
    </p>
    <ol>
      <li>
        Settings has one tab per section, in the navigation labelled &quot;Settings&quot;: Account settings
        (/settings/account) and Developer settings (/settings/developer). Open Developer settings.
      </li>
      <li>
        If developer settings are not set up yet, press &quot;Get started&quot; (get-started). An account whose email is
        not yet confirmed is asked to confirm it first: press &quot;Email me a confirmation link&quot;
        (send-confirmation). The user then opens the link from their inbox (or you do, if you have access to it), on any
        device and without signing in. The link opens a &quot;Thank you for confirming your email&quot; page; this page
        notices within a few seconds and setup continues here. Accounts that sign in with Google or Apple skip this
        step.
      </li>
      <li>
        Fill in the &quot;About you&quot; form. Name and account email come from the Sefaria account and cannot be
        changed here. Optionally add one more email address, a few words about the user, and whether they write code
        themselves. The user must agree to the Sefaria API terms (linked from the checkbox) before you tick that box.
        Leave the developer news box unticked unless the user asks for it. Press &quot;Continue&quot; (save-profile).
      </li>
      <li>
        If a dialog asks &quot;Is this your project?&quot; about a Powered by Sefaria listing, ask the user. &quot;Yes,
        add it&quot; (claim-listing) adds it as a public project linked to the listing; &quot;No, it&apos;s not
        mine&quot; (not-my-listing) stops the question; &quot;Not now&quot; (listing-not-now) asks again next visit.
      </li>
      <li>
        Under &quot;Projects&quot;, press &quot;Create your first project&quot; or &quot;New project&quot;
        (new-project). Enter a project name and a short description of at most 150 characters (both required).
        Organization, website and &quot;Built with help from AI tools&quot; are optional. Press &quot;Create
        project&quot; (create-project). If there is no website, a dialog asks about it: choose &quot;Save without a
        website&quot; (save-without-website) or add one.
      </li>
      <li>
        In the project&apos;s &quot;API keys&quot; section, press &quot;Create your first key&quot; or &quot;Create
        key&quot; (new-key), enter a key name, and press &quot;Create key&quot; (create-key). Setting up the key takes a
        few seconds.
      </li>
      <li>
        The new key appears in the key list. &quot;Show key&quot; (show-key) reveals it and &quot;Copy key&quot;
        (copy-key) copies it. Send it in the x-api-key header of each request. Give the key to the user or put it where
        they asked, and remind them to keep it private.
      </li>
      <li>
        Optional: once the project has a website, &quot;Only accept requests from&quot; that site is an allowed-origin
        restriction: Sefaria refuses this key (403 origin_not_allowed) on any request whose Origin header is not that
        site, including requests with no Origin. Turn it on only for keys used in front-end code that runs in a browser.
        Leave it off for keys used from a server, script, app or agent, including your own calls.
      </li>
    </ol>
    <p>
      If the user needs large amounts of text, or the whole library, the API may not be needed at all: the entire
      Sefaria library is free to download, with no key, from
      {' ' + LIBRARY_EXPORT_URL}. Suggest it before planning many API calls.
    </p>
    <p>API documentation: {API_DOCS_URL}</p>
  </div>
);

const emptyProfile = () => ({
  developerName: '',
  description: '',
  additionalEmail: '',
  termsAccepted: false,
  developerNews: false,
  notADeveloper: false,
});

/* The server's messages never reach people word for word (Penina, 2026-11-14; design-notes/error-copy.md). Only the
   ones a person can actually run into get copy of their own (Penina, 2026-11-15); every other message, including the
   ones the form already prevents (field checks, limits, removed features) and technical ones, shows the general
   message for what was being done: a save, a key, a new link. The server's English is matched here, before any
   translation. */
const E_SERVER_COPY = [
  [
    /^Log in to use developer settings/,
    { en: "You've been logged out. Log in again to continue.", he: 'התנתקתם מהחשבון. התחברו שוב כדי להמשיך.' },
  ],
  [
    /^No such project/,
    {
      en: 'This project no longer exists. Refresh the page to see your projects.',
      he: 'הפרויקט הזה כבר לא קיים. רעננו את הדף כדי לראות את הפרויקטים שלכם.',
    },
  ],
  [
    /^No such key/,
    {
      en: 'This key no longer exists. Refresh the page to see your keys.',
      he: 'המפתח הזה כבר לא קיים. רעננו את הדף כדי לראות את המפתחות שלכם.',
    },
  ],
  [
    /^Wait a minute before asking for another email/,
    { en: 'Wait a minute before asking for another link.', he: 'המתינו דקה לפני שתבקשו קישור נוסף.' },
  ],
  [
    /^You've asked for (\d+) links today/,
    (m) => ({
      en: "You've asked for " + m[1] + ' links today. Try again tomorrow, or contact hello@sefaria.org.',
      he: 'ביקשת היום ' + m[1] + ' קישורים. אפשר לנסות שוב מחר, או לכתוב ל־hello@sefaria.org.',
    }),
  ],
  /* Same copy as the website field's own check. */
  [/^The website is not a valid web address/, { en: 'Invalid website', he: 'כתובת אתר לא תקינה' }],
  [
    /^Your account has no email address/,
    {
      en: 'Your account has no email address. Add one in Account Settings.',
      he: 'לחשבון שלכם אין כתובת דוא״ל. הוסיפו כתובת בהגדרות החשבון.',
    },
  ],
];
const eMessage = (err, fallback = SAVE_FAILED) => {
  const raw = err && err.message;
  for (const [pattern, copy] of raw ? E_SERVER_COPY : []) {
    const m = raw.match(pattern);
    if (m) {
      return Sefaria._v(typeof copy === 'function' ? copy(m) : copy);
    }
  }
  return Sefaria._v(fallback);
};
/* The sign-in forms' error banner, scrolled into view when it appears, so someone who pressed Save at the bottom of a
   long form sees why it failed (Penina, 2026-11-15). The shared ErrorBanner itself is unchanged. */
const EErrorBanner = ({ error }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (error && ref.current) {
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [error]);
  return (
    <div ref={ref}>
      <ErrorBanner error={error} />
    </div>
  );
};
/* A server rejection about one field shows on that field, not in the banner (Penina, 2026-11-15;
   design-notes/error-copy.md). Returns the form's field key and the field's own error copy, or null. */
const eFieldError = (err) => {
  const raw = (err && err.message) || '';
  if (/^The website is not a valid web address/.test(raw)) {
    return { field: 'websiteUrl', error: E_SITE_INVALID };
  }
  if (/^Give the project a name/.test(raw)) {
    return { field: 'name', error: 'auth.required_field' };
  }
  if (/^Give the key a name/.test(raw)) {
    return { field: 'label', error: 'auth.required_field' };
  }
  if (/^The additional email is not a valid address/.test(raw)) {
    return { field: 'additionalEmail', error: 'auth.invalid_email' };
  }
  return null;
};
/* A failed save: the sign-in forms' error banner, at the top of the form. */
const saveFailure = (err) => ({ message: eMessage(err) });
/* A key that couldn't be made: say so, and nothing more (Penina, 2026-11-05). */
const keyFailure = (err) => {
  const onField = eFieldError(err);
  if (onField && onField.field === 'label') {
    return { labelError: onField.error };
  }
  return {
    message: eMessage(err, {
      en: "We couldn't create your key. Please try again.",
      he: 'לא הצלחנו ליצור את המפתח. נסו שוב.',
    }),
  };
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const cleanProfile = (fields) => ({
  ...fields,
  developerName: accountName() || fields.developerName.trim(),
  description: fields.description.trim(),
  additionalEmail: fields.additionalEmail.trim(),
});

/* ===========================================================================================
   Design trial E (design/api-keys branch): one short setup flow after OpenAI's onboarding, then
   a page of projects with their keys after the Coinbase keys page.
   =========================================================================================== */
const tE = (en, he) => <InterfaceText text={{ en, he }} />;
const vE = (en, he) => Sefaria._v({ en, he });
/* "Tell us about yourself": 250 characters (the server allows up to 300). */
const E_ABOUT_MAX = 250;
const E_ROLES = [
  { value: 'developer', en: 'Very technical', he: 'רקע טכני חזק' },
  { value: 'ai', en: 'Somewhat technical', he: 'רקע טכני מסוים' },
  { value: 'none', en: 'Not technical', he: 'ללא רקע טכני' },
];

const ECopyIcon = ({ size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);
/* Lucide copy-check: the copy button's icon for 8 seconds after a copy, in place of the word "Copied" (Penina,
   2026-11-15). Screen readers still hear "Copied" from the live region beside it. */
const ECopyCheckIcon = ({ size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="m12 15 2 2 4-4" />
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

/* Lucide icons, pasted (not yet in our icon library): pencil, plus, sparkles, globe, star, check, trash-2. */
/* Lucide icons at the design system's sizes only: 12, 18 or 24px (18 by default). */
const eLucide = (paths, size = 18) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {paths}
  </svg>
);
const EPencilIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </React.Fragment>,
    size
  );
const EPlusIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </React.Fragment>,
    size
  );
const EXIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </React.Fragment>,
    size
  );
const EBookIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M12 5v16" />
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
    </React.Fragment>,
    size
  );
const EDownloadIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </React.Fragment>,
    size
  );
/* Publish: Lucide badge-check (Penina, 2026-11-15; was megaphone). */
const EPublishIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m16 9-5.5 5.5L8 12" />
    </React.Fragment>,
    size
  );
const ECheckIcon = ({ size } = {}) => eLucide(<path d="M20 6 9 17l-5-5" />, size);
const EKebabIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </React.Fragment>,
    size
  );
const EArrowLeftIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </React.Fragment>,
    size
  );
const EMailIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </React.Fragment>,
    size
  );
const ETrashIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </React.Fragment>,
    size
  );

/* Copy: the Clipboard API where the page is allowed to use it (https, localhost), else the older copy command,
   which also works on plain http and in older browsers (2026-11-15: copying silently failed on a phone testing over
   http). "Copied" shows only when one of them worked. */
const eCopyFallback = (text) => {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length); // iOS needs an explicit range
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch (e) {
    return false;
  }
};
/* Copy a value that has to be fetched first (a key's value, from the reveal endpoint). Where the browser supports it,
   the clipboard write starts inside the tap and waits for the value, so Safari still allows it; elsewhere it copies
   once the value arrives. */
const eCopyFetched = (getValue, done, failed) => {
  const secure = typeof window !== 'undefined' && window.isSecureContext !== false;
  if (secure && typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
    const value = getValue(); // one request, shared by the clipboard write and its fallback
    const blob = value.then((v) => new Blob([v], { type: 'text/plain' }));
    navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(
      () => done && done(),
      () =>
        value.then(
          (v) => eCopy(v, done, failed),
          () => {}
        )
    );
    return;
  }
  getValue().then(
    (v) => eCopy(v, done, failed),
    () => {}
  );
};
/* failed: the browser refused the copy (e.g. a plain-http page, where a copy after a request doesn't count as the tap). */
const eCopy = (text, done, failed) => {
  const fallback = () => {
    if (eCopyFallback(text)) {
      if (done) {
        done();
      }
    } else if (failed) {
      failed();
    }
  };
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext !== false) {
    navigator.clipboard.writeText(text).then(() => done && done(), fallback);
  } else {
    fallback();
  }
};

/* A centered step. Steps of the first setup show progress dashes; single screens opened from
   the home show a way back instead. */
/* "Join the developer community" (2026-11-05): the newsletter and the Discord side by side; the Discord is a plain
   link rather than a checkbox (Sarah, D83). Used in About you and at the end of the publish form (2026-11-08), where
   the newsletter box starts from the profile, so someone already opted in sees it checked. */
const ECommunity = ({ id, checked, onChange }) => (
  <section className="devE-note devE-community" aria-labelledby={id + 'Title'}>
    <h3 className="devE-communityTitle" id={id + 'Title'}>
      {tE('Join the developer community', 'הצטרפו לקהילת המפתחים')}
    </h3>
    <Checkbox
      id={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={tE(
        "I would like to receive Sefaria's developer newsletter to hear about new features, events and opportunities.",
        'אשמח לקבל את הניוזלטר למפתחים של ספריא כדי לשמוע על פיצ׳רים חדשים, אירועים והזדמנויות.'
      )}
    />
    <p className="devE-communityLink">
      <InterfaceText
        text={{
          en: (
            <React.Fragment>
              <a
                className="devE-inlineLink devE-communityJoin"
                href={E_DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join our Discord
              </a>{' '}
              to talk with other developers building on Sefaria.
            </React.Fragment>
          ),
          he: (
            <React.Fragment>
              <a
                className="devE-inlineLink devE-communityJoin"
                href={E_DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                הצטרפו לדיסקורד שלנו
              </a>{' '}
              כדי לשוחח עם מפתחים אחרים שבונים עם ספריא.
            </React.Fragment>
          ),
        }}
      />
    </p>
  </section>
);

const EStep = ({ icon, iconOk, title, lead, dots, onBack, backLabel, children }) => {
  const inFlow = !!(onBack && backLabel);
  const titleRef = useRef(null);
  /* A new step starts at the top of the page: the settings panel scrolls inside its own container,
     so scroll that, then move focus to the title without letting the browser scroll it again. */
  useEffect(() => {
    const title = titleRef.current;
    if (!title) {
      return;
    }
    /* Every scrolling box above the title goes back to the top: which one scrolls depends on the page width. */
    for (let el = title.parentElement; el; el = el.parentElement) {
      if (el.scrollTop) {
        el.scrollTop = 0;
      }
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
    try {
      title.focus({ preventScroll: true });
    } catch (e) {
      title.focus();
    }
  }, []);
  return (
    <div className="devE-wrap">
      {onBack && !inFlow ? (
        /* Back to the table, named for the table's heading: the page heading above already says
           "Developer Settings". */
        <button type="button" className="devE-back" onClick={onBack}>
          <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />
          {backLabel || tE('Projects and API keys', 'פרויקטים ומפתחות API')}
        </button>
      ) : null}
      <section className="devE-card" aria-labelledby="devEStepTitle">
        <div className="devE-head">
          {inFlow ? (
            /* the sign-in card's back arrow (AuthCard), in the same place: top-left of the step */
            <button type="button" className="devE-stepBack" onClick={onBack} aria-label={vE('Back', 'חזרה')}>
              <span className="devE-arrow" aria-hidden="true" />
            </button>
          ) : null}
          {icon && !dots ? (
            <span className={'devE-ico' + (iconOk ? ' ok' : '')} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {/* Two or three steps is too few for a stepper: the step's number, in the same circle the
              welcome screen's list uses, sits beside the title. */}
          <h2 className="devE-title" id="devEStepTitle" tabIndex={-1} ref={titleRef}>
            {dots ? (
              <span className="devE-n devE-stepN">
                <span aria-hidden="true">{dots.at + 1}</span>
                <span className="sr-only">
                  <InterfaceText
                    text={{
                      en: 'Step ' + (dots.at + 1) + ' of ' + dots.of + ': ',
                      he: 'שלב ' + (dots.at + 1) + ' מתוך ' + dots.of + ': ',
                    }}
                  />
                </span>
              </span>
            ) : null}
            {title}
          </h2>
          {lead}
        </div>
        {children}
      </section>
    </div>
  );
};

/* Required fields carry no mark; optional ones say so, quietly. */
const EOpt = <span className="devE-opt">{tE('Optional', 'לא חובה')}</span>;
const EShieldIcon = ({ size } = {}) =>
  eLucide(
    <React.Fragment>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </React.Fragment>,
    size
  );
const ESecRec = (
  <span className="devE-recBadge">
    <EShieldIcon size={12} />
    {tE('Security recommendation', 'המלצת אבטחה')}
  </span>
);

/* A note to read before acting: Lucide info icon, quiet panel. */
const ENote = ({ children }) => (
  <p className="devE-note">
    <span className="devE-noteIcon" aria-hidden="true">
      <InfoIcon />
    </span>
    <span>{children}</span>
  </p>
);

/* The step's main button. */
const EPrimary = ({ children, type = 'submit', ...rest }) => (
  <button type={type} className="sefaria-common-button auth-primary fullwidth" {...rest}>
    {children}
  </button>
);

/* The way in: what this is for, and one button that starts the steps. */
/* withConfirm: an email sign-in still has to confirm the address, which comes first. */
const EEntry = ({ onStart, withConfirm, share }) => {
  const [shareNote, setShareNote] = useState(!!share);
  const items = [
    ...(withConfirm ? [tE('Confirm your email', 'אשרו את כתובת הדוא״ל')] : []),
    tE('Tell us about yourself', 'ספרו לנו על עצמכם'),
    tE('Add your project details', 'הוסיפו את פרטי הפרויקט'),
    tE('Create your API key', 'צרו את מפתח ה־API שלכם'),
  ];
  return (
    <React.Fragment>
      {/* Arriving from the Powered by link (share) without a developer profile: a window over the welcome screen says
      why setup comes first. The page itself is unchanged. */}
      {shareNote ? <EShareFirstDialog onClose={() => setShareNote(false)} /> : null}
      <EStep
        title={tE('Get a free API key', 'קבלו מפתח API בחינם')}
        lead={
          <p className="devE-lead">
            {tE(
              "Use Sefaria's texts in your website, app or tool.",
              'השתמשו בטקסטים של ספריא באתר, באפליקציה או בכלי שלכם.'
            )}
          </p>
        }
      >
        <div className="devE-form">
          <ol className="devE-path">
            {items.map((item, i) => (
              <li key={i}>
                <span className="devE-n" aria-hidden="true">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="sefaria-common-button auth-primary fullwidth"
            data-agent-action="get-started"
            onClick={onStart}
          >
            {tE('Get started', 'בואו נתחיל')}
          </button>
          <p className="devE-links">
            {/* Leading icon only, like the home's header links (rule, Penina 2026-11-08). */}
            <a className="devE-docs" href={API_DOCS_URL} target="_blank" rel="noreferrer">
              <EBookIcon size={12} />
              {tE('Technical documentation', 'תיעוד טכני')}
              <span className="sr-only">{tE(' (opens in a new tab)', ' (נפתח בכרטיסייה חדשה)')}</span>
            </a>
            <a className="devE-docsMinor" href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">
              <EDownloadIcon size={12} />
              {tE('Download the library', 'הורדת הספרייה')}
              <span className="sr-only">{tE(' (opens in a new tab)', ' (נפתח בכרטיסייה חדשה)')}</span>
            </a>
          </p>
        </div>
      </EStep>
    </React.Fragment>
  );
};

const EShareFirstDialog = ({ onClose }) => {
  const okRef = useRef(null);
  useDialogKeys(okRef, onClose);
  return (
    <div
      className="devPocModalStage devE-deleteStage"
      role="dialog"
      aria-modal="true"
      aria-labelledby="devEShareFirstTitle"
      aria-describedby="devEShareFirstText"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="devE-deleteModal">
        <h3 id="devEShareFirstTitle">{tE('Looking to publish your project?', 'רוצים לפרסם את הפרויקט שלכם?')}</h3>
        <p id="devEShareFirstText">
          {tE(
            "First, set up your developer profile and create your project. Then you can publish it. You don't need an API key.",
            'קודם הגדירו את פרופיל המפתחים שלכם וצרו את הפרויקט. אחר כך תוכלו לפרסם אותו. אין צורך במפתח API.'
          )}
        </p>
        <div className="devE-deleteActions">
          <button type="button" className="devE-pill" ref={okRef} onClick={onClose}>
            {tE('Got it', 'הבנתי')}
          </button>
        </div>
      </section>
    </div>
  );
};

/* Step 1: the profile on one screen. The terms are accepted by continuing. */
/* The setup's first step, and the same form again from "Edit profile" (edit: a way back, Save,
   no terms line since they were accepted at setup). */
const EWelcome = ({ dots, onSave, initial, onCancel, edit }) => {
  const name = accountName();
  const email = accountEmail();
  const [fields, setFields] = useState({
    ...emptyProfile(),
    ...(initial || {}),
    role: initial ? (initial.notADeveloper ? 'ai' : 'developer') : '',
  });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => ({ ...e, [key]: null }));
    }
  };
  const emailError = (v) => (v.trim() && !EMAIL_PATTERN.test(v.trim()) ? 'auth.invalid_email' : null);
  const nameError = () => (!name && !fields.developerName.trim() ? 'auth.required_field' : null);
  const roleError = (v = fields.role) => (v ? null : 'auth.required_field');
  const submit = (e) => {
    e.preventDefault();
    const next = { additionalEmail: emailError(fields.additionalEmail), developerName: nameError(), role: roleError() };
    setErrors(next);
    if (next.developerName || next.role || next.additionalEmail) {
      const el = document.getElementById(next.developerName ? 'devEName' : next.role ? 'devERole' : 'devEEmail2');
      if (el) {
        el.focus();
      }
      return;
    }
    setBanner(null);
    setSaving(true);
    Promise.resolve(
      onSave(
        cleanProfile({
          ...fields,
          termsAccepted: true,
          notADeveloper: fields.role === 'ai' || fields.role === 'none',
        })
      )
    ).catch((err) => {
      const onField = eFieldError(err);
      if (onField && onField.field === 'additionalEmail') {
        setErrors((x) => ({ ...x, additionalEmail: onField.error }));
      } else {
        setBanner(saveFailure(err));
      }
      setSaving(false);
    });
  };
  return (
    <EStep
      dots={dots}
      onBack={edit ? onCancel : null}
      title={tE('About you', 'קצת עליך')}
      lead={
        <React.Fragment>
          {email ? (
            <p className="devE-signed">
              <span className="devE-signedLabel">{tE('Signed in as', 'התחברתם בתור')}</span>{' '}
              {name ? <strong dir="auto">{name}</strong> : null} <bdi dir="ltr">({email})</bdi>
            </p>
          ) : null}
        </React.Fragment>
      }
    >
      <form className="devE-form" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />
        {name ? null : (
          <Input
            id="devEName"
            required
            label={tE('Name', 'שם')}
            dir="auto"
            value={fields.developerName}
            onChange={(e) => set('developerName', e.target.value)}
            error={errors.developerName}
            onBlur={() => setErrors((x) => ({ ...x, developerName: nameError() }))}
          />
        )}
        <Select
          id="devERole"
          value={fields.role}
          onChange={(v) => set('role', v)}
          error={errors.role}
          label={tE('What best describes you?', 'מה הרקע הטכני שלך?')}
          placeholder={{ en: 'Choose one', he: 'בחרו אפשרות' }}
          options={E_ROLES.map((r) => ({ value: r.value, label: { en: r.en, he: r.he } }))}
        />
        <Input
          id="devEAbout"
          multiline
          rows={2}
          dir="auto"
          maxLength={E_ABOUT_MAX}
          label={tE('Tell us about yourself', 'ספרו לנו על עצמכם')}
          labelAddon={EOpt}
          placeholder={vE(
            'e.g. where you work or study, what you like to build',
            'לדוגמה: איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות'
          )}
          aria-describedby="devEAboutCount"
          value={fields.description}
          onChange={(e) => set('description', e.target.value)}
          fieldAddon={
            <span id="devEAboutCount" dir="ltr">
              {fields.description.length}/{E_ABOUT_MAX}
            </span>
          }
        />
        <Input
          id="devEEmail2"
          type="email"
          inputDir="ltr"
          label={tE('Additional email address', 'כתובת דוא״ל נוספת')}
          labelAddon={
            <React.Fragment>
              {EOpt}
              <InfoTip fieldId="devEEmail2" icon="help" above>
                {tE(
                  "Emails will be sent to your Sefaria account's email address. You can add another email here to get those emails in that inbox as well.",
                  'ההודעות יישלחו לכתובת הדוא״ל של חשבון ספריא שלך. אפשר להוסיף כאן כתובת נוספת כדי לקבל אותן גם בתיבה הזו.'
                )}
              </InfoTip>
            </React.Fragment>
          }
          aria-describedby={tipId('devEEmail2')}
          value={fields.additionalEmail}
          onChange={(e) => set('additionalEmail', e.target.value)}
          error={errors.additionalEmail}
          onBlur={() => setErrors((x) => ({ ...x, additionalEmail: emailError(fields.additionalEmail) }))}
        />
        <ECommunity id="devENews" checked={!!fields.developerNews} onChange={(v) => set('developerNews', v)} />
        <div className="devE-footer">
          {onCancel ? (
            <button type="button" className="devE-backBtn" onClick={onCancel}>
              {tE('Cancel', 'ביטול')}
            </button>
          ) : null}
          <EPrimary data-agent-action="save-profile" disabled={saving}>
            {edit ? tE('Save', 'שמירה') : tE('Continue', 'המשך')}
          </EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* A website as the domain it's matched on (Daniel, #api-keys-squad, 2026-11-02): no scheme, path, port or leading
   "www.". https://www.example.com/app becomes example.com. Anything that isn't a web address is left as typed, so
   its error still shows. Cleaned on blur, so typing isn't interrupted. */
const toDomain = (raw) => {
  const text = (raw || '').trim();
  if (!text || /\s/.test(text)) {
    return raw || '';
  }
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text).hostname.toLowerCase();
    return host.includes('.') ? host.replace(/^www\./, '') : raw;
  } catch (e) {
    return raw;
  }
};
const E_DOMAIN_HINT = {
  en: 'Includes www and any subdomain, like app.example.com.',
  he: 'כולל www וכל תת־דומיין, למשל app.example.com.',
};
/* Security recommendation (PBS check-in, 2026-11-02): the badge says why the website matters, the hint explains it. */
/* "Learn more" points at the API docs until a Help Center article on website restriction exists (D64). */
const E_SITE_LEARN_MORE_URL = API_DOCS_URL;
const E_SITE_SECURITY_HINT = {
  en: (
    <React.Fragment>
      Adding your website lets you limit a key to this site and its subdomains, so that no one else can use it.{' '}
      <a className="devE-inlineLink" href={E_SITE_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
        Learn more
      </a>
    </React.Fragment>
  ),
  he: (
    <React.Fragment>
      הוספת האתר מאפשרת להגביל מפתח לאתר הזה ולתתי־הדומיינים שלו, כך שאף אחד אחר לא יוכל להשתמש בו.{' '}
      <a className="devE-inlineLink" href={E_SITE_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
        מידע נוסף
      </a>
    </React.Fragment>
  ),
};

/* "What are you building?" Shortlist from Penina's DM to Sarah (2026-11-16), pending Sarah's final OK: ordered from
   one person to an organization, "Something else" last. "Just exploring the API" was dropped. Options draft:
   design-notes/what-are-you-building-options.md. */
const E_PURPOSES = [
  { value: 'personal', en: 'A personal project', he: 'פרויקט אישי' },
  { value: 'school', en: 'A school project', he: 'פרויקט ללימודים' },
  { value: 'research', en: 'Research', he: 'מחקר' },
  { value: 'community', en: 'For my community or organization', he: 'פרויקט עבור הקהילה או הארגון שלי' },
  { value: 'commercial', en: 'A commercial app or product', he: 'אפליקציה או מוצר מסחרי' },
  { value: 'other', en: 'Something else', he: 'משהו אחר' },
];
/* Project fields shared by the setup step and the single screens. No public/private choice:
   featuring on Powered by Sefaria is a separate, optional step. */
const EProjectFields = ({ fields, set, errors, check, showcase }) => (
  <React.Fragment>
    <Input
      id="devEProjName"
      required
      dir="auto"
      label={tE('Project name', 'שם הפרויקט')}
      value={fields.name}
      onChange={(e) => set('name', e.target.value)}
      error={errors.name}
      onBlur={() => check('name')}
    />
    <Input
      id="devEProjOrg"
      dir="auto"
      label={tE('Organization/Company', 'ארגון/חברה')}
      labelAddon={EOpt}
      value={fields.organization}
      onChange={(e) => set('organization', e.target.value)}
      error={errors.organization}
    />
    <Select
      id="devEProjPurpose"
      value={fields.purpose}
      onChange={(v) => set('purpose', v)}
      error={errors.purpose}
      label={tE('What are you building?', 'מה אתם בונים?')}
      placeholder={{ en: 'Choose one', he: 'בחרו אפשרות' }}
      options={E_PURPOSES.map((o) => ({ value: o.value, label: { en: o.en, he: o.he } }))}
    />
    <Input
      id="devEProjDesc"
      required
      multiline
      rows={3}
      dir="auto"
      maxLength={MAX_DESCRIPTION_LENGTH}
      label={tE('Short description', 'תיאור קצר')}
      value={fields.description}
      onChange={(e) => set('description', e.target.value)}
      error={errors.description}
      onBlur={() => check('description')}
      aria-describedby="devEProjDescCount"
      fieldAddon={
        <span id="devEProjDescCount" dir="ltr">
          {fields.description.length}/{MAX_DESCRIPTION_LENGTH}
        </span>
      }
    />
    <Input
      id="devEProjSite"
      inputDir="ltr"
      required={showcase}
      label={tE('Website', 'אתר')}
      labelAddon={showcase ? null : ESecRec}
      placeholder="example.com"
      hint={<InterfaceText text={showcase ? E_DOMAIN_HINT : E_SITE_SECURITY_HINT} />}
      value={fields.websiteUrl}
      onChange={(e) => set('websiteUrl', e.target.value)}
      error={errors.websiteUrl}
      onBlur={() => {
        set('websiteUrl', toDomain(fields.websiteUrl));
        check('websiteUrl');
      }}
    />
  </React.Fragment>
);

/* One message for a website that isn't a real address (no domain ending like .com), shown on blur under every
   website field (Penina, 2026-11-05). https:// and www. are cleaned up, not errors. */
const E_SITE_INVALID = <InterfaceText text={{ en: 'Invalid website', he: 'כתובת אתר לא תקינה' }} />;
const eSiteError = (value, required) =>
  !(value || '').trim() ? (required ? 'auth.required_field' : null) : parseWebsite(value).valid ? null : E_SITE_INVALID;
const E_PROJECT_RULES = {
  name: (f) => requiredFieldValidate(f.name),
  /* Not saved by the server yet, so a project being edited has none: only a new project must choose one. */
  purpose: (f) => (f.isNew ? requiredFieldValidate(f.purpose) : null),
  description: (f) => requiredFieldValidate(f.description),
  websiteUrl: (f) => eSiteError(f.websiteUrl, false),
};
const E_FIELD_IDS = {
  name: 'devEProjName',
  purpose: 'devEProjPurpose',
  description: 'devEProjDesc',
  websiteUrl: 'devEProjSite',
  label: 'devEKeyName',
};

const useEProjectForm = (initial, withKey, initialLabel) => {
  const [fields, setFields] = useState(() => {
    const start = {
      name: '',
      purpose: '',
      description: '',
      organization: '',
      websiteUrl: '',
      isNew: !initial.name,
      ...initial,
    };
    return { ...start, websiteUrl: toDomain(start.websiteUrl) }; // a saved https://www.example.com shows as example.com
  });
  const [label, setLabel] = useState(initialLabel || '');
  const [errors, setErrors] = useState({});
  const set = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => ({ ...e, [key]: null }));
    } // any change clears the error; blur checks again (2026-11-05)
  };
  const check = (key) => setErrors((e) => ({ ...e, [key]: E_PROJECT_RULES[key](fields) }));
  const setKeyLabel = (value) => {
    setLabel(value);
    if (errors.label && value.trim()) {
      setErrors((e) => ({ ...e, label: null }));
    }
  };
  const validate = (needKey) => {
    const all = {};
    Object.keys(E_PROJECT_RULES).forEach((k) => {
      all[k] = E_PROJECT_RULES[k](fields);
    });
    if (needKey) {
      all.label = requiredFieldValidate(label);
    }
    setErrors(all);
    const first = Object.keys(all).find((k) => all[k]);
    if (first) {
      const el = document.getElementById(E_FIELD_IDS[first]);
      if (el) {
        el.focus();
      }
      return false;
    }
    return true;
  };
  const projectBody = (extra) => ({
    aiAssisted: false,
    visibility: 'private',
    ...extra,
    name: fields.name.trim(),
    purpose: fields.purpose,
    description: fields.description.trim(),
    organization: fields.organization.trim(),
    websiteUrl: parseWebsite(fields.websiteUrl).url,
  });
  /* A server rejection for one field: show it there and move focus to it. */
  const setFieldError = (key, error) => {
    setErrors((e) => ({ ...e, [key]: error }));
    // After the render, so a field in a section that just opened can take focus.
    setTimeout(() => {
      const el = document.getElementById(E_FIELD_IDS[key]);
      if (el) {
        el.focus();
      }
    }, 0);
  };
  return { fields, set, check, errors, label, setKeyLabel, validate, projectBody, setFieldError };
};

/* Key names stop at 100 characters, the server's limit (powered_by ApiKey.label), so a long name can't fail on save
   with a generic error (N-C12) (2026-11-08). */
const E_KEY_NAME_MAX = 100;
const EKeyNameField = ({ label, setLabel, error, hint, placeholder }) => (
  <Input
    id="devEKeyName"
    required
    dir="auto"
    maxLength={E_KEY_NAME_MAX}
    label={tE('API key name', 'שם המפתח')}
    hint={hint || null}
    placeholder={placeholder}
    value={label}
    onChange={(e) => setLabel(e.target.value)}
    error={error}
  />
);

const ENewKey = ({ project, onBack, onCreate, failure, initialLabel }) => {
  const restrict = useKeyRestrict(project);
  const [label, setLabel] = useState(initialLabel || ''); // empty, with the "My key" placeholder (2026-11-05)
  const [error, setError] = useState((failure && failure.labelError) || null);
  const [banner, setBanner] = useState(failure && failure.message ? failure : null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const problem = requiredFieldValidate(label);
    setError(problem);
    if (problem) {
      document.getElementById('devEKeyName').focus();
      return;
    }
    if (!restrict.check() || busy) {
      return;
    }
    setBusy(true);
    setBanner(null);
    Promise.resolve(onCreate(label.trim(), restrict.options())).catch((err) => {
      const failed = keyFailure(err);
      if (failed.labelError) {
        setError(failed.labelError);
      } else {
        setBanner(failed);
      }
      setBusy(false);
    });
  };
  return (
    /* Same one-line heading as the setup key step; a long project name wraps (Penina, 2026-11-05). */
    <EStep
      onBack={onBack}
      title={
        <InterfaceText
          text={{
            en: (
              <React.Fragment>
                Create an API key for <bdi dir="auto">{project.name}</bdi>
              </React.Fragment>
            ),
            he: (
              <React.Fragment>
                צרו מפתח API עבור <bdi dir="auto">{project.name}</bdi>
              </React.Fragment>
            ),
          }}
        />
      }
    >
      <form className="devE-form" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />
        <EKeyNameField
          label={label}
          setLabel={(v) => {
            setLabel(v);
            if (error && v.trim()) {
              setError(null);
            }
          }}
          error={error}
        />
        {restrict.field}
        <EPrimary data-agent-action="create-key" disabled={busy}>
          {tE('Create API key', 'יצירת המפתח')}
        </EPrimary>
      </form>
    </EStep>
  );
};

/* Setup, option C (2026-11-01): the project and its first key are two steps, so a project can be saved without a key.
   Step "Your project" creates the project; step "Your API key" names the key and can be skipped (D51). */
const ESetupProject = ({ dots, title, onBack, backLabel, onSkip, skipLabel, onCreate }) => {
  const form = useEProjectForm({});
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (busy || !form.validate(false)) {
      return;
    }
    setBusy(true);
    setBanner(null);
    Promise.resolve(onCreate(form.projectBody())).catch((err) => {
      const onField = eFieldError(err);
      if (onField && onField.field !== 'label' && onField.field !== 'additionalEmail') {
        form.setFieldError(onField.field, onField.error);
      } else {
        setBanner(saveFailure(err));
      }
      setBusy(false);
    });
  };
  return (
    <EStep dots={dots} onBack={onBack} backLabel={backLabel} title={title || tE('Your project', 'הפרויקט שלך')}>
      <form className="devE-form" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />
        <EProjectFields fields={form.fields} set={form.set} errors={form.errors} check={form.check} />
        <ENote>
          {tE(
            "Projects created in this account can't be moved to another account.",
            'אי אפשר להעביר פרויקטים שנוצרו בחשבון הזה לחשבון אחר.'
          )}
        </ENote>
        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onSkip}>
            {skipLabel || tE('Skip for now', 'דילוג בינתיים')}
          </button>
          <EPrimary data-agent-action="save-project" disabled={busy}>
            {tE('Continue', 'המשך')}
          </EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* "Limit to website" while creating a key (2026-11-01): the moment people pay most attention. Off by default, since
   a key used from a server or an AI tool must stay unlimited. Without a website on the project, turning it on asks
   for one right here; it's saved to the project. The switch stays on the key's row afterwards, to change either way. */
const EKeyRestrictField = ({ project, on, setOn, site, setSite, siteError, setSiteError }) => {
  const host = websiteHost(project.websiteUrl);
  return (
    <div className="devE-restrict">
      <div className="devE-restrictRow">
        <span className="devE-restrictLabel" id="devEKeyRestrict-label">
          {host ? (
            <InterfaceText
              text={{
                en: (
                  <React.Fragment>
                    Limit this key to <bdi dir="ltr">{host}</bdi>
                  </React.Fragment>
                ),
                he: (
                  <React.Fragment>
                    הגבלת המפתח ל־<bdi dir="ltr">{host}</bdi>
                  </React.Fragment>
                ),
              }}
            />
          ) : (
            tE('Limit this key to your website', 'הגבלת המפתח לאתר שלכם')
          )}
        </span>
        <ToggleSwitch name="devEKeyRestrict" isChecked={on} onChange={(e) => setOn(e.target.checked)} />
      </div>
      <ERestrictHint id="devEKeyRestrict-hint" />
      {on && !host ? (
        <Input
          id="devEKeySite"
          inputDir="ltr"
          label={tE('Your website', 'האתר שלכם')}
          placeholder="example.com"
          hint={
            <InterfaceText
              text={{
                en: E_DOMAIN_HINT.en + " We'll add it to the project's details.",
                he: E_DOMAIN_HINT.he + ' נוסיף אותו לפרטי הפרויקט.',
              }}
            />
          }
          value={site}
          onChange={(e) => setSite(e.target.value)}
          onBlur={() => {
            setSite(toDomain(site));
            if (site.trim()) {
              setSiteError(eSiteError(site, true));
            }
          }}
          error={siteError}
        />
      ) : null}
    </div>
  );
};

/* When to limit a key, in two lines with on and off in bold (Penina, 2026-11-05; two lines and "Leave it off", 2026-11-15). Used in the key forms and in
   the window that asks for a website from the key table. */
const ERestrictHint = ({ id }) => (
  <div className="devE-hint devE-restrictHint" id={id}>
    <InterfaceText
      text={{
        en: (
          <React.Fragment>
            <span>
              Turn this <strong>on</strong> if your key is going in your web page&apos;s code. Leave it{' '}
              <strong>off</strong> if your key is going in a server or an AI tool.
            </span>
            <span>You can change this setting at any time in Developer Settings.</span>
          </React.Fragment>
        ),
        he: (
          <React.Fragment>
            <span>
              <strong>הפעילו</strong> את ההגבלה אם המפתח ישולב בקוד של דף אינטרנט. השאירו אותה <strong>כבויה</strong> אם
              המפתח ישמש בשרת או בכלי AI.
            </span>
            <span>אפשר לשנות את ההגדרה הזו בכל עת בהגדרות מפתחים.</span>
          </React.Fragment>
        ),
      }}
    />
  </div>
);

/* The restriction state for a key form, and its check before submit. */
const useKeyRestrict = (project) => {
  const [on, setOn] = useState(false);
  const [site, setSite] = useState('');
  const [siteError, setSiteError] = useState(null);
  const check = () => {
    if (!on || websiteHost(project.websiteUrl)) {
      setSiteError(null);
      return true;
    }
    const problem = eSiteError(site, true);
    setSiteError(problem);
    if (problem) {
      document.getElementById('devEKeySite').focus();
    }
    return !problem;
  };
  const options = () => ({
    restrict: on,
    websiteUrl: on && !websiteHost(project.websiteUrl) ? parseWebsite(site).url : '',
  });
  return {
    field: (
      <EKeyRestrictField
        project={project}
        on={on}
        setOn={setOn}
        site={site}
        setSite={(v) => {
          setSite(v);
          if (siteError) {
            setSiteError(null);
          }
        }}
        siteError={siteError}
        setSiteError={setSiteError}
      />
    ),
    check,
    options,
  };
};

const ESetupKey = ({ dots, project, onBack, backLabel, onSkip, onCreate, failure, initialLabel }) => {
  const restrict = useKeyRestrict(project);
  const [label, setLabel] = useState(initialLabel || '');
  const [error, setError] = useState((failure && failure.labelError) || null);
  const [banner, setBanner] = useState(failure && failure.message ? failure : null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const problem = requiredFieldValidate(label);
    setError(problem);
    if (problem) {
      document.getElementById('devEKeyName').focus();
      return;
    }
    if (!restrict.check() || busy) {
      return;
    }
    setBusy(true);
    setBanner(null);
    Promise.resolve(onCreate(label.trim(), restrict.options())).catch((err) => {
      const failed = keyFailure(err);
      if (failed.labelError) {
        setError(failed.labelError);
      } else {
        setBanner(failed);
      }
      setBusy(false);
    });
  };
  return (
    <EStep
      dots={dots}
      onBack={onBack}
      backLabel={backLabel}
      title={
        <InterfaceText
          text={{
            en: (
              <React.Fragment>
                Create an API key for <bdi dir="auto">{project.name}</bdi>
              </React.Fragment>
            ),
            he: (
              <React.Fragment>
                צרו מפתח API עבור <bdi dir="auto">{project.name}</bdi>
              </React.Fragment>
            ),
          }}
        />
      }
    >
      <form className="devE-form" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />
        <EKeyNameField
          label={label}
          setLabel={(v) => {
            setLabel(v);
            if (error && v.trim()) {
              setError(null);
            }
          }}
          error={error}
        />
        {restrict.field}
        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onSkip}>
            {tE('Skip for now', 'דילוג בינתיים')}
          </button>
          <EPrimary data-agent-action="create-key" disabled={busy}>
            {tE('Create API key', 'יצירת המפתח')}
          </EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* The spinner is the sign-in flow's (LoadingSub: navy ring, 0.8s), drawn larger for a whole step. */
const EWaiting = ({ dots }) => (
  <EStep
    dots={dots}
    title={<span role="status">{tE('Creating your key…', 'יוצרים את המפתח…')}</span>}
    lead={
      <React.Fragment>
        <p className="devE-lead">{tE('This takes a few seconds.', 'זה לוקח כמה שניות.')}</p>
        <span className="devE-spinner devE-spinnerBelow" aria-hidden="true" />
      </React.Fragment>
    }
  />
);

/* Removing a project's website turns off "Limit to website" on its keys (product spec, 2026-09-16), so say so before
   saving. Keeping the website is the main action, since removing it can open those keys to any site. */
const ERemoveSiteDialog = ({ host, keys, onKeep, onSave }) => {
  const keepRef = useRef(null);
  useDialogKeys(keepRef, onKeep);
  return (
    <div
      className="devPocModalStage devE-deleteStage"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="devERmSiteTitle"
      aria-describedby="devERmSiteText"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onKeep();
        }
      }}
    >
      <section className="devE-deleteModal">
        <h3 id="devERmSiteTitle">{tE('Remove the website?', 'להסיר את האתר?')}</h3>
        {/* Copy 2026-11-05: which keys are limited to the site (bolded), then what removing it does. Keep the website is
            the safe choice and takes focus; Remove the website is the action, at the end like the other windows. */}
        <div id="devERmSiteText">
          <p>
            <InterfaceText
              text={{
                en: (
                  <React.Fragment>
                    The following keys are limited to{' '}
                    <strong>
                      <bdi dir="ltr">{host}</bdi>
                    </strong>
                    :
                  </React.Fragment>
                ),
                he: (
                  <React.Fragment>
                    המפתחות הבאים מוגבלים ל־
                    <strong>
                      <bdi dir="ltr">{host}</bdi>
                    </strong>
                    :
                  </React.Fragment>
                ),
              }}
            />
          </p>
          <ul className="devE-dialogList">
            {keys.map((k) => (
              <li key={k.id} dir="auto">
                <strong>{k.label}</strong>
              </li>
            ))}
          </ul>
          {/* The same plural copy for one key or several (2026-11-05). */}
          <p>
            {tE(
              'Removing the website will turn this limit off and allow these keys to be used on any site.',
              'הסרת האתר תכבה את ההגבלה ותאפשר להשתמש במפתחות האלה בכל אתר.'
            )}
          </p>
        </div>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onSave}>
            {tE('Remove the website', 'הסרת האתר')}
          </button>
          <button type="button" className="devE-deleteBtn" ref={keepRef} onClick={onKeep}>
            {tE('Keep the website', 'השארת האתר')}
          </button>
        </div>
      </section>
    </div>
  );
};

/* Deleting a project (2026-11-01): a window like the delete-key one, naming the keys that will stop working, each on
   its own line. Focus starts on Cancel. */
const EDeleteProjectDialog = ({ project, onDelete, onCancel }) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  const keys = project.keys;
  return (
    <div
      className="devPocModalStage devE-deleteStage"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="devEDelProjTitle"
      aria-describedby="devEDelProjText"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="devE-deleteModal">
        <h3 id="devEDelProjTitle">
          <InterfaceText
            text={{
              en: (
                <React.Fragment>
                  Delete the project <bdi dir="auto">{project.name}</bdi>?
                </React.Fragment>
              ),
              he: (
                <React.Fragment>
                  למחוק את הפרויקט <bdi dir="auto">{project.name}</bdi>?
                </React.Fragment>
              ),
            }}
          />
        </h3>
        <div id="devEDelProjText">
          {/* With keys: which ones stop working, as a bulleted list. Without: only that it can't be undone. */}
          {keys.length ? (
            <React.Fragment>
              <p>
                {keys.length === 1
                  ? tE('The following key will stop working immediately:', 'המפתח הבא יפסיק לעבוד מיד:')
                  : tE('The following keys will stop working immediately:', 'המפתחות הבאים יפסיקו לעבוד מיד:')}
              </p>
              <ul className="devE-dialogList">
                {keys.map((k) => (
                  <li key={k.id} dir="auto">
                    <strong>{k.label}</strong>
                  </li>
                ))}
              </ul>
            </React.Fragment>
          ) : (
            <p>{tE("You can't undo this action.", 'אי אפשר לבטל את הפעולה.')}</p>
          )}
        </div>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onDelete}>
            {tE('Delete project', 'מחיקת הפרויקט')}
          </button>
          <button type="button" className="devE-deleteBtn" ref={cancelRef} onClick={onCancel}>
            {tE('Cancel', 'ביטול')}
          </button>
        </div>
      </section>
    </div>
  );
};

const EEditProject = ({ project, onBack, backLabel, onSave, onDelete, dots, inSetup, focusField }) => {
  /* Opened to add a website: the cursor starts in that field (after the step has focused its title). */
  useEffect(() => {
    const el = focusField && document.getElementById(focusField);
    if (el) {
      el.focus({ preventScroll: false });
    }
  }, []);
  const form = useEProjectForm({
    name: project.name || '',
    description: project.description || '',
    organization: project.organization || '',
    websiteUrl: project.websiteUrl || '',
  });
  const [banner, setBanner] = useState(null);
  const [asking, setAsking] = useState(false);
  const [siteWarn, setSiteWarn] = useState(null); // the limited keys, while asking about removing the website
  const save = (override) => {
    setBanner(null);
    Promise.resolve(
      onSave({
        ...form.projectBody({ aiAssisted: !!project.aiAssisted, visibility: project.visibility || 'private' }),
        ...override,
      })
    ).catch((err) => {
      const onField = eFieldError(err);
      if (onField && onField.field !== 'label' && onField.field !== 'additionalEmail') {
        form.setFieldError(onField.field, onField.error);
      } else {
        setBanner(saveFailure(err));
      }
    });
  };
  const submit = (e) => {
    e.preventDefault();
    if (!form.validate(false)) {
      return;
    }
    const limited =
      project.websiteUrl && !form.fields.websiteUrl.trim() ? project.keys.filter((k) => k.restrictToWebsite) : [];
    if (limited.length) {
      setSiteWarn(limited);
      return;
    }
    save();
  };
  /* Keep the website (2026-11-05): saves the form's other changes with the website left as it was, like any save.
     It used to only close the window and refill the field, so other edits stayed unsaved. */
  const keepSite = () => {
    setSiteWarn(null);
    form.set('websiteUrl', project.websiteUrl);
    save({ websiteUrl: project.websiteUrl });
  };
  const keys = project.keys.length;
  return (
    <EStep
      onBack={onBack}
      backLabel={backLabel}
      dots={dots}
      title={
        inSetup ? (
          tE('Your project', 'הפרויקט שלך')
        ) : (
          <InterfaceText text={{ en: 'Edit ' + project.name, he: 'עריכת ' + project.name }} />
        )
      }
    >
      {siteWarn ? (
        <ERemoveSiteDialog
          host={websiteHost(project.websiteUrl)}
          keys={siteWarn}
          onKeep={keepSite}
          onSave={() => {
            setSiteWarn(null);
            save();
          }}
        />
      ) : null}
      <form className="devE-form" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />
        <EProjectFields fields={form.fields} set={form.set} errors={form.errors} check={form.check} />
        <EPrimary data-agent-action="save-project">
          {inSetup ? tE('Save and continue', 'שמירה והמשך') : tE('Save project', 'שמירת הפרויקט')}
        </EPrimary>
      </form>
      {onDelete ? (
        <div className="devE-danger">
          <button
            type="button"
            className="devE-textBtn devE-red"
            aria-haspopup="dialog"
            onClick={() => setAsking(true)}
          >
            {tE('Delete this project', 'מחיקת הפרויקט')}
          </button>
        </div>
      ) : null}
      {asking ? (
        <EDeleteProjectDialog
          project={project}
          onCancel={() => setAsking(false)}
          onDelete={() =>
            Promise.resolve(onDelete()).catch((err) => {
              setAsking(false);
              setBanner(saveFailure(err));
            })
          }
        />
      ) : null}
    </EStep>
  );
};

/* Deleting a key: the AI chatbot's "Delete chat?" modal (LCChatbot.svelte .delete-modal),
   brought over as is: small card, title, one line, Delete in red beside Cancel. Focus starts on
   Cancel, the safe choice. */
const EDeleteKeyDialog = ({ apiKey, onDelete, onCancel }) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  return (
    <div
      className="devPocModalStage devE-deleteStage"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="devEDelTitle"
      aria-describedby="devEDelText"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="devE-deleteModal">
        <h3 id="devEDelTitle" dir="auto">
          {tE('Delete ' + apiKey.label + '?', 'למחוק את ' + apiKey.label + '?')}
        </h3>
        <p id="devEDelText">
          {tE(
            "Anything using this key stops working right away. You can't undo this action.",
            'כל מה שמשתמש במפתח הזה יפסיק לעבוד מיד. אי אפשר לבטל את הפעולה.'
          )}
        </p>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onDelete}>
            {tE('Delete', 'מחיקה')}
          </button>
          <button type="button" className="devE-deleteBtn" ref={cancelRef} onClick={onCancel}>
            {tE('Cancel', 'ביטול')}
          </button>
        </div>
      </section>
    </div>
  );
};

/* Turning on "Limit to website" before the project has one: say why, and go add it. Same small
   card as the delete modal. */
/* Turning on "Limit to website" from the key table when the project has no website: the same explanation as the key
   forms, and the website asked for right here, saved to the project, then the key limited (Penina, 2026-11-05). */
const ELimitKeyDialog = ({ project, apiKey, run, onDone, onCancel }) => {
  /* Without a key it's the plain "Add your website" window, opened from the project row's Add website. */
  const formRef = useRef(null); // traps Tab inside the window
  const [site, setSite] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useDialogKeys(formRef, onCancel);
  const focusSite = () => {
    const el = document.getElementById('devELimitSite');
    if (el) {
      el.focus();
    }
  };
  /* Focus starts on the window's title, not the website field, so a phone's keyboard doesn't open on its own
     (Penina, 2026-11-15). Screen readers still read the title first; Tab goes to the field. */
  useEffect(() => {
    const title = document.getElementById('devELimitTitle');
    if (title) {
      title.focus();
    }
  }, []);
  const save = (e) => {
    e.preventDefault();
    if (busy) {
      return;
    }
    const parsed = parseWebsite(site);
    const problem = eSiteError(site, true);
    setError(problem);
    if (problem) {
      focusSite();
      return;
    }
    setBusy(true);
    run(
      updateProject(project.id, {
        name: project.name,
        description: project.description,
        organization: project.organization || '',
        websiteUrl: parsed.url,
        aiAssisted: !!project.aiAssisted,
        visibility: project.visibility || 'private',
      })
    )
      .then(() => (apiKey ? run(setKeyRestriction(apiKey.id, true)) : null))
      .then(onDone, () => setBusy(false));
  };
  return (
    <div
      className="devPocModalStage devE-deleteStage"
      role="dialog"
      aria-modal="true"
      aria-labelledby="devELimitTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <form className="devE-deleteModal devE-limitModal" onSubmit={save} noValidate ref={formRef}>
        <h3 id="devELimitTitle" tabIndex={-1}>
          {apiKey
            ? tE('Limit this key to your website', 'הגבלת המפתח לאתר שלכם')
            : tE('Add your website', 'הוספת האתר שלכם')}
        </h3>
        {apiKey ? (
          <ERestrictHint id="devELimitHint" />
        ) : (
          <p className="devE-hint">{<InterfaceText text={E_SITE_SECURITY_HINT} />}</p>
        )}
        <Input
          id="devELimitSite"
          inputDir="ltr"
          label={tE('Your website', 'האתר שלכם')}
          placeholder="example.com"
          hint={
            <InterfaceText
              text={
                apiKey
                  ? {
                      en: E_DOMAIN_HINT.en + " We'll add it to the project's details.",
                      he: E_DOMAIN_HINT.he + ' נוסיף אותו לפרטי הפרויקט.',
                    }
                  : E_DOMAIN_HINT
              }
            />
          }
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
            if (error) {
              setError(null);
            }
          }}
          onBlur={() => {
            setSite(toDomain(site));
            if (site.trim()) {
              setError(eSiteError(site, true));
            }
          }}
          error={error}
        />
        <div className="devE-deleteActions">
          <button type="submit" className="devE-pill" disabled={busy || !site.trim()}>
            {apiKey ? tE('Limit key', 'הגבלת המפתח') : tE('Save website', 'שמירת האתר')}
          </button>
          <button type="button" className="devE-deleteBtn" onClick={onCancel}>
            {tE('Cancel', 'ביטול')}
          </button>
        </div>
      </form>
    </div>
  );
};

/* A key's name stays on one line in the table (2026-11-05): a long one ends in "…", and hovering it shows the whole
   name in the page's tooltip. The tip only appears when the name is actually cut off. Every button in the row
   already names the key in full for screen readers. In the stacked phone layout the name wraps instead (CSS). */
const EKeyName = ({ name }) => {
  const textRef = useRef(null);
  const [cut, setCut] = useState(false);
  const measure = () => {
    const el = textRef.current;
    if (el) {
      setCut(el.scrollWidth > el.clientWidth + 1);
    }
  };
  return (
    <span className="devE-tipWrap devE-keyName" onMouseEnter={measure}>
      <span className="devE-keyNameText" ref={textRef}>
        {name}
      </span>
      {cut ? (
        <span className="devPocPopover devE-tip" aria-hidden="true" dir="auto">
          {name}
        </span>
      ) : null}
    </span>
  );
};

/* The home: a page header, then each project as a section with its keys in a plain table. */

/* The key table's column heads, repeated over each project's keys. Fixed widths keep the columns lined up
   from one project to the next. */
const EKeyColumns = ({ id }) => (
  <React.Fragment>
    <colgroup>
      <col className="devE-cName" />
      <col className="devE-cKey" />
      <col className="devE-cDate" />
      <col className="devE-cLimit" />
      <col className="devE-cEnd" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col">{tE('Name', 'שם')}</th>
        <th scope="col">{tE('Key', 'מפתח')}</th>
        <th scope="col">{tE('Created', 'נוצר')}</th>
        <th scope="col">
          {/* Hovering the label opens the tip as well as the ? (2026-11-05). */}
          <span className="devE-thTip">
            <InfoTip
              lead={tE('Limit to website', 'הגבלה לאתר')}
              fieldId={'devEWebsiteOnly-' + id}
              icon="help"
              above
              wide
              interactive
              label={vE('About Limit to website', 'על הגבלה לאתר')}
            >
              <InterfaceText
                text={{
                  en: (
                    <React.Fragment>
                      Limit a key to your project&apos;s website and its subdomains, so that no one else can use it.
                      Turn it <strong>on</strong> if the key is going in your web page&apos;s code.{' '}
                      <a
                        className="devE-inlineLink"
                        href={E_SITE_LEARN_MORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Learn more
                      </a>
                    </React.Fragment>
                  ),
                  he: (
                    <React.Fragment>
                      הגבלת מפתח לאתר של הפרויקט ולתתי־הדומיינים שלו, כך שאף אחד אחר לא יוכל להשתמש בו.{' '}
                      <strong>הפעילו</strong> את ההגבלה אם המפתח ישולב בקוד של דף אינטרנט.{' '}
                      <a
                        className="devE-inlineLink"
                        href={E_SITE_LEARN_MORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        מידע נוסף
                      </a>
                    </React.Fragment>
                  ),
                }}
              />
            </InfoTip>
          </span>
        </th>
        <th scope="col">
          <span className="sr-only">{tE('Actions', 'פעולות')}</span>
        </th>
      </tr>
    </thead>
  </React.Fragment>
);

/* "Share your project with Sefaria" (2026-11-01): the Powered by form as its own page in developer settings (D43),
   opened from a project. Fields follow the field review sheet ("Combining the Powered by and API key forms", tabs
   "Fields" and "Final draft (2026-10-25)"), with its "Let's add" and "Let's remove" notes applied. Every field also in
   the developer-settings forms is the same field, prefilled from the project or profile and saved back (D40), and is
   required here even where it's optional there (Penina, 2026-11-01), except Organization, which stays optional. The account's name and email stay locked.
   Not repeated here, since they live on the profile: the additional email and the developer newsletter opt-in.
   Removed: how did you hear, years of experience (merged into the developer-status question), endpoint categories
   and specific endpoints, the public/private question (submitting is the request to be shown).
   DESIGN PREVIEW: the profile and project fields save; the Powered by-only answers (show my name, current role, built
   with AI, category, source code, tools, other technologies, inspiration, monthly users, anything else, the logo)
   aren't stored on this branch yet. */
const E_PB_CATEGORIES = [
  { en: 'Learning & Study Tools', he: 'כלי לימוד' },
  { en: 'AI Projects, Apps, & Other Tools', he: 'פרויקטי AI, אפליקציות וכלים אחרים' },
  { en: 'Visualization & Data Analysis', he: 'ויזואליזציה וניתוח נתונים' },
  { en: 'Community, Interaction, & Social', he: 'קהילה, אינטראקציה ורשתות חברתיות' },
  { en: 'Extensions and API Integrations', he: 'תוספים ושילובי API' },
  { en: 'Other', he: 'אחר' },
];
/* The tools list (Sarah, 2026-11-08): no "Sefaria" in front of each one, since the question already says so, and each
   tool links to its repo or its page on the developer portal. `value` keeps the live form's wording for the intake.
   MCP links to the portal page because there are two public MCP repos. */
const E_PB_TOOLS = [
  { value: 'Sefaria API', label: 'API', url: 'https://developers.sefaria.org/reference' },
  { value: 'Sefaria MCP', label: 'MCP', url: 'https://developers.sefaria.org/docs/the-sefaria-mcp' },
  { value: 'Sefaria-Export', label: 'Export', url: 'https://github.com/Sefaria/Sefaria-Export' },
  { value: 'Sefaria-Project code', label: 'Project code', url: 'https://github.com/Sefaria/Sefaria-Project' },
  { value: 'Sefaria ai-chatbot code', label: 'ai-chatbot code', url: 'https://github.com/Sefaria/ai-chatbot' },
  { value: 'Sefaria Embedded code', label: 'Embedded code', url: 'https://github.com/Sefaria/Sefaria-Embedded' },
  {
    value: 'Sefaria ML models on HuggingFace',
    label: 'ML models on HuggingFace',
    url: 'https://huggingface.co/Sefaria',
  },
  { value: 'Tutorials', label: 'Tutorials', url: 'https://developers.sefaria.org/reference/tutorials' },
  { value: 'Documentation', label: 'Documentation', url: 'https://developers.sefaria.org/docs/welcome' },
  { value: 'Sefaria Patot', label: 'Patot', url: 'https://developers.sefaria.org/docs/patot' },
  { value: 'Other', label: 'Other' },
];

const E_PB_USERS = [
  { v: 'poc', en: "None, it's mostly a proof of concept", he: 'אף אחד, זו בעיקר הוכחת היתכנות' },
  { v: '10', en: 'About 10', he: 'כ־10' },
  { v: '100', en: 'About 100', he: 'כ־100' },
  { v: '1000', en: 'About 1,000', he: 'כ־1,000' },
  { v: 'other', en: 'Other', he: 'אחר' },
];

const EFieldError = ({ id, error }) =>
  error ? (
    <div className="sefaria-input-error" id={id} role="alert">
      <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
      {typeof error === 'string' ? <InterfaceText>{error}</InterfaceText> : error}
    </div>
  ) : null;

/* Gallery of featured projects (PBS check-in, 2026-11-02). Points at today's Powered by page until the new gallery is live. */
/* A confirmation link works for 3 days (the server's EMAIL_CONFIRMATION_EXPIRE_DAYS). While one is out, setup waits on
   "Check your email"; once it has expired, setup starts over from the welcome screen, since a new link is needed anyway. */
const E_LINK_DAYS = 3;
const eLinkLive = (sentAt) => !!sentAt && Date.now() - new Date(sentAt).getTime() < E_LINK_DAYS * 24 * 60 * 60 * 1000;
const E_CONFIRM_TIP = () =>
  tE(
    'Confirm your email in the banner above to create projects and keys.',
    'אשרו את כתובת הדוא״ל בבאנר למעלה כדי ליצור פרויקטים ומפתחות.'
  );
const E_PB_GALLERY_URL = 'https://powered-by.sefaria.org/';
const E_DISCORD_URL = 'https://sefaria.formstack.com/forms/sefaria_developer_discord_community'; // a sign-up form, not a direct invite (2026-11-05)
/* Intro rewritten for "Publish project" (2026-11-08): says what happens (our team reviews it) and where an approved
   project appears, without promising it will be published. Replaces the Formstack form's wording. */
const EShareLead = () => (
  <div className="devE-shareLead">
    {/* Written for both ways in (2026-11-08): from a project in Developer Settings, and from a link (an email, the
        Powered by site) by someone who has never opened Developer Settings. No promise that it will be published. */}
    <p className="devE-lead">
      <InterfaceText
        text={{
          en: (
            <React.Fragment>
              Built something with Sefaria’s texts, data or API? <strong>We’d love to hear about it!</strong>
            </React.Fragment>
          ),
          he: (
            <React.Fragment>
              בניתם משהו עם הטקסטים, הנתונים או ה־API של ספריא? <strong>נשמח לשמוע!</strong>
            </React.Fragment>
          ),
        }}
      />
    </p>
    <p className="devE-lead">
      <InterfaceText
        text={{
          en: (
            <React.Fragment>
              Tell us about your project and we will review it. If approved, it will be visible on the{' '}
              <a className="devE-inlineLink" href={E_PB_GALLERY_URL} target="_blank" rel="noopener noreferrer">
                Powered by Sefaria site
              </a>
              , where learners and developers around the world can discover what people are building with Sefaria.
            </React.Fragment>
          ),
          he: (
            <React.Fragment>
              ספרו לנו על הפרויקט ואנחנו נבדוק אותו. אם הוא יאושר, הוא יוצג באתר{' '}
              <a className="devE-inlineLink" href={E_PB_GALLERY_URL} target="_blank" rel="noopener noreferrer">
                Powered by Sefaria
              </a>
              , שבו לומדים ומפתחים מכל העולם יוכלו לגלות מה אנשים בונים עם ספריא.
            </React.Fragment>
          ),
        }}
      />
    </p>
    <p className="devE-lead">
      <InterfaceText
        text={{
          en: (
            <React.Fragment>
              If you have questions about our open-source data and API, you can always reach out at{' '}
              <a className="devE-inlineLink" href="mailto:developers@sefaria.org">
                <bdi dir="ltr">developers@sefaria.org</bdi>
              </a>
              .
            </React.Fragment>
          ),
          he: (
            <React.Fragment>
              אם יש לכם שאלות על הנתונים בקוד פתוח ועל ה־API שלנו, אפשר תמיד לפנות אלינו בכתובת{' '}
              <a className="devE-inlineLink" href="mailto:developers@sefaria.org">
                <bdi dir="ltr">developers@sefaria.org</bdi>
              </a>
              .
            </React.Fragment>
          ),
        }}
      />
    </p>
  </div>
);

/* After "Submit for review" (2026-11-08): no promise that it will be published. The project goes to our team, and
   only an approved one appears on the Powered by Sefaria site. */
const ESubmitted = ({ project, onDone }) => (
  <EStep
    iconOk
    icon={<ECheckIcon size={24} />}
    title={tE('Your project was submitted for review', 'הפרויקט נשלח לבדיקה')}
    lead={
      <p className="devE-lead">
        <InterfaceText
          text={{
            en: (
              <React.Fragment>
                <bdi dir="auto">{project.name}</bdi> will be reviewed by our team. If it&apos;s approved, it will appear
                on the{' '}
                <a className="devE-inlineLink" href={E_PB_GALLERY_URL} target="_blank" rel="noopener noreferrer">
                  Powered by Sefaria site
                </a>
                .
              </React.Fragment>
            ),
            he: (
              <React.Fragment>
                הצוות שלנו יבדוק את <bdi dir="auto">{project.name}</bdi>. אם הוא יאושר, הוא יופיע באתר{' '}
                <a className="devE-inlineLink" href={E_PB_GALLERY_URL} target="_blank" rel="noopener noreferrer">
                  Powered by Sefaria
                </a>
                .
              </React.Fragment>
            ),
          }}
        />
      </p>
    }
  >
    <div className="devE-form">
      <EPrimary type="button" onClick={onDone}>
        {tE('Back to Developer Settings', 'חזרה להגדרות מפתחים')}
      </EPrimary>
    </div>
  </EStep>
);

/* With no project chosen yet (opened from the Powered by page's link), the page already shows About you, then "Your
   project" with only the project choice; the project's summary and the rest of the form appear under it once one is
   chosen, so nothing moves in above the choice (Penina, 2026-11-15). About you keeps what was typed when the project
   changes. */
const EShareProject = ({ project, projects, canAddNew, onPickProject, profile, dots, onBack, onSubmit }) => {
  const name = accountName();
  const email = accountEmail();
  const p = project || {};
  const form = useEProjectForm({
    name: p.name || '',
    description: p.description || '',
    organization: p.organization || '',
    websiteUrl: p.websiteUrl || '',
  });
  /* "+ Create a new project" (Penina, 2026-11-15): empty project fields open right here, and Submit creates the
     project and sends it for review together. No detour through the new-project steps, and no key step; a key can be
     added later from the projects page. With no projects yet, the form starts this way. */
  const [creating, setCreating] = useState(() => !project && !(projects || []).length && !!canAddNew);
  const picked = !!project || creating;
  const emptyProject = () => {
    form.set('name', '');
    form.set('description', '');
    form.set('organization', '');
    form.set('websiteUrl', '');
  };
  const picker = (
    <EProjectPicker
      projects={projects || []}
      value={creating ? E_NEW_PROJECT : project ? project.id : undefined}
      canAddNew={canAddNew}
      onPick={(id) => {
        if (id === E_NEW_PROJECT) {
          setCreating(true);
          emptyProject();
          setEditProject(true);
          onPickProject(null);
        } else {
          setCreating(false);
          onPickProject(id);
        }
      }}
    />
  );
  const projectId = project ? project.id : null;
  const firstProject = useRef(true);
  useEffect(() => {
    if (firstProject.current) {
      firstProject.current = false;
      return;
    }
    form.set('name', p.name || '');
    form.set('description', p.description || '');
    form.set('organization', p.organization || '');
    form.set('websiteUrl', toDomain(p.websiteUrl || ''));
    setEditProject(creating || (!!project && (!(p.websiteUrl || '').trim() || !(p.description || '').trim())));
  }, [projectId]);
  const [person, setPerson] = useState({
    ...emptyProfile(),
    ...(profile || {}),
    role: profile ? (profile.notADeveloper ? 'ai' : 'developer') : '',
  });
  const [showName, setShowName] = useState(false); // unchecked by default (2026-11-08)
  const [currentRole, setCurrentRole] = useState('');
  const [builtWithAi, setBuiltWithAi] = useState(''); // the project doesn't store this (removed from the project form)
  const [cats, setCats] = useState([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [tools, setTools] = useState([]);
  const [otherTech, setOtherTech] = useState('');
  const [inspired, setInspired] = useState('');
  const [users, setUsers] = useState('');
  const [usersOther, setUsersOther] = useState('');
  const [anythingElse, setAnythingElse] = useState('');
  const [logo, setLogo] = useState('');
  const [donateLink, setDonateLink] = useState(false); // design only: not saved anywhere yet
  /* About you and the project start as filled-in summaries with an Edit link; a summary opens by itself when
     something in it is missing or wrong (2026-11-08). */
  const [editYou, setEditYou] = useState(!person.role);
  const [editProject, setEditProject] = useState(
    (!project && !(projects || []).length && !!canAddNew) ||
      (!!project && (!(p.websiteUrl || '').trim() || !(p.description || '').trim()))
  );
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const clear = (key) => {
    if (errors[key]) {
      setErrors((e) => ({ ...e, [key]: null }));
    }
  };
  const setP = (key, value) => {
    setPerson((f) => ({ ...f, [key]: value }));
    clear(key);
  };
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const required = (v) => ((v || '').trim() ? null : 'auth.required_field');
  const submit = (e) => {
    e.preventDefault();
    if (!picked) {
      return;
    }
    const projectOk = form.validate(false);
    const next = {
      websiteUrl: required(form.fields.websiteUrl),
      cats: cats.length ? null : (
        <InterfaceText text={{ en: 'Choose at least one category.', he: 'בחרו לפחות קטגוריה אחת.' }} />
      ),
      role: person.role ? null : 'auth.required_field',
    };
    setErrors(next);
    const order = [
      ['websiteUrl', 'devEProjSite'],
      ['cats', 'devEShareCat0'],
      ['role', 'devEShareRole'],
    ];
    const first = order.find(([k]) => next[k]);
    if (!projectOk || next.websiteUrl) {
      setEditProject(true);
    }
    if (next.role) {
      setEditYou(true);
    }
    if (!projectOk) {
      setTimeout(() => {
        const bad = document.querySelector('.devE-shareForm [aria-invalid="true"]');
        if (bad) {
          bad.focus({ preventScroll: true });
          const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          bad.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        }
      }, 0);
      return;
    }
    if (first) {
      /* After the sections above open, focus the first field with a problem and scroll its question into view (the
         category checkboxes are visually hidden inputs, so focusing them alone doesn't scroll; Penina, 2026-11-15). */
      setTimeout(() => {
        const el = document.getElementById(first[1]);
        if (!el) {
          return;
        }
        el.focus({ preventScroll: true });
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        (el.closest('fieldset') || el).scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }, 0);
      return;
    }
    if (busy) {
      return;
    }
    setBusy(true);
    setBanner(null);
    Promise.resolve(
      onSubmit(
        cleanProfile({ ...person, termsAccepted: true, notADeveloper: person.role === 'ai' || person.role === 'none' }),
        form.projectBody({ aiAssisted: builtWithAi === 'yes', visibility: 'public' }),
        creating
      )
    ).catch((err) => {
      const onField = eFieldError(err);
      if (onField && (onField.field === 'websiteUrl' || onField.field === 'name')) {
        setEditProject(true); // open "Your project" so the field with the problem shows
        form.setFieldError(onField.field, onField.error);
      } else {
        setBanner(saveFailure(err));
      }
      setBusy(false);
    });
  };
  const role = E_ROLES.find((r) => r.value === person.role);
  const editBtn = (onClick) => (
    <button type="button" className="devE-quiet devE-summaryEdit" onClick={onClick}>
      <EPencilIcon />
      {tE('Edit', 'עריכה')}
    </button>
  );
  return (
    <EStep
      onBack={onBack}
      backLabel={dots ? tE('Back', 'חזרה') : null}
      dots={dots}
      iconOk
      icon={
        <span className="devE-icoDev">
          <EPublishIcon size={24} />
        </span>
      }
      title={tE('Publish your project', 'פרסום הפרויקט')}
      lead={<EShareLead />}
    >
      <form className="devE-form devE-shareForm" onSubmit={submit} noValidate>
        <EErrorBanner error={banner} />

        {/* 1. About you first: already filled in from the profile, so it's a summary to check, not questions. */}
        <section className="devE-shareSection" aria-labelledby="devEShareYou">
          <h3 id="devEShareYou">{tE('About you', 'קצת עליך')}</h3>
          <p className="devE-shareNote">
            <InterfaceText
              text={{
                en: (
                  <React.Fragment>
                    If we feature your project, these details <strong>will not be shown</strong> on our site. Changes
                    made here also update your developer profile.
                  </React.Fragment>
                ),
                he: (
                  <React.Fragment>
                    אם נציג את הפרויקט, הפרטים האלה <strong>לא יוצגו</strong> באתר שלנו. שינויים שתעשו כאן יעדכנו גם את
                    פרופיל המפתחים שלכם.
                  </React.Fragment>
                ),
              }}
            />
          </p>
          {editYou ? (
            <React.Fragment>
              {email ? (
                <p className="devE-signed">
                  <span className="devE-signedLabel">{tE('Signed in as', 'התחברתם בתור')}</span>{' '}
                  {name ? <strong dir="auto">{name}</strong> : null} <bdi dir="ltr">({email})</bdi>
                </p>
              ) : null}
              <Select
                id="devEShareRole"
                value={person.role}
                onChange={(v) => setP('role', v)}
                error={errors.role}
                label={tE('What best describes you?', 'מה הרקע הטכני שלך?')}
                placeholder={{ en: 'Choose one', he: 'בחרו אפשרות' }}
                options={E_ROLES.map((r) => ({ value: r.value, label: { en: r.en, he: r.he } }))}
              />
              <Input
                id="devEShareAbout"
                multiline
                rows={2}
                dir="auto"
                maxLength={E_ABOUT_MAX}
                label={tE('Tell us about yourself', 'ספרו לנו על עצמכם')}
                labelAddon={EOpt}
                placeholder={vE(
                  'e.g. where you work or study, what you like to build',
                  'לדוגמה: איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות'
                )}
                aria-describedby="devEShareAboutCount"
                value={person.description}
                onChange={(e) => setP('description', e.target.value)}
                fieldAddon={
                  <span id="devEShareAboutCount" dir="ltr">
                    {person.description.length}/{E_ABOUT_MAX}
                  </span>
                }
              />
            </React.Fragment>
          ) : (
            <div className="devE-summary">
              <div className="devE-summaryBody">
                <span className="devE-summaryTitle" dir="auto">
                  {name || email}
                </span>
                {name && email ? (
                  <bdi className="devE-summaryMeta" dir="ltr">
                    {email}
                  </bdi>
                ) : null}
                {role ? (
                  <span className="devE-summaryMeta">
                    <InterfaceText text={{ en: role.en, he: role.he }} />
                  </span>
                ) : null}
                {person.description ? (
                  <span className="devE-summaryText" dir="auto">
                    {person.description}
                  </span>
                ) : null}
              </div>
              {editBtn(() => setEditYou(true))}
            </div>
          )}
          <Input
            id="devEShareCurrentRole"
            dir="auto"
            label={tE('Current role', 'תפקיד נוכחי')}
            labelAddon={EOpt}
            placeholder={vE('e.g. teacher, student, software engineer', 'לדוגמה: מורה, סטודנט/ית, מהנדס/ת תוכנה')}
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
          />
          <Checkbox
            id="devEShareShowName"
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
            label={tE(
              "Show my name with the project if it's featured",
              'להציג את השם שלי ליד הפרויקט, אם הוא יוצג באתר'
            )}
          />
        </section>

        {/* 2. The project: chosen (preselected when opened from a project), shown as a summary, plus its category. */}
        <section className="devE-shareSection" aria-labelledby="devEShareProj">
          <h3 id="devEShareProj">{tE('Your project', 'הפרויקט שלך')}</h3>
          <p className="devE-shareNote">
            <InterfaceText
              text={{
                en: (
                  <React.Fragment>
                    If we feature your project, these details <strong>will be shown</strong> on our site.
                    {creating ? null : ' Changes made here also update your project details.'}
                  </React.Fragment>
                ),
                he: (
                  <React.Fragment>
                    אם נציג את הפרויקט, הפרטים האלה <strong>יוצגו</strong> באתר שלנו.
                    {creating ? null : ' שינויים שתעשו כאן יעדכנו גם את פרטי הפרויקט.'}
                  </React.Fragment>
                ),
              }}
            />
          </p>
          {picker}
          {!picked ? null : editProject ? (
            <EProjectFields
              showcase
              fields={form.fields}
              set={(k, v) => {
                form.set(k, v);
                clear(k);
              }}
              errors={{ ...form.errors, websiteUrl: form.errors.websiteUrl || errors.websiteUrl }}
              check={form.check}
            />
          ) : (
            <div className="devE-summary">
              <div className="devE-summaryBody">
                <span className="devE-summaryTitle" dir="auto">
                  {form.fields.name}
                  {form.fields.organization ? (
                    <span className="devE-summaryMeta"> · {form.fields.organization}</span>
                  ) : null}
                </span>
                {form.fields.description ? (
                  <span className="devE-summaryText" dir="auto">
                    {form.fields.description}
                  </span>
                ) : null}
                {form.fields.websiteUrl ? (
                  <bdi className="devE-summaryMeta" dir="ltr">
                    {websiteHost(form.fields.websiteUrl) || form.fields.websiteUrl}
                  </bdi>
                ) : null}
              </div>
              {editBtn(() => setEditProject(true))}
            </div>
          )}
        </section>

        {picked ? (
          <React.Fragment>
            {/* 3. More about the project (2026-11-08): the required category first, then every optional question, each
            marked Optional. Always open, since it holds a required field. */}
            <section className="devE-shareSection devE-shareMore" aria-labelledby="devEShareMore">
              <h3 id="devEShareMore">{tE('Tell us more about your project', 'ספרו לנו עוד על הפרויקט')}</h3>
              {/* Order and wording follow the live Powered by form (wiki: Powered by Sefaria Submission Form, Project
              Information), with the one required question first (2026-11-08). */}
              <div className="devE-shareMoreBody">
                <fieldset className="devE-choices" aria-describedby={errors.cats ? 'devEShareCats-error' : null}>
                  <legend>
                    {tE('What kind of project is it?', 'איזה סוג פרויקט זה?')}{' '}
                    <span className="devE-hintInline">{tE('Select all that apply.', 'בחרו את כל המתאימות.')}</span>
                  </legend>
                  {E_PB_CATEGORIES.map((c, i) => (
                    <Checkbox
                      key={i}
                      id={'devEShareCat' + i}
                      checked={cats.includes(c.en)}
                      onChange={() => {
                        toggle(cats, setCats, c.en);
                        clear('cats');
                      }}
                      label={<InterfaceText text={c} />}
                    />
                  ))}
                  <EFieldError id="devEShareCats-error" error={errors.cats} />
                </fieldset>
                <Input
                  id="devEShareSource"
                  inputDir="ltr"
                  label={tE('Link to source code', 'קישור לקוד המקור')}
                  labelAddon={EOpt}
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <fieldset className="devE-choices">
                  <legend>
                    {tE(
                      'Which Sefaria data or tools did you use for your project?',
                      'באילו נתונים או כלים של ספריא השתמשתם בפרויקט?'
                    )}{' '}
                    {EOpt}
                  </legend>
                  {E_PB_TOOLS.map((t, i) => (
                    <Checkbox
                      key={i}
                      id={'devEShareTool' + i}
                      checked={tools.includes(t.value)}
                      onChange={() => toggle(tools, setTools, t.value)}
                      label={
                        <span dir="ltr">
                          {t.label}
                          {t.url ? (
                            <React.Fragment>
                              {' '}
                              <a
                                className="devE-inlineLink devE-toolLink"
                                href={t.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t.label + ' (opens in a new tab)'}
                              >
                                <ExternalIcon />
                              </a>
                            </React.Fragment>
                          ) : null}
                        </span>
                      }
                    />
                  ))}
                </fieldset>
                <Input
                  id="devEShareTech"
                  dir="auto"
                  labelAddon={EOpt}
                  label={tE(
                    'Which non-Sefaria technologies or tools did you use for your project?',
                    'באילו טכנולוגיות או כלים שאינם של ספריא השתמשתם בפרויקט?'
                  )}
                  placeholder={vE('e.g. React, Python, Claude', 'לדוגמה: React, Python, Claude')}
                  value={otherTech}
                  onChange={(e) => setOtherTech(e.target.value)}
                />
                <Input
                  id="devEShareInspired"
                  multiline
                  rows={3}
                  dir="auto"
                  labelAddon={EOpt}
                  label={tE(
                    'What inspired you to build this tool? What use case were you solving for?',
                    'מה נתן לכם השראה לבנות את הכלי הזה? איזה צורך רציתם לפתור?'
                  )}
                  value={inspired}
                  onChange={(e) => setInspired(e.target.value)}
                />
                <fieldset className="devE-choices">
                  <legend>
                    {tE('Was this project vibe-coded?', 'האם הפרויקט נבנה ב־vibe coding?')} {EOpt}
                  </legend>
                  {[
                    { v: 'yes', en: 'Yes', he: 'כן' },
                    { v: 'no', en: 'No', he: 'לא' },
                  ].map((o) => (
                    <label key={o.v} className="devE-radio">
                      <input
                        type="radio"
                        name="devEShareAi"
                        checked={builtWithAi === o.v}
                        onChange={() => setBuiltWithAi(o.v)}
                      />
                      <InterfaceText text={{ en: o.en, he: o.he }} />
                    </label>
                  ))}
                </fieldset>
                <fieldset className="devE-choices">
                  <legend>
                    {tE(
                      'Approximately how many users use this project on a monthly basis?',
                      'בערך כמה אנשים משתמשים בפרויקט בחודש?'
                    )}{' '}
                    {EOpt}
                  </legend>
                  {E_PB_USERS.map((o) => (
                    <label key={o.v} className="devE-radio">
                      <input
                        type="radio"
                        name="devEShareUsers"
                        checked={users === o.v}
                        onChange={() => setUsers(o.v)}
                      />
                      <InterfaceText text={{ en: o.en, he: o.he }} />
                    </label>
                  ))}
                  {users === 'other' ? (
                    <Input
                      id="devEShareUsersOther"
                      dir="auto"
                      label={tE('How many?', 'כמה?')}
                      value={usersOther}
                      onChange={(e) => setUsersOther(e.target.value)}
                    />
                  ) : null}
                </fieldset>
                <Input
                  id="devEShareElse"
                  multiline
                  rows={3}
                  dir="auto"
                  labelAddon={EOpt}
                  label={tE('Anything else you would like to add?', 'יש עוד משהו שתרצו להוסיף?')}
                  value={anythingElse}
                  onChange={(e) => setAnythingElse(e.target.value)}
                />
              </div>
            </section>

            {/* Support Sefaria (Sarah, 2026-11-08): the logo is encouraged, not required, so nothing here blocks submitting.
            Points to the name-and-logo guidelines and asks for a donation link. Copy is a first draft for Sarah. */}
            <section className="devE-shareSection" aria-labelledby="devEShareLogo">
              <h3 id="devEShareLogo">
                {tE('Support Sefaria', 'תמכו בספריא')} {EOpt}
              </h3>
              <p className="devE-shareNote">
                {tE(
                  'We’re grateful you’re using our resources to share Torah.',
                  'תודה שאתם משתמשים במשאבים שלנו כדי להפיץ תורה.'
                )}
              </p>
              <p className="devE-shareNote">
                <InterfaceText
                  text={{
                    en: (
                      <React.Fragment>
                        We encourage you to add the Powered by Sefaria logo to your project. See our{' '}
                        <a
                          className="devE-inlineLink"
                          href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          copyright and trademark guidelines
                        </a>
                        .
                      </React.Fragment>
                    ),
                    he: (
                      <React.Fragment>
                        נשמח אם תוסיפו לפרויקט את הלוגו Powered by Sefaria. ראו את{' '}
                        <a
                          className="devE-inlineLink"
                          href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ההנחיות לזכויות יוצרים וסימני מסחר
                        </a>
                        .
                      </React.Fragment>
                    ),
                  }}
                />
              </p>
              <p className="devE-shareNote">
                <InterfaceText
                  text={{
                    en: (
                      <React.Fragment>
                        Help us keep Sefaria free for everyone by adding a{' '}
                        <DonateLink classes="devE-inlineLink" source="DeveloperSettingsPublish">
                          donation link
                        </DonateLink>{' '}
                        to your project.
                      </React.Fragment>
                    ),
                    he: (
                      <React.Fragment>
                        עזרו לנו לשמור על ספריא חינמית לכולם בהוספת{' '}
                        <DonateLink classes="devE-inlineLink" source="DeveloperSettingsPublish">
                          קישור לתרומה
                        </DonateLink>{' '}
                        לפרויקט שלכם.
                      </React.Fragment>
                    ),
                  }}
                />
              </p>
              <fieldset className="devE-choices">
                <legend className="sr-only">{tE('What have you added to your project?', 'מה הוספתם לפרויקט?')}</legend>
                <Checkbox
                  id="devEShareLogoYes"
                  checked={logo === 'yes'}
                  onChange={(e) => setLogo(e.target.checked ? 'yes' : '')}
                  label={tE("I've added the Powered by Sefaria logo", 'הוספתי את הלוגו Powered by Sefaria')}
                />
                <Checkbox
                  id="devEShareDonate"
                  checked={donateLink}
                  onChange={(e) => setDonateLink(e.target.checked)}
                  label={tE("I've added a link to donate to Sefaria", 'הוספתי קישור לתרומה לספריא')}
                />
              </fieldset>
            </section>

            {/* The developer community panel right before submitting (2026-11-08), as in About you. The newsletter box
            starts from the profile and saves back to it (field review sheet: Elise and Genevieve want it here). */}
            <ECommunity
              id="devEShareNews"
              checked={!!person.developerNews}
              onChange={(v) => setP('developerNews', v)}
            />
          </React.Fragment>
        ) : null}

        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onBack}>
            {tE('Cancel', 'ביטול')}
          </button>
          {picked ? (
            <EPrimary data-agent-action="share-project" disabled={busy}>
              {creating
                ? tE('Create project + submit', 'יצירת פרויקט + שליחה')
                : tE('Submit for review', 'שליחה לבדיקה')}
            </EPrimary>
          ) : null}
        </div>
      </form>
    </EStep>
  );
};

/* The Powered by page reached from its own link (D43, D58): a project has to exist first, so the page starts with a
   choice of project, including "Create a new project", which runs the new-project steps and comes back here. */
const E_NEW_PROJECT = '__new__';
/* Read when the script loads: the app rewrites the address without the query once it starts. */
const E_SHARE_LINK = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('share');
/* "Continue to Developer Settings" on the email-confirmed page adds ?continue, so setup picks up at About you
   instead of the welcome screen. */
const E_CONTINUE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('continue');
/* "+ Create a new project" only shows while the account can add one: under the project limit (2026-11-08). */
const EProjectPicker = ({ projects, value, onPick, canAddNew = true }) => (
  <Select
    id="devESharePick"
    value={value || ''}
    onChange={onPick}
    label={tE('Which project do you want to publish?', 'איזה פרויקט תרצו לפרסם?')}
    placeholder={{ en: 'Choose a project', he: 'בחרו פרויקט' }}
    options={[
      ...projects.map((p) => ({ value: p.id, label: { en: p.name, he: p.name } })),
      ...(canAddNew
        ? [{ value: E_NEW_PROJECT, label: { en: '+ Create a new project', he: '+ יצירת פרויקט חדש' } }]
        : []),
    ]}
  />
);

const EHome = ({
  state,
  run,
  notice,
  setNotice,
  connectedMessage,
  freshKeyId,
  freshKeyValue,
  freshProjectId,
  open,
}) => {
  const isPhone = useEIsPhone();
  const [needSite, setNeedSite] = useState(null); // the project whose key someone tried to limit before it had a website
  const [confirmDel, setConfirmDel] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const [shownIds, setShownIds] = useState([]); // keys shown in full; every key starts hidden
  /* Key values live only here, in memory, and only once asked for: the page loads with each key's display prefix,
     and Show or Copy fetches that one key's value (Daniel's key reveal, #4003; kept 2026-11-15). Hiding a key forgets
     its value, and Copy keeps nothing. A key just created arrives with its value, so its first Show or Copy needs no
     request. */
  /* A key just added scrolls into view (Penina, 2026-11-15), smoothly unless the visitor asks for reduced motion. */
  useEffect(() => {
    if (!freshKeyId) {
      return;
    }
    // After the page's own scroll to the top when the home screen opens, which runs later in the same commit.
    const timer = setTimeout(() => {
      const row = document.querySelector('.devE-keyRowT.is-new');
      if (row && row.scrollIntoView) {
        const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [freshKeyId]);
  const [keyValues, setKeyValues] = useState(() =>
    freshKeyValue && freshKeyId ? { [freshKeyId]: freshKeyValue } : {}
  );
  const valueOf = (id, keep) =>
    keyValues[id]
      ? Promise.resolve(keyValues[id])
      : revealKey(id).then((v) => {
          if (keep) {
            setKeyValues((m) => ({ ...m, [id]: v }));
          }
          return v;
        });
  const toggleShown = (id) => {
    if (shownIds.includes(id)) {
      setShownIds((ids) => ids.filter((x) => x !== id));
      setKeyValues((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      return;
    }
    // No error copy if the fetch fails: the key just stays hidden (Daniel, 2026-11-15).
    valueOf(id, true).then(
      () => setShownIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
      () => {}
    );
  };
  const profile = state.profile || {};
  const emails = [accountEmail(), profile.additionalEmail].filter(Boolean);
  const canCreate = accountVerified(state);
  const maxProjects = state.maxProjects || 10;
  const atProjectLimit = state.projects.length >= maxProjects;
  /* At the limit: a tooltip on the New project button on desktop, a line under the section's header row on phones,
     which have no tooltips (Penina, 2026-11-15); the confirm-your-email reason shows the same way. It goes away once a
     project is deleted. */
  const projectLimitText = tE(
    <React.Fragment>
      You have reached the maximum of {maxProjects} projects. To add another project, delete one no longer in use or
      email{' '}
      <a className="devE-inlineLink" href="mailto:developers@sefaria.org">
        developers@sefaria.org
      </a>
      .
    </React.Fragment>,
    <React.Fragment>
      הגעתם למספר המרבי של {maxProjects} פרויקטים. כדי להוסיף עוד פרויקט, מחקו פרויקט שאינו בשימוש או כתבו ל־
      <a className="devE-inlineLink" href="mailto:developers@sefaria.org">
        developers@sefaria.org
      </a>
      .
    </React.Fragment>
  );
  const keyLimitText = tE(
    'You have reached the maximum of ' +
      (state.maxKeysPerProject || 5) +
      ' keys for this project. To add another key, delete one no longer in use.',
    'הגעתם למספר המרבי של ' +
      (state.maxKeysPerProject || 5) +
      ' מפתחות לפרויקט הזה. כדי להוסיף מפתח נוסף, מחקו מפתח שאינו בשימוש.'
  );
  const removeKey = (apiKey) =>
    run(deleteKey(apiKey.id)).then(
      () => {
        /* No confirmation message: the row disappearing is the confirmation (Penina, 2026-11-15). */
        setConfirmDel(null);
      },
      () => {}
    );
  return (
    <div className="devE-home">
      {connectedMessage ? (
        <div className="devPocSuccess" role="status">
          <p>{connectedMessage}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="devE-toast devE-toastWarn" role="alert">
          <img className="devE-toastIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
          <span className="devE-toastText">{notice}</span>
          <button type="button" className="devE-textBtn" onClick={() => setNotice('')}>
            {tE('Dismiss', 'סגירה')}
          </button>
        </div>
      ) : null}
      {confirmDel ? (
        <EDeleteKeyDialog
          apiKey={confirmDel}
          onDelete={() => removeKey(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      ) : null}
      {needSite ? (
        <ELimitKeyDialog
          project={needSite.project}
          apiKey={needSite.apiKey}
          run={run}
          onCancel={() => setNeedSite(null)}
          onDone={() => setNeedSite(null)}
        />
      ) : null}{' '}
      {/* no message: the switch turning on says it (Penina, 2026-11-05) */}
      {!canCreate ? <EReconfirmBanner sentAt={state.confirmationSentAt} run={run} /> : null}
      {/* The profile as a card (option B, Penina 2026-11-05): the site's ProfilePic (photo, else initials), name over
          email(s), and Edit profile, which opens the setup's About you step on its own. */}
      <div className="devE-note devE-profileCard">
        <ProfilePic url={Sefaria.profile_pic_url} name={accountName() || profile.developerName} len={32} />
        <span className="devE-profileWho">
          <span className="devE-profileName" dir="auto">
            {accountName() || profile.developerName}
          </span>
          <span className="devE-profileEmail">
            {emails.map((e, i) => (
              <React.Fragment key={e}>
                {i ? ', ' : null}
                <bdi dir="ltr">{e}</bdi>
              </React.Fragment>
            ))}
          </span>
        </span>
        <button
          type="button"
          className="devE-quiet"
          data-agent-action="edit-profile"
          onClick={() => open({ screen: 'profile' })}
        >
          <EPencilIcon />
          {/* On phones only the pencil shows; the words stay for screen readers (s2.css). */}
          <span className="devE-profileEditLabel">{tE('Edit profile', 'עריכת פרופיל')}</span>
        </button>
      </div>
      {/* The section header, then one block per project. */}
      <div className="devE-sectionHead">
        <div>
          <h2 className="devE-h">{tE('Projects and API keys', 'פרויקטים ומפתחות API')}</h2>
        </div>
        {state.projects.length ? (
          /* At the project limit (10 per account, raisable by staff) the button stays, disabled, and its tooltip
             says why. aria-disabled rather than disabled, so it can still be hovered and focused to read that. */
          <ETipWrap>
            <button
              type="button"
              className="devE-pill"
              data-agent-action="new-project"
              aria-disabled={atProjectLimit || !canCreate ? 'true' : null}
              aria-describedby={atProjectLimit || !canCreate ? 'devEProjLimitTip' : null}
              onClick={() => {
                if (!atProjectLimit && canCreate) {
                  open({ screen: 'newproj' });
                }
              }}
            >
              <EPlusIcon />
              {tE('New project', 'פרויקט חדש')}
            </button>
            {!canCreate && !isPhone ? (
              <span className="devPocPopover devE-tip" id="devEProjLimitTip" role="tooltip">
                {E_CONFIRM_TIP()}
              </span>
            ) : atProjectLimit && !isPhone ? (
              <span className="devPocPopover devE-tip" id="devEProjLimitTip" role="tooltip">
                {/* The address is a link, so the tip stays open while the pointer is on it (s2.css). */}
                {projectLimitText}
              </span>
            ) : null}
          </ETipWrap>
        ) : null}
      </div>
      {/* Phones have no tooltips: why New project is off shows as a line under the header row instead. */}
      {isPhone && state.projects.length > 0 && (!canCreate || atProjectLimit) ? (
        <p className="devE-limitNote" id="devEProjLimitTip">
          {!canCreate ? E_CONFIRM_TIP() : projectLimitText}
        </p>
      ) : null}
      {/* No projects yet: the key table's columns, with its body asking for the first project. */}
      {!state.projects.length ? (
        <div className="devE-board">
          <table className="devE-table">
            <EKeyColumns id="empty" />
            <tbody>
              <tr className="devE-emptyTableRow">
                <td colSpan={5}>
                  <div className="devE-emptyState">
                    <h3>{tE('No projects or keys yet', 'אין עדיין פרויקטים או מפתחות')}</h3>
                    <p>
                      {tE(
                        'Create a project, then add an API key to it. Your projects and keys will show up here.',
                        'צרו פרויקט ואז הוסיפו לו מפתח API. הפרויקטים והמפתחות שלכם יופיעו כאן.'
                      )}
                    </p>
                    <ETipWrap>
                      <button
                        type="button"
                        className="devE-pill"
                        data-agent-action="new-project"
                        aria-disabled={!canCreate ? 'true' : null}
                        aria-describedby={!canCreate ? 'devEFirstProjTip' : null}
                        onClick={() => {
                          if (canCreate) {
                            open({ screen: 'firstkey' });
                          }
                        }}
                      >
                        {tE('Create a project', 'יצירת פרויקט')}
                      </button>
                      {!canCreate && !isPhone ? (
                        <span className="devPocPopover devE-tip" id="devEFirstProjTip" role="tooltip">
                          {E_CONFIRM_TIP()}
                        </span>
                      ) : null}
                    </ETipWrap>
                    {!canCreate && isPhone ? (
                      <p className="devE-btnNote" id="devEFirstProjTip">
                        {E_CONFIRM_TIP()}
                      </p>
                    ) : null}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {/* Each project: its details and actions above, then a table of only its keys, so every column
          head describes what's under it (2026-11-01). */}
      <div className="devE-projects">
        {state.projects.map((project, index) => {
          const host = websiteHost(project.websiteUrl);
          const atLimit = project.keys.length >= (state.maxKeysPerProject || 5);
          return (
            <section
              key={project.id}
              className={'devE-project' + (project.id === freshProjectId ? ' is-new' : '')}
              aria-labelledby={'devEProj-' + project.id}
              ref={
                project.id === freshProjectId
                  ? (el) => {
                      if (el && !el.dataset.shown) {
                        el.dataset.shown = '1';
                        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      }
                    }
                  : null
              }
            >
              <div className="devE-projHead">
                <div className="devE-projInfo">
                  <h3 className="devE-projName" id={'devEProj-' + project.id}>
                    <bdi dir="auto">{project.name}</bdi>
                    {project.organization ? (
                      <span className="devE-org">
                        {' '}
                        · <bdi dir="auto">{project.organization}</bdi>
                      </span>
                    ) : null}
                  </h3>
                  {project.description ? (
                    <span className="devE-desc" dir="auto">
                      {project.description}
                    </span>
                  ) : null}
                  {/* Phones: the website shows under the description; the rest of the project's actions are in the ⋮ menu
                      (Penina, 2026-11-15, option B). */}
                  {isPhone && host ? (
                    <a
                      className="devE-siteLink devE-phoneOnly"
                      href={project.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={vE(host + ' (opens in a new tab)', host + ' (נפתח בכרטיסייה חדשה)')}
                    >
                      <bdi dir="ltr">{host}</bdi>
                      <ExternalIcon />
                    </a>
                  ) : null}
                </div>
                {isPhone ? (
                  <div className="devE-projMenuWrap devE-phoneOnly">
                    <DropdownMenu
                      positioningClass="devE-projMenu"
                      buttonComponent={
                        <button
                          type="button"
                          className="devE-ico devE-projMenuBtn"
                          aria-label={vE('More for ' + project.name, 'אפשרויות נוספות ל־' + project.name)}
                        >
                          <EKebabIcon />
                        </button>
                      }
                    >
                      <DropdownMenuItemWithCallback onClick={() => open({ screen: 'editproj', projectId: project.id })}>
                        <span className="devE-projMenuItem">
                          <EPencilIcon />
                          {tE('Edit project details', 'עריכת פרטים')}
                        </span>
                      </DropdownMenuItemWithCallback>
                      {host ? null : (
                        <DropdownMenuItemWithCallback onClick={() => setNeedSite({ project })}>
                          <span className="devE-projMenuItem">
                            <EPlusIcon />
                            {tE('Add website', 'הוספת אתר')}
                          </span>
                        </DropdownMenuItemWithCallback>
                      )}
                      {project.visibility === 'public' ? (
                        <div className="interfaceLinks-option int-bi dropdownItem devE-projMenuDone">
                          <span className="devE-projMenuItem">
                            <ECheckIcon />
                            {tE('Submitted for review', 'נשלח לבדיקה')}
                          </span>
                        </div>
                      ) : (
                        <DropdownMenuItemWithCallback onClick={() => open({ screen: 'share', projectId: project.id })}>
                          <span className="devE-projMenuItem">
                            <EPublishIcon />
                            {tE('Publish project', 'פרסום הפרויקט')}
                          </span>
                        </DropdownMenuItemWithCallback>
                      )}
                    </DropdownMenu>
                  </div>
                ) : null}
                <div className="devE-projSide">
                  <div className="devE-actions">
                    <button
                      type="button"
                      className="devE-quiet"
                      data-agent-action="edit-project"
                      onClick={() => open({ screen: 'editproj', projectId: project.id })}
                    >
                      <EPencilIcon />
                      {tE('Edit project details', 'עריכת פרטים')}
                    </button>
                    <ETipWrap>
                      {/* Disabled at the key limit or while the email needs confirming, with a tooltip saying which, the same
                        way as New project at the project limit (2026-11-05). aria-disabled so it can be hovered and focused. */}
                      <button
                        type="button"
                        className="devE-pill"
                        data-agent-action="new-key"
                        aria-disabled={!canCreate || atLimit ? 'true' : null}
                        aria-describedby={!canCreate || atLimit ? 'devEKeyTip-' + project.id : null}
                        onClick={() => {
                          if (canCreate && !atLimit) {
                            open({ screen: 'newkey', projectId: project.id });
                          }
                        }}
                      >
                        <EPlusIcon />
                        {tE('Add key', 'הוספת מפתח')}
                      </button>
                      {(!canCreate || atLimit) && !isPhone ? (
                        <span className="devPocPopover devE-tip" id={'devEKeyTip-' + project.id} role="tooltip">
                          {!canCreate ? E_CONFIRM_TIP() : keyLimitText}
                        </span>
                      ) : null}
                    </ETipWrap>
                    {/* Phones have no tooltips: the reason shows as a line under the button. */}
                    {(!canCreate || atLimit) && isPhone ? (
                      <p className="devE-btnNote" id={'devEKeyTip-' + project.id}>
                        {!canCreate ? E_CONFIRM_TIP() : keyLimitText}
                      </p>
                    ) : null}
                  </div>
                </div>
                {/* Website and Share chips on the left, the usage line all the way on the right, in one row
                    under the name and buttons (2026-11-08). */}
                <div className="devE-projExtras">
                  {/* The project's two optional extras, as chips: a button until done, then a quiet fact. */}
                  <span className="devE-chips">
                    {/* Idea G (2026-11-08): once added, the website is a link that opens the site, styled as a link (underline,
                        external icon), so it reads as "go to your site", not as another button beside Publish project. */}
                    {host ? (
                      <a
                        className="devE-siteLink"
                        href={project.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={vE(host + ' (opens in a new tab)', host + ' (נפתח בכרטיסייה חדשה)')}
                      >
                        <bdi dir="ltr">{host}</bdi>
                        <ExternalIcon />
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="devE-chip"
                        data-agent-action="add-website"
                        onClick={() => setNeedSite({ project })}
                      >
                        <EPlusIcon />
                        {tE('Add website', 'הוספת אתר')}
                      </button>
                    )}
                    {project.visibility === 'public' ? (
                      <span className="devE-chip devE-chipDone">
                        <ECheckIcon />
                        {tE('Submitted for review', 'נשלח לבדיקה')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="devE-chip"
                        onClick={() => open({ screen: 'share', projectId: project.id })}
                      >
                        <EPublishIcon />
                        {tE('Publish project', 'פרסום הפרויקט')}
                      </button>
                    )}
                  </span>
                </div>
              </div>
              {/* A project with no keys shows only its header, no empty table (2026-11-05). */}
              {project.keys.length ? (
                <div className="devE-board">
                  <table className="devE-table" aria-labelledby={'devEProj-' + project.id}>
                    <EKeyColumns id={project.id} />
                    <tbody>
                      {project.keys.map((apiKey) => (
                        <tr key={apiKey.id} className={'devE-keyRowT' + (apiKey.id === freshKeyId ? ' is-new' : '')}>
                          <td data-l={vE('Name', 'שם')} dir="auto">
                            <EKeyName name={apiKey.label} />
                            {/* Narrow desktop tables fold the Created column into this caption (s2.css). */}
                            <span className="devE-keyDateSub" aria-hidden="true">
                              {tE('Created ', 'נוצר ')}
                              <span className="devE-nowrap">{formatDate(apiKey.created)}</span>
                            </span>
                          </td>
                          <td data-l={vE('Key', 'מפתח')}>
                            <span
                              className={
                                'devE-keyCell' +
                                (shownIds.includes(apiKey.id) && keyValues[apiKey.id] ? ' is-shown' : '')
                              }
                            >
                              <code className="devE-keyText" dir="ltr">
                                {shownIds.includes(apiKey.id) && keyValues[apiKey.id]
                                  ? keyValues[apiKey.id]
                                  : apiKey.prefix + '••••'}
                              </code>
                              {/* Show or hide the whole key: the eye from the sign-in password field. */}
                              {/* ARIA labels "Show key, [name]" / "Hide key, [name]" / "Copy key, [name]" (action first, then which key; Penina,
                                2026-11-09), no tooltips. The label changes
                                with the state, so the button has no aria-pressed. */}
                              <button
                                type="button"
                                className="devE-ico"
                                aria-label={
                                  shownIds.includes(apiKey.id)
                                    ? vE('Hide key, ' + apiKey.label, 'הסתרת המפתח, ' + apiKey.label)
                                    : vE('Show key, ' + apiKey.label, 'הצגת המפתח, ' + apiKey.label)
                                }
                                onClick={() => toggleShown(apiKey.id)}
                              >
                                <span
                                  className={'devE-eye' + (shownIds.includes(apiKey.id) ? ' is-off' : '')}
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                className={'devE-ico' + (copiedId === apiKey.id ? ' is-copied' : '')}
                                aria-label={vE('Copy key, ' + apiKey.label, 'העתקת המפתח, ' + apiKey.label)}
                                onClick={() =>
                                  /* A key already shown is on the page: copy it inside the tap (needed on http, e.g. a
                                     phone on the local network). Otherwise fetch it first. */
                                  (keyValues[apiKey.id]
                                    ? (fn, done, failed) => eCopy(keyValues[apiKey.id], done, failed)
                                    : eCopyFetched)(
                                    () => valueOf(apiKey.id),
                                    () => {
                                      setCopiedId(apiKey.id);
                                      // The copy-check icon stays 8 seconds (Penina, 2026-11-15); a new copy restarts it.
                                      clearTimeout(copiedTimer.current);
                                      copiedTimer.current = setTimeout(() => setCopiedId(null), 8000);
                                    },
                                    /* The browser refused: show the key, so it can be copied by hand. */
                                    () => {
                                      if (!shownIds.includes(apiKey.id)) {
                                        toggleShown(apiKey.id);
                                      }
                                    }
                                  )
                                }
                              >
                                {copiedId === apiKey.id ? <ECopyCheckIcon /> : <ECopyIcon />}
                              </button>
                              <span className="devE-keyCopied sr-only" aria-live="polite">
                                {copiedId === apiKey.id ? tE('Copied', 'הועתק') : null}
                              </span>
                            </span>
                          </td>
                          <td data-l={vE('Created', 'נוצר')}>{formatDate(apiKey.created)}</td>
                          <td data-l={vE('Limit to website', 'הגבלה לאתר')}>
                            {/* Without a website the switch stays off; turning it on asks for the website first. */}
                            <span className="devE-tog">
                              <span className="sr-only" id={'devERes-' + apiKey.id + '-label'}>
                                {/* One label with or without a website (Penina, 2026-11-15). */}
                                {vE(
                                  'Limit ' + apiKey.label + ' to your website',
                                  'הגבלת ' + apiKey.label + ' לאתר שלכם'
                                )}
                              </span>
                              <ToggleSwitch
                                name={'devERes-' + apiKey.id}
                                isChecked={!!host && !!apiKey.restrictToWebsite}
                                onChange={(e) =>
                                  host
                                    ? run(setKeyRestriction(apiKey.id, e.target.checked)).catch(() => {})
                                    : setNeedSite({ project, apiKey })
                                }
                              />
                            </span>
                            {/* Phone cards have no column header, so no ? beside "Limit to website": Learn more sits
                                directly under it instead (Penina, 2026-11-15). Hidden at desktop widths (s2.css). */}
                            <a
                              className="devE-inlineLink devE-limitLearn"
                              href={E_SITE_LEARN_MORE_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {tE('Learn more', 'מידע נוסף')}
                            </a>
                          </td>
                          <td className="devE-end">
                            <button
                              type="button"
                              className="devE-ico devE-icoDanger"
                              aria-label={vE('Delete key, ' + apiKey.label, 'מחיקת המפתח, ' + apiKey.label)}
                              aria-haspopup="dialog"
                              onClick={() => setConfirmDel(apiKey)}
                            >
                              <ETrashIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

/* Developer Settings, trial E: decides which step or screen shows from the server state plus
   where this visit is in the flow. */
/* The settings page scrolls inside its own panel, not the window. */
const eScrollTop = () => {
  if (typeof document === 'undefined') {
    return;
  }
  const scroller = document.querySelector('.settingsPage .content');
  if (scroller) {
    scroller.scrollTop = 0;
  }
  window.scrollTo(0, 0);
};

/* Rule 14: the account email changed (or lost confirmation) after setup. Everything stays and keeps working; only
   creating projects and keys waits. The whole confirmation happens in this banner, so the projects stay in view. */

const EReconfirmBanner = ({ sentAt, run }) => {
  const [sentHere, setSentHere] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!wait) {
      return;
    }
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const send = () =>
    run(sendConfirmation(), { quiet: true }).then(
      () => {
        setError('');
        setSentHere(true);
        setWait(60);
      },
      (err) => {
        if (sentAt && !/today/.test(err.message || '')) {
          setError('');
          setSentHere(true);
          setWait(60);
        } else {
          setError(eMessage(err));
        }
      }
    );
  const email = (
    <bdi dir="ltr" className="devE-noWrap">
      <strong>{accountEmail()}</strong>
    </bdi>
  );
  /* Mirrors setup: a link older than 3 days has expired, so the banner goes back to asking for one. */
  const sent = sentHere || eLinkLive(sentAt);
  return (
    /* The design system's AnnouncementBanner, Warning variant (Figma Components library), without its close button:
       this notice goes away only once the email is confirmed. */
    <div
      className="devE-banner"
      role="region"
      aria-label={vE('Confirm your new email address', 'אישור כתובת הדוא״ל החדשה')}
    >
      <div className="devE-bannerContent">
        <span className="devE-bannerIcon" aria-hidden="true">
          <EMailIcon />
        </span>
        <div className="devE-bannerText" aria-live="polite">
          {sent ? (
            <React.Fragment>
              <p className="devE-bannerTitle">{tE('Check your email', 'בדקו את תיבת הדוא״ל')}</p>
              <p>
                <InterfaceText
                  text={{
                    en: <React.Fragment>We sent a confirmation link to {email}.</React.Fragment>,
                    he: <React.Fragment>שלחנו קישור אישור לכתובת {email}.</React.Fragment>,
                  }}
                />
              </p>
              <p>
                {tE("Didn't get the email?", 'הדוא״ל לא הגיע?')}{' '}
                <button
                  type="button"
                  className="devE-inlineLink devE-linkBtn devE-resendLink"
                  data-agent-action="resend-confirmation"
                  disabled={!!wait}
                  onClick={send}
                >
                  {wait
                    ? vE('Resend in ' + wait + 's', 'שליחה חוזרת בעוד ' + wait + ' שנ׳')
                    : tE('Resend link', 'שליחה חוזרת')}
                </button>
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p className="devE-bannerTitle">{tE('Confirm your email address', 'אשרו את כתובת הדוא״ל')}</p>
              <p>
                {tE(
                  'To create new projects and keys, first confirm your email.',
                  'כדי ליצור פרויקטים ומפתחות חדשים, קודם צריך לאשר את כתובת הדוא״ל.'
                )}
              </p>
            </React.Fragment>
          )}
          {error ? (
            <p className="devE-errorText" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {sent ? null : (
        <div className="devE-bannerActions">
          <button type="button" className="devE-pill" data-agent-action="send-confirmation" onClick={send}>
            {tE('Send confirmation link', 'שליחת קישור לאישור')}
          </button>
        </div>
      )}
    </div>
  );
};

/* Kept outside the component: a request can re-mount it, and a link sent a moment ago must still
   show "Check your email". A reload starts a new visit. */
let eSentThisVisit = false;
let eStarted = E_CONTINUE;

const DeveloperE = ({ state, developerOn, run, notice, setNotice, connectedMessage, homeSignal }) => {
  const [view, setViewRaw] = useState(null); // {screen, projectId, keyId, inSetup}
  const setView = setViewRaw;
  const [freshKeyId, setFreshKeyId] = useState(null);
  const [freshKeyValue, setFreshKeyValue] = useState(null); // a new key's value, from its creation answer only
  /* A project made during this visit gets a short highlight when the projects page shows it, in place of a
     "saved" message (Penina, 2026-11-05). */
  const [freshProjectId, setFreshProjectId] = useState(null);
  const [sent, setSent] = useState(false);
  /* A link sent during this visit shows "Check your email" at once, before the state's sent time arrives. */
  const [sentThisVisit, setSentThisVisitState] = useState(eSentThisVisit);
  const setSentThisVisit = (v) => {
    eSentThisVisit = v;
    setSentThisVisitState(v);
  };
  const [resendWait, setResendWait] = useState(0);
  const [sendError, setSendError] = useState('');
  useEffect(() => {
    if (!resendWait) {
      return;
    }
    const t = setTimeout(() => setResendWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);
  /* Kept outside the component, like the sent flag: confirming the email re-mounts it, and setup should carry on
     to About you rather than show the welcome screen again. */
  const [started, setStartedState] = useState(eStarted);
  const setStarted = (v) => {
    eStarted = v;
    setStartedState(v);
  };

  /* Browser history (Penina, 2026-11-15): every full-screen step adds a history entry, so Back (the browser's, or a
     phone's back gesture) steps back through Developer Settings the way the steps' own back links do, on desktop and
     phones alike. The address stays the same. The loader, a sent form's result and a failed key's retry replace their
     entry instead, and going home goes back to the home entry, so Back from home then leaves the page. */
  const hist = useRef({ idx: 0, keys: [], popped: false, goingHome: false });
  const live = useRef({ view, started });
  live.current = { view, started };
  const histKey = (v, st) => JSON.stringify([v ? { ...v, keyFailure: undefined, keyLabel: undefined } : null, !!st]);
  const writeHistory = (method, idx, v, st) => {
    try {
      window.history[method](
        { ...(window.history.state || {}), devIdx: idx, devView: v, devStarted: !!st },
        '',
        window.location.href
      );
    } catch (e) {
      /* history unavailable (e.g. in some embedded views): steps still work, Back just leaves the page */
    }
  };
  useEffect(() => {
    hist.current.keys = [histKey(view, started)];
    writeHistory('replaceState', 0, view, started);
    const onPop = (e) => {
      const st = e.state || {};
      if (typeof st.devIdx !== 'number') {
        return; // an entry from before Developer Settings: the page is leaving
      }
      const h = hist.current;
      if (h.goingHome) {
        h.goingHome = false;
      }
      h.idx = st.devIdx;
      const nextView = st.devView || null;
      const nextStarted = !!st.devStarted;
      if (histKey(nextView, nextStarted) !== histKey(live.current.view, live.current.started)) {
        h.popped = true;
      }
      h.keys[h.idx] = histKey(nextView, nextStarted);
      unstable_batchedUpdates(() => {
        setViewRaw(nextView);
        setStarted(nextStarted);
      });
      eScrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const h = hist.current;
    const key = histKey(view, started);
    if (h.popped) {
      h.popped = false;
      return;
    }
    if (h.keys[h.idx] === key) {
      return;
    }
    if (!view) {
      /* Home: back to the nearest home entry below, if there is one. */
      let j = h.idx - 1;
      while (j >= 0 && h.keys[j] !== key) {
        j -= 1;
      }
      if (j >= 0) {
        h.goingHome = true;
        const steps = j - h.idx;
        h.idx = j;
        window.history.go(steps);
        return;
      }
      h.keys[h.idx] = key;
      writeHistory('replaceState', h.idx, view, started);
      return;
    }
    const prev = h.keys[h.idx] ? JSON.parse(h.keys[h.idx])[0] : null;
    const replace =
      view.screen === 'wait' ||
      view.screen === 'submitted' ||
      (prev && prev.screen === 'wait') ||
      (prev && prev.screen === 'share' && view.screen === 'share');
    if (replace) {
      h.keys[h.idx] = key;
      writeHistory('replaceState', h.idx, view, started);
      return;
    }
    h.idx += 1;
    h.keys = h.keys.slice(0, h.idx).concat(key);
    writeHistory('pushState', h.idx, view, started);
  }, [view, started]);
  useEffect(() => {
    if (!homeSignal) {
      return;
    }
    setView(null);
    setStarted(false);
    /* The tab switch added its own history entry: that entry is Developer Settings' home step. */
    hist.current = { idx: 0, keys: [histKey(null, false)], popped: false, goingHome: false };
    writeHistory('replaceState', 0, null, false);
  }, [homeSignal]);
  const [cancelled, setCancelled] = useState(false);
  /* The Developer Settings tab always leads to the main page (Penina, 2026-11-12): out of any step or screen, back to
     the home, or to the welcome screen while About you isn't saved yet. Unsaved answers are dropped. */

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  /* The Powered by page's own link (D43): /settings/developer?share. Once there's a profile, it opens the page with
     a project picker; before that, the usual setup runs first and ends on this page instead of the table. Logged
     out, the login page sends people back to this link. */
  useEffect(() => {
    if (E_SHARE_LINK && developerOn && state.profile) {
      setView({ screen: 'share', fromLink: true });
    }
  }, []);
  const verified = accountVerified(state);
  const needConfirm = !developerOn && !verified;
  /* Email sign-ups keep "Confirm your email" counted as step 1 after confirming, so About you reads "Step 2 of 4"
     (Penina, 2026-11-05). Google and Apple sign-ups skip it. */
  const confirmStep = !!(needConfirm || (view && view.withConfirm) || !state.ssoConnected);
  const stepLabels = [
    ...(confirmStep ? [{ en: 'Confirm email', he: 'אישור דוא״ל' }] : []),
    { en: 'About you', he: 'קצת עליך' },
    { en: 'Your project', he: 'הפרויקט שלך' },
    E_SHARE_LINK
      ? { en: 'Share your project', he: 'שיתוף הפרויקט' }
      : { en: 'Create your API key', he: 'צרו את מפתח ה־API שלכם' },
  ];
  const dotsOf = stepLabels.length;
  const dots = (step) => ({ at: step + (confirmStep ? 1 : 0), of: dotsOf, labels: stepLabels });
  const open = (next) => {
    setView(next);
    eScrollTop();
  };
  /* Room for one more project: under the limit and with a confirmed email, as for New project. */
  const canAddProject = state.projects.length < (state.maxProjects || 10) && accountVerified(state);
  const home = () => {
    setView(null);
    eScrollTop();
  };
  const projectById = (id) => state.projects.find((p) => p.id === id);

  /* Create a project (when given) and a key, keep the loader up long enough, then go to the table
     with the new key marked. */
  const createWithKey = (projectBody, label, inSetup, existingProjectId, keyOptions, afterKey) => {
    const keyView = view;
    const { restrict, websiteUrl } = keyOptions || {};
    const minimum = new Promise((resolve) => setTimeout(resolve, KEY_SETUP_MS));
    const projectReady = existingProjectId
      ? Promise.resolve(existingProjectId)
      : run(createProject(projectBody), { quiet: true }).then((data) => {
          setFreshProjectId(data.projectId);
          return data.projectId;
        });
    return projectReady.then((projectId) => {
      setView({ screen: 'wait', projectId, inSetup, withConfirm: confirmStep });
      /* A website typed in the key form is saved to the project first, so the key can be limited to it. */
      const project = projectById(projectId);
      const siteReady =
        websiteUrl && project
          ? run(
              updateProject(projectId, {
                name: project.name,
                description: project.description,
                organization: project.organization || '',
                websiteUrl,
                aiAssisted: !!project.aiAssisted,
                visibility: project.visibility || 'private',
              }),
              { quiet: true }
            )
          : Promise.resolve();
      const keyReady = siteReady
        .then(() => run(createKey(projectId, label), { quiet: true }))
        .then((data) => (restrict ? run(setKeyRestriction(data.keyId, true), { quiet: true }).then(() => data) : data));
      return Promise.all([keyReady, minimum]).then(
        ([data]) => {
          if (!mounted.current) {
            return;
          }
          setFreshKeyId(data.keyId);
          setFreshKeyValue(data.keyValue || null);
          if (afterKey) {
            afterKey();
            return;
          }
          home(); // no message: the new key's row shows it, tinted for a moment
        },
        (err) => {
          /* Back to the key form that was open, with the name typed and the reason it failed: the form itself was
             replaced by the waiting screen, so it can't show the error. */
          if (mounted.current) {
            setView({ ...keyView, keyFailure: keyFailure(err), keyLabel: label });
          }
        }
      );
    });
  };

  /* The developer links. Beside the title on wider screens; on phones they move to a "Resources" list at the bottom of
     the home, so the page starts with the banners and projects (Penina, 2026-11-08). */
  /* Publish a project first; every link has only a leading icon, no external arrow after it (Penina, 2026-11-08).
     The two that open another site say so to screen readers. */
  const resourceLinks = (
    <React.Fragment>
      <button
        type="button"
        className="devE-docsMinor devE-linkBtn"
        onClick={() => open({ screen: 'share', fromLink: true })}
      >
        <EPublishIcon size={12} />
        {tE('Publish a project', 'פרסום פרויקט')}
      </button>
      <a className="devE-docs" href={API_DOCS_URL} target="_blank" rel="noreferrer">
        <EBookIcon size={12} />
        {tE('Technical documentation', 'תיעוד טכני')}
        <span className="sr-only">{tE(' (opens in a new tab)', ' (נפתח בכרטיסייה חדשה)')}</span>
      </a>
      <a className="devE-docsMinor" href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">
        <EDownloadIcon size={12} />
        {tE('Download the library', 'הורדת הספרייה')}
        <span className="sr-only">{tE(' (opens in a new tab)', ' (נפתח בכרטיסייה חדשה)')}</span>
      </a>
    </React.Fragment>
  );
  const header = (
    <header className="devPocPageHeader devE-pageHeader">
      <h1>
        <InterfaceText text={{ en: 'Developer Settings', he: 'הגדרות מפתחים' }} />
      </h1>
      {/* D57 (2026-10-26): the library download is only a small link beside the API docs, never a callout. */}
      {developerOn && state.profile && !view ? <p className="devE-headLinks">{resourceLinks}</p> : null}
    </header>
  );
  let body;

  /* The welcome screen, until "Get started"; Cancel on About you comes back to it. */
  const linkLive = eLinkLive(state.confirmationSentAt);
  /* Every visit opens on the welcome screen, its steps including "Confirm your email". "Get started" goes to step 1,
     or straight to "Check your email" while a link sent earlier is still live. */
  if ((!developerOn || !state.profile) && !started) {
    body = (
      <EEntry
        withConfirm={needConfirm}
        share={E_SHARE_LINK}
        onStart={() => {
          setStarted(true);
          eScrollTop();
        }}
      />
    );
  } else if (needConfirm) {
    /* Modelled on common sign-up flows (Clerk, Notion, Linear, GitLab): once a link is out, the step
       number gives way to an inbox screen; resend is a quiet link with a short cooldown. */
    /* The server allows one email a minute. If a link went out moments ago (another tab, or a
       return visit), it refuses; that link is still good, so show "Check your email" anyway. */
    const sendLink = () =>
      run(sendConfirmation(), { quiet: true }).then(
        () => {
          setSendError('');
          setSentThisVisit(true);
          setSent(!!state.confirmationSentAt);
          setResendWait(60);
        },
        (err) => {
          /* The one-a-minute limit while a link is out: that link still works. Anything else (such as
         the five-a-day limit) is said right here, under the button. */
          if (state.confirmationSentAt && !/today/.test(err.message || '')) {
            setSendError('');
            setSentThisVisit(true);
            setResendWait(60);
          } else {
            setSendError(eMessage(err));
          }
        }
      );
    const sendErrorLine = sendError ? (
      <p className="devE-hint devE-hintCenter devE-errorText" role="alert">
        {sendError}
      </p>
    ) : null;
    const changeEmail = (
      <p className="devE-hint devE-hintCenter">
        <InterfaceText
          text={{
            en: (
              <React.Fragment>
                Wrong address?{' '}
                <a className="devE-inlineLink" href="/settings/account#username-change">
                  Change it in Account Settings
                </a>
              </React.Fragment>
            ),
            he: (
              <React.Fragment>
                הכתובת שגויה?{' '}
                <a className="devE-inlineLink" href="/settings/account#username-change">
                  שנו אותה בהגדרות החשבון
                </a>
              </React.Fragment>
            ),
          }}
        />
      </p>
    );
    /* Laid out like common "Check your email" screens: icon, title, the address on its own line, one
       action, then quiet links, with the way back last. */
    const emailLine = (
      <React.Fragment>
        <br />
        <bdi dir="ltr" className="devE-noWrap">
          <strong>{accountEmail()}</strong>
        </bdi>
      </React.Fragment>
    );
    /* Hebrew: "…קישור אישור לכתובת" ends the first line and the address sits on its own line (Daniel's
       preposition fix, taken by Penina 2026-11-16; replaces "לאישור ל־", which doubled the ל). */
    const emailLineHe = (
      <React.Fragment>
        <br />
        <bdi dir="ltr" className="devE-noWrap">
          <strong>{accountEmail()}</strong>
        </bdi>
      </React.Fragment>
    );
    const cancel = (
      <button
        type="button"
        className="devE-ghostBtn"
        onClick={() => {
          setStarted(false);
          setCancelled(true);
          eScrollTop();
        }}
      >
        <EArrowLeftIcon />
        {tE('Back to Developer Settings', 'חזרה להגדרות מפתחים')}
      </button>
    );
    const sendButton = (
      <button
        type="button"
        className="sefaria-common-button auth-primary fullwidth"
        data-agent-action="send-confirmation"
        onClick={sendLink}
      >
        {tE('Send confirmation link', 'שליחת קישור לאישור')}
      </button>
    );
    if (linkLive || (state.confirmationSentAt && sentThisVisit)) {
      /* While a link is live, Get started lands here; there's no way back from it until the link is confirmed or expires. */
      body = (
        <EStep
          icon={<EMailIcon size={24} />}
          title={tE('Check your email', 'בדקו את תיבת הדוא״ל')}
          lead={
            <p className="devE-lead devE-leadCenter">
              <InterfaceText
                text={{
                  en: <React.Fragment>We sent a confirmation link to{emailLine}</React.Fragment>,
                  he: <React.Fragment>שלחנו קישור אישור לכתובת{emailLineHe}</React.Fragment>,
                }}
              />
            </p>
          }
        >
          <div className="devE-form devE-formCenter">
            {/* Disabled with a countdown right after a send, then enabled (Clerk, Slack). */}
            <p className="devE-hint devE-hintCenter" aria-live="polite">
              {tE("Didn't get the email?", 'הדוא״ל לא הגיע?')}{' '}
              <button
                type="button"
                className="devE-inlineLink devE-linkBtn devE-resendLink"
                data-agent-action="resend-confirmation"
                disabled={!!resendWait}
                onClick={sendLink}
              >
                {resendWait
                  ? vE('Resend in ' + resendWait + 's', 'שליחה חוזרת בעוד ' + resendWait + ' שנ׳')
                  : tE('Resend link', 'שליחה חוזרת')}
              </button>
            </p>
            {sendErrorLine}
            {changeEmail}
          </div>
        </EStep>
      );
    } else {
      body = (
        <EStep
          dots={{ at: 0, of: dotsOf, labels: stepLabels }}
          icon="</>"
          title={tE('Confirm your email', 'אישור כתובת הדוא״ל')}
          lead={
            <p className="devE-lead devE-leadCenter">
              <InterfaceText
                text={{
                  en: <React.Fragment>We&apos;ll send a confirmation link to{emailLine}</React.Fragment>,
                  he: <React.Fragment>נשלח קישור אישור לכתובת{emailLineHe}</React.Fragment>,
                }}
              />
            </p>
          }
        >
          <div className="devE-form">
            {sendButton}
            {sendErrorLine}
            {changeEmail}
            {cancel}
          </div>
        </EStep>
      );
    }
  } else if (!developerOn || !state.profile) {
    /* Cancel before any profile exists goes back to the welcome screen; nothing is saved. */
    body = (
      <EWelcome
        dots={dots(0)}
        onCancel={() => {
          setStarted(false);
          setCancelled(true);
          eScrollTop();
        }}
        onSave={(profile) =>
          (developerOn ? Promise.resolve() : run(enableDeveloper(), { quiet: true }))
            .then(() => run(saveProfile(profile), { quiet: true }))
            .then(() => setView({ screen: 'setupProject', inSetup: true, withConfirm: confirmStep }))
        }
      />
    );
  } else if (view && view.screen === 'profile') {
    body = (
      <EWelcome
        edit
        initial={state.profile}
        onCancel={() => home()}
        onSave={(profile) => run(saveProfile(profile), { quiet: true }).then(() => home())}
      />
    );
  } else if (view && view.screen === 'setupProfile') {
    body = (
      <EWelcome
        dots={dots(0)}
        initial={state.profile}
        onSave={(profile) =>
          run(saveProfile(profile), { quiet: true }).then(() =>
            setView(
              view.projectId
                ? /* the project and key already exist: go forward to editing them, never to creating another */
                  {
                    screen: 'setupProjectEdit',
                    projectId: view.projectId,
                    inSetup: true,
                    withConfirm: view.withConfirm,
                  }
                : { screen: 'setupProject', inSetup: true, withConfirm: view.withConfirm }
            )
          )
        }
      />
    );
  } else if (view && view.screen === 'setupProjectEdit' && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    const back = () =>
      setView({ screen: 'setupProfile', projectId: project.id, inSetup: true, withConfirm: view.withConfirm });
    /* Back from the key step: the project exists, so this step edits it instead of creating another. */
    body = (
      <EEditProject
        project={project}
        dots={dots(1)}
        inSetup
        onBack={back}
        backLabel={tE('Back', 'חזרה')}
        onSave={(fields) =>
          run(updateProject(project.id, fields), { quiet: true }).then(() =>
            setView({
              screen: E_SHARE_LINK ? 'share' : 'setupKey',
              projectId: project.id,
              fromLink: E_SHARE_LINK,
              inSetup: true,
              withConfirm: view.withConfirm,
            })
          )
        }
      />
    );
  } else if (view && view.screen === 'setupProject') {
    body = (
      <ESetupProject
        dots={dots(1)}
        backLabel={tE('Back', 'חזרה')}
        onBack={() => setView({ screen: 'setupProfile', inSetup: true, withConfirm: view.withConfirm })}
        onSkip={() =>
          E_SHARE_LINK
            ? open({ screen: 'share', fromLink: true })
            : /* No message: the home's empty state already asks for a first project (Penina, 2026-11-12). */
              home()
        }
        onCreate={(projectBody) =>
          run(createProject(projectBody), { quiet: true })
            .then((data) => {
              setFreshProjectId(data.projectId);
              return data;
            })
            .then((data) =>
              setView(
                E_SHARE_LINK
                  ? /* from the Powered by link: no key step, straight to sharing */
                    {
                      screen: 'share',
                      projectId: data.projectId,
                      fromLink: true,
                      inSetup: true,
                      withConfirm: view.withConfirm,
                    }
                  : { screen: 'setupKey', projectId: data.projectId, inSetup: true, withConfirm: view.withConfirm }
              )
            )
        }
      />
    );
  } else if (view && view.screen === 'setupKey' && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = (
      <ESetupKey
        dots={dots(2)}
        project={project}
        failure={view.keyFailure}
        initialLabel={view.keyLabel}
        backLabel={tE('Back', 'חזרה')}
        onBack={() =>
          setView({ screen: 'setupProjectEdit', projectId: project.id, inSetup: true, withConfirm: view.withConfirm })
        }
        onSkip={() => (E_SHARE_LINK ? open({ screen: 'share', projectId: project.id, fromLink: true }) : home())}
        onCreate={(label, opts) =>
          createWithKey(
            null,
            label,
            true,
            project.id,
            opts,
            E_SHARE_LINK ? () => open({ screen: 'share', projectId: project.id, fromLink: true }) : null
          )
        }
      />
    );
  } else if ((view && view.screen === 'firstkey') || (view && view.screen === 'newproj')) {
    /* A new project from the table: the same two steps as setup (project, then a key that can be skipped),
       without step numbers. */
    const leave = () => home();
    body = (
      <ESetupProject
        title={tE('New project', 'פרויקט חדש')}
        onBack={leave}
        onSkip={leave}
        skipLabel={tE('Cancel', 'ביטול')}
        onCreate={(projectBody) =>
          run(createProject(projectBody), { quiet: true })
            .then((data) => {
              setFreshProjectId(data.projectId);
              return data;
            })
            .then((data) => setView({ screen: 'projectKey', projectId: data.projectId }))
        }
      />
    );
  } else if (view && view.screen === 'projectKey' && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = (
      <ESetupKey
        project={project}
        failure={view.keyFailure}
        initialLabel={view.keyLabel}
        onBack={() => home()}
        onSkip={() => home()}
        onCreate={(label, opts) => createWithKey(null, label, false, project.id, opts)}
      />
    );
  } else if (view && view.screen === 'newkey' && projectById(view.projectId)) {
    body = (
      <ENewKey
        project={projectById(view.projectId)}
        failure={view.keyFailure}
        initialLabel={view.keyLabel}
        onBack={() => home()}
        onCreate={(label, opts) => createWithKey(null, label, false, view.projectId, opts)}
      />
    );
  } else if (view && view.screen === 'wait') {
    body = <EWaiting dots={view.inSetup ? dots(2) : null} />;
  } else if (view && view.screen === 'share' && (projectById(view.projectId) || view.fromLink)) {
    const project = projectById(view.projectId) || null;
    body = (
      <EShareProject
        key="share"
        project={project}
        projects={state.projects}
        canAddNew={canAddProject}
        onPickProject={(id) => setView({ screen: 'share', projectId: id, fromLink: true })}
        profile={state.profile}
        dots={view.inSetup ? dots(2) : null}
        onBack={
          view.inSetup && project
            ? () =>
                setView({
                  screen: 'setupProjectEdit',
                  projectId: project.id,
                  inSetup: true,
                  withConfirm: view.withConfirm,
                })
            : () => home()
        }
        onSubmit={(profile, fields, isNew) =>
          run(saveProfile(profile), { quiet: true })
            .then(() =>
              isNew
                ? run(createProject(fields), { quiet: true }).then((data) => {
                    setFreshProjectId(data.projectId);
                    return data.projectId;
                  })
                : run(updateProject(project.id, fields), { quiet: true }).then(() => project.id)
            )
            .then((id) => setView({ screen: 'submitted', projectId: id }))
        }
      />
    );
  } else if (view && view.screen === 'submitted' && projectById(view.projectId)) {
    body = <ESubmitted project={projectById(view.projectId)} onDone={() => home()} />;
  } else if (view && view.screen === 'editproj' && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = (
      <EEditProject
        project={project}
        onBack={() => home()}
        focusField={view.focus}
        onSave={(fields) => run(updateProject(project.id, fields), { quiet: true }).then(() => home())}
        onDelete={() => run(deleteProject(project.id), { quiet: true }).then(() => home())}
      />
    );
  } else {
    body = (
      <EHome
        state={state}
        run={run}
        notice={notice}
        setNotice={setNotice}
        connectedMessage={connectedMessage}
        freshKeyId={freshKeyId}
        freshKeyValue={freshKeyValue}
        freshProjectId={freshProjectId}
        open={open}
      />
    );
  }

  const showResources = developerOn && state.profile && !view;
  return (
    <div className="devPocPage devE">
      {header}
      {body}
      {showResources ? (
        <section className="devE-resources" aria-labelledby="devEResourcesTitle">
          <h2 className="devE-resourcesTitle" id="devEResourcesTitle">
            {tE('Resources', 'משאבים')}
          </h2>
          <p className="devE-resourcesLinks">{resourceLinks}</p>
        </section>
      ) : null}
    </div>
  );
};

/* The confirmation email as the user would get it, in the interface language, for copy
   review. Its button is the emailed link, and opens in a new tab as a mail client would. */
/* ---- Account settings tab ---- */

/* The settings this page last showed or saved. ReaderApp leaves them out of browser history, so
   a page that Back or Forward brings back renders these, and API keys never reach history. */
const latestSettings = { account: undefined, developer: undefined };
const rememberAccountSettings = (changes) => {
  latestSettings.account = { ...latestSettings.account, ...changes };
};

/* Switching tabs or opening a project adds history entries, so Cancel steps back until it
   leaves settings. */
const SETTINGS_PATH = /^\/settings(\/|$)/;
const navigateBack = () => {
  if (window.history.length <= 2) {
    window.history.replaceState(null, null, '/texts');
    window.location.reload();
    return;
  }
  const onPop = () => {
    if (SETTINGS_PATH.test(window.location.pathname)) {
      window.history.back();
      return;
    }
    window.removeEventListener('popstate', onPop);
  };
  window.addEventListener('popstate', onPop);
  window.history.back();
};

/* Arrow keys move between the options of one toggle and pick the one they land on. */
const toggleKeyUp = (e) => {
  const sibling =
    e.keyCode === 39
      ? e.currentTarget.nextElementSibling
      : e.keyCode === 37
        ? e.currentTarget.previousElementSibling
        : null;
  if (sibling && sibling.classList.contains('toggleOption')) {
    sibling.focus();
    sibling.click();
  }
};

const SettingToggle = ({ optionClass, options, value, ariaLabel, onChange, children }) => (
  <div
    className={'toggleSet toggleSetToggleBox blueStyle ' + optionClass + ' control-elem'}
    role="radiogroup"
    aria-label={ariaLabel}
  >
    {options.map((option) => {
      const on = option.value === value;
      return (
        <div
          key={option.value}
          role="radio"
          data-name={option.name}
          data-value={option.value}
          className={'toggleOption' + (on ? ' on' : '')}
          tabIndex={on ? 0 : -1}
          aria-checked={on}
          onClick={() => onChange(option.value)}
          onKeyUp={toggleKeyUp}
        >
          {option.content}
        </div>
      );
    })}
    {children}
  </div>
);

const SettingSection = ({ id, label, children }) => (
  <div id={id} className="section">
    <label className="control-elem">{label}</label>
    {children}
  </div>
);

const LoginMethodText = ({ method, email }) => {
  const hebrew = Sefaria.interfaceLang === 'hebrew';
  return (
    <span className={hebrew ? 'int-he' : 'int-en'}>
      <span className="loginMethodText">{hebrew ? method.he : method.en}</span>{' '}
      <span className="loginMethodEmail">{email}</span>
    </span>
  );
};

const loginMethod = (socialProviders) => {
  const google = socialProviders.includes('google');
  const apple = socialProviders.includes('apple');
  if (google && apple) {
    return { en: 'Google & Apple Sign-In with', he: 'התחברות דרך גוגל ואפל עם' };
  }
  if (google) {
    return { en: 'Google Sign-In with', he: 'התחברות דרך גוגל עם' };
  }
  return { en: 'Apple Sign-In with', he: 'התחברות דרך אפל עם' };
};

/* The account endpoints answer JSON. A logged-out call to one that needs login is redirected by Django to the
   login page, which jQuery hands over as an HTML string with status 200: anything that is not a JSON object means
   the session ended. */
const isJsonAnswer = (data) => typeof data === 'object' && data !== null;

const AccountTab = ({ settings, socialProviders, onEmailChanged, onSessionEnded }) => {
  const torahSpecific = !!settings.torahSpecific;
  const translationLanguages = settings.translationLanguages || [];

  const [emailNotifications, setEmailNotifications] = useState(settings.emailNotifications);
  const [interfaceLanguage, setInterfaceLanguage] = useState(settings.interfaceLanguage);
  const [translationLanguage, setTranslationLanguage] = useState(settings.translationLanguagePreference);
  const [readingHistory, setReadingHistory] = useState(settings.readingHistory === false ? 'false' : 'true');
  const [textualCustom, setTextualCustom] = useState(settings.textualCustom);
  const [libraryAssistant, setLibraryAssistant] = useState(settings.libraryAssistantEnabled ? 'true' : 'false');
  /* The warning belongs to the moment the visitor picks Off, not to a setting that was already Off on load. */
  const [warnReadingHistory, setWarnReadingHistory] = useState(false);

  /* The values saving compares against. Textual custom moves to the saved value, because
     a second save should only re-fetch the calendars if it changed again. */
  const saved = useRef({
    interfaceLanguage: settings.interfaceLanguage,
    libraryAssistant: settings.libraryAssistantEnabled ? 'true' : 'false',
    translationLanguage: settings.translationLanguagePreference,
    textualCustom: settings.textualCustom,
  });

  const [email, setEmail] = useState(settings.email);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailFields, setEmailFields] = useState({ email: '', confirmEmail: '', confirmPassword: '' });
  const [emailError, setEmailError] = useState('');
  const [emailOk, setEmailOk] = useState('');

  const [gauthEmail, setGauthEmail] = useState((settings.sheetsExport && settings.sheetsExport.gauthEmail) || '');
  const [gauthError, setGauthError] = useState('');
  const [saveError, setSaveError] = useState('');

  const save = () => {
    setSaveError('');
    const transPref = translationLanguages.length ? translationLanguage : undefined;
    const profile = {
      settings: {
        email_notifications: emailNotifications,
        interface_language: torahSpecific ? interfaceLanguage : undefined,
        textual_custom: torahSpecific ? textualCustom : undefined,
        reading_history: torahSpecific ? readingHistory === 'true' : undefined,
        translation_language_preference: torahSpecific ? transPref : undefined,
        translation_language_preference_suggested: true,
      },
    };
    // Only send library_assistant when the toggle was actually changed. The toggle
    // renders the *effective* value, so submitting it unconditionally would persist
    // the setting for users whose profiles don't carry the key yet — and a profile
    // that has the key is skipped by the opt-out migration.
    if (libraryAssistant !== saved.current.libraryAssistant) {
      profile.settings.library_assistant = libraryAssistant === 'true';
    }
    // see trans pref in cookie in case user is logged out
    if (profile.settings.translation_language_preference !== undefined) {
      $.cookie('translation_language_preference', profile.settings.translation_language_preference, { path: '/' });
    }
    $.cookie('translation_language_preference_suggested', JSON.stringify(1), { path: '/' });
    $.post('/api/profile', { json: JSON.stringify(profile) }, (data) => {
      if (!isJsonAnswer(data)) {
        onSessionEnded();
        return;
      }
      if ('error' in data) {
        alert(data.error);
        return;
      }
      rememberAccountSettings({
        emailNotifications,
        libraryAssistantEnabled: libraryAssistant === 'true',
        ...(torahSpecific
          ? {
              interfaceLanguage,
              textualCustom,
              readingHistory: readingHistory === 'true',
              translationLanguagePreference:
                transPref === undefined ? settings.translationLanguagePreference : transPref,
            }
          : {}),
      });
      alert(Sefaria._('Settings Saved'));
      Sefaria.track.event('Settings', 'Settings Save', emailNotifications);
      const languageChanged = interfaceLanguage !== saved.current.interfaceLanguage;
      if (languageChanged) {
        Sefaria.track.setInterfaceLanguage('interface language account settings', interfaceLanguage);
      }
      // Interface language or Library Assistant changed → reload (interface language affects RTL/LTR and server-rendered content; the assistant needs a fresh chatbot_user_token and script tag)
      if (languageChanged || libraryAssistant !== saved.current.libraryAssistant) {
        window.location.reload();
        return;
      }
      if (transPref !== saved.current.translationLanguage) {
        Sefaria.track.event('Reader', 'Set Translation Language Preference', transPref);
        saved.current.translationLanguage = transPref;
      }
      const detail = { translationLanguagePreference: profile.settings.translation_language_preference };
      if (torahSpecific) {
        detail.readingHistory = profile.settings.reading_history;
      }
      const newTextualCustom = profile.settings.textual_custom;
      if (newTextualCustom !== saved.current.textualCustom) {
        // only check change here because it triggers an API call to re-fetch calendars
        detail.textualCustom = newTextualCustom;
        detail.diaspora = settings.diaspora ? '1' : '0';
        saved.current.textualCustom = newTextualCustom;
      }
      document.dispatchEvent(new CustomEvent('sefaria:settings-updated', { detail }));
    }).fail(() => setSaveError(Sefaria._v(SAVE_FAILED)));
  };

  const updateEmail = () => {
    $.post('/settings/account/user', { json: JSON.stringify(emailFields) }, (data) => {
      if (!isJsonAnswer(data)) {
        onSessionEnded();
        return;
      }
      if ('error' in data) {
        setEmailError(data.error);
        return;
      }
      setEmailError('');
      rememberAccountSettings({ email: emailFields.email });
      setEmail(emailFields.email);
      Sefaria._email = emailFields.email;
      if (onEmailChanged) {
        onEmailChanged();
      }
      setEmailOk(Sefaria._('Email was successfully changed!'));
      setEditingEmail(false);
    }).fail(() => {
      setEmailOk('');
      setEmailError(Sefaria._v(SAVE_FAILED));
    });
  };

  const disconnectGauth = () => {
    $.get('/unlink-gauth?redirect=0', (data) => {
      if (!isJsonAnswer(data)) {
        onSessionEnded();
        return;
      }
      if ('error' in data) {
        setGauthError(data.error);
      } else {
        rememberAccountSettings({ sheetsExport: { gauthEmail: null } });
        setGauthError('');
        setGauthEmail('');
      }
    }).fail(() => setGauthError(Sefaria._v(SAVE_FAILED)));
  };

  const saveErrorMessage = (id) =>
    saveError ? (
      <p id={id} className="account-save-error" role="alert">
        {saveError}
      </p>
    ) : null;
  const saveButton = (
    <button type="button" className="button small blue control-elem saveAccountSettingsBtn" onClick={save}>
      <InterfaceText text={{ en: 'Save', he: 'שמירה' }} />
    </button>
  );
  const cancelButton = (extraClass) => (
    <button type="button" className={'button ' + extraClass + ' control-elem'} onClick={navigateBack}>
      <InterfaceText text={{ en: 'Cancel', he: 'ביטול' }} />
    </button>
  );

  return (
    <div id="accountSettingsPage" className="static biReady">
      <div className="inner">
        <div className="headerWithButtons">
          <h1>
            <InterfaceText text={{ en: 'Account Settings', he: 'הגדרות חשבון' }} />
          </h1>
          <div className="end">
            {cancelButton('small transparent')}
            {saveButton}
          </div>
        </div>
        {saveErrorMessage('account-save-error')}
        <SettingSection
          id="emailNotifications"
          label={
            <InterfaceText text={{ en: 'Notification Frequency (Maximum)', he: 'תדירות שליחת הודעות (מקסימלית)' }} />
          }
        >
          <SettingToggle
            optionClass="tripleOption"
            value={emailNotifications}
            onChange={setEmailNotifications}
            options={[
              { value: 'daily', content: <InterfaceText text={{ en: 'Daily', he: 'יומית' }} /> },
              { value: 'weekly', content: <InterfaceText text={{ en: 'Weekly', he: 'שבועית' }} /> },
              { value: 'never', content: <InterfaceText text={{ en: 'Never', he: 'לעולם לא' }} /> },
            ]}
          />
        </SettingSection>

        {torahSpecific ? (
          <React.Fragment>
            <SettingSection id="siteLanguage" label={<InterfaceText text={{ en: 'Site Language', he: 'שפת ממשק' }} />}>
              <SettingToggle
                optionClass="doubleOption"
                value={interfaceLanguage}
                onChange={setInterfaceLanguage}
                options={[
                  { value: 'english', content: <span className="int-bi">English</span> },
                  { value: 'hebrew', content: <span className="int-bi">עברית</span> },
                ]}
              />
            </SettingSection>

            {translationLanguages.length ? (
              <SettingSection
                id="translationLanguagePreference"
                label={<InterfaceText text={{ en: 'Preferred Translation Language', he: 'שפה מועדפת לתרגום' }} />}
              >
                <SettingToggle
                  optionClass="quadrupleOption"
                  value={translationLanguage}
                  onChange={setTranslationLanguage}
                  options={translationLanguages.map((lang) => ({
                    value: lang.code,
                    content: <span className="int-bi">{lang.name}</span>,
                  }))}
                />
              </SettingSection>
            ) : null}

            <SettingSection
              id="readingHistory"
              label={<InterfaceText text={{ en: 'Reading History', he: 'היסטורית קריאה' }} />}
            >
              <SettingToggle
                optionClass="doubleOption"
                value={readingHistory}
                onChange={(value) => {
                  setReadingHistory(value);
                  setWarnReadingHistory(value === 'false');
                }}
                options={[
                  {
                    value: 'true',
                    name: 'reading-history',
                    content: <InterfaceText text={{ en: 'On', he: 'פעילה' }} />,
                  },
                  {
                    value: 'false',
                    name: 'reading-history',
                    content: <InterfaceText text={{ en: 'Off', he: 'כבויה' }} />,
                  },
                ]}
              >
                <span id="reading-history-warning" className={warnReadingHistory ? 'active' : null}>
                  {warnReadingHistory
                    ? Sefaria._('Turning this feature off will permanently delete your reading history.')
                    : null}
                </span>
              </SettingToggle>
            </SettingSection>

            <SettingSection
              id="textualCustom"
              label={<InterfaceText text={{ en: 'Preferred Custom (Weekly Haftarot)', he: 'מנהג מועדף (להפטרות)' }} />}
            >
              <SettingToggle
                optionClass="doubleOption"
                value={textualCustom}
                onChange={setTextualCustom}
                options={[
                  { value: 'sephardi', content: <InterfaceText text={{ en: 'Sephardi', he: 'עדות המזרח' }} /> },
                  { value: 'ashkenazi', content: <InterfaceText text={{ en: 'Ashkenazi', he: 'אשכנז' }} /> },
                ]}
              />
            </SettingSection>
          </React.Fragment>
        ) : null}

        {/* The Library Assistant is a plain user setting, shown to every logged-in user. Its
            value is the effective one: users who are on through the pre-migration rule carry
            no setting key yet. */}
        <SettingSection
          id="libraryAssistantSetting"
          label={<InterfaceText text={{ en: 'Library Assistant', he: 'עוזר הספרייה' }} />}
        >
          <SettingToggle
            optionClass="doubleOption"
            value={libraryAssistant}
            onChange={setLibraryAssistant}
            options={[
              { value: 'true', content: <InterfaceText text={{ en: 'On', he: 'פעיל' }} /> },
              { value: 'false', content: <InterfaceText text={{ en: 'Off', he: 'כבוי' }} /> },
            ]}
          />
        </SettingSection>

        <div id="username-change" className="section">
          <label className="control-elem">
            <InterfaceText text={{ en: 'Login Method', he: 'אמצעי התחברות' }} />
          </label>
          {socialProviders.length ? (
            <div className="form-section">
              <LoginMethodText method={loginMethod(socialProviders)} email={email} />
            </div>
          ) : (
            <React.Fragment>
              <div
                id="username-change-display"
                className="form-section"
                style={editingEmail ? { display: 'none' } : null}
              >
                <input id="email-display" type="text" disabled="disabled" value={email} readOnly />
                <button
                  id="change-email"
                  type="button"
                  className="button blue fillWidth"
                  onClick={() => setEditingEmail(true)}
                >
                  <InterfaceText text={{ en: 'Change Email', he: 'שינוי כתובת דוא״ל' }} />
                </button>
                <span id="email-edit-ok" style={emailOk ? null : { display: 'none' }}>
                  {emailOk}
                </span>
              </div>
              <div id="username-change-edit" className="form-section" style={editingEmail ? null : { display: 'none' }}>
                <input
                  id="email"
                  type="text"
                  placeholder={Sefaria._('account_settings.new_email')}
                  autoComplete="off"
                  value={emailFields.email}
                  onChange={(e) => setEmailFields({ ...emailFields, email: e.target.value })}
                />
                <input
                  id="confirmEmail"
                  type="text"
                  placeholder={Sefaria._('account_settings.confirm_new_email')}
                  autoComplete="off"
                  value={emailFields.confirmEmail}
                  onChange={(e) => setEmailFields({ ...emailFields, confirmEmail: e.target.value })}
                />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder={Sefaria._('account_settings.password')}
                  autoComplete="new-password"
                  value={emailFields.confirmPassword}
                  onChange={(e) => setEmailFields({ ...emailFields, confirmPassword: e.target.value })}
                />
                <button id="update-email" type="button" className="button blue fillWidth" onClick={updateEmail}>
                  <InterfaceText text={{ en: 'Update Email', he: 'עדכון כתובת דוא"ל' }} />
                </button>
                <span id="email-edit-errors" role={emailError ? 'alert' : undefined}>
                  {emailError}
                </span>
              </div>
            </React.Fragment>
          )}
        </div>

        <div id="gauth-email-change" className="section" style={gauthEmail ? null : { display: 'none' }}>
          <label className="control-elem">
            <InterfaceText
              text={{ en: 'Sheets Export: Google Drive Connected', he: 'ייצוא דפי מקורות: גוגל דרייב מחובר' }}
            />
          </label>
          <div id="gauth-email-disconnect-display" className="form-section">
            <input id="gauth-email-display" type="text" disabled="disabled" value={gauthEmail} readOnly />
            <button
              id="disconnect-gauth-email"
              type="button"
              className="button blue fillWidth"
              onClick={disconnectGauth}
            >
              <InterfaceText text={{ en: 'Disconnect', he: 'ניתוק' }} />
            </button>
            <span id="gauth-disconnect-messages" role={gauthError ? 'alert' : undefined}>
              {gauthError}
            </span>
          </div>
        </div>
        <div id="gauth-email-disconnected" className="section" style={gauthEmail ? { display: 'none' } : null}>
          <label className="control-elem">
            <InterfaceText
              text={{ en: 'Sheets Export: No Google Drive Connected', he: 'ייצוא דפי מקורות: גוגל דרייב אינו מחובר' }}
            />
          </label>
          <div className="additional-info">
            <InterfaceText
              text={{
                en: 'No Google Drive connected. You can link one the next time you export a sheet.',
                he: 'גוגל דרייב אינו מחובר. ניתן לחבר אותו בפעם הבאה שתייצאו דף מקורות.',
              }}
            />
          </div>
        </div>

        {saveErrorMessage('account-save-error-bottom')}
        <div className="saveCancel">
          {saveButton}
          {cancelButton('transparent small')}
        </div>
      </div>
    </div>
  );
};

const SAVE_FAILED = {
  en: "Something went wrong and your change wasn't saved. Please try again.",
  he: 'משהו השתבש והשינוי לא נשמר. נסו שוב.',
};
const CONNECTED_MS = 8000;
const CONFIRMATION_POLL_MS = 3000;
const CONFIRMATION_FAST_POLL_MS = 60 * 1000;
const CONFIRMATION_MAX_POLL_MS = 60 * 1000;
/* How long an emailed confirmation link works, as the server's CONFIRMATION_LINK_MAX_AGE. */
const CONFIRMATION_LINK_MS = 3 * 24 * 60 * 60 * 1000;
const SETUP_MS = 1200;

const SettingsPage = ({ tab, projectId, accountSettings, initialDeveloper, setTab, setProjectId }) => {
  const [developerHome, setDeveloperHome] = useState(0);
  /* Restored from the browser's back/forward cache, the page has no fresh props: it reuses the settings it last
     remembered, or reloads when it remembers nothing (from the API keys branch, b7468aae8). */
  const [restored] = useState(() => !accountSettings);
  const [settings, setSettings] = useState(() => (restored ? latestSettings.account : accountSettings));
  const [hasDeveloper] = useState(() => !!(restored ? latestSettings.developer : initialDeveloper));
  const socialProviders = (settings && settings.socialProviders) || [];

  const [developerState, setDeveloperState] = useState(() => ({
    ...emptyState(),
    ...((restored ? latestSettings.developer : initialDeveloper) || {}),
  }));
  /* Cached developer state, API keys included, is only shown once the server has confirmed the
     session: until then a restored page shows no developer content (from the API keys branch). */
  const [verified, setVerified] = useState(() => !(restored && hasDeveloper));
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  /* Set while the page is in the back/forward cache and until the server has confirmed the session again. */
  const [paused, setPaused] = useState(false);
  const pausedSettings = useRef(undefined);
  const [notice, setNotice] = useState('');
  const [connectedMessage, setConnectedMessage] = useState('');
  const connectedTimer = useRef(null);
  const setupTimer = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(connectedTimer.current);
      clearTimeout(setupTimer.current);
    },
    []
  );

  const pageMounted = useRef(true);
  useEffect(
    () => () => {
      pageMounted.current = false;
    },
    []
  );

  /* The session ended (401, 403, or a login page where JSON was due): nothing cached survives, and the visitor is sent to log in. */
  const endSession = () => {
    latestSettings.account = undefined;
    latestSettings.developer = undefined;
    if (pageMounted.current) {
      setDeveloperState(emptyState());
      setSessionEnded(true);
    }
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
  };

  /* Brings back the account content that pagehide took down, as it was when the page left. */
  const resumeAccount = () => {
    if (pausedSettings.current) {
      latestSettings.account = pausedSettings.current;
      setSettings(pausedSettings.current);
      pausedSettings.current = undefined;
    }
    setPaused(false);
  };

  /* Asks the server whether the session is still the one the cached state belongs to. Developer
     content appears only after an answer; a refusal clears everything. */
  const revalidate = () => {
    setVerifyFailed(false);
    readState().then(
      (server) => {
        if (pageMounted.current) {
          setDeveloperState(server);
          setVerified(true);
          resumeAccount();
        }
      },
      (err) => {
        /* A 404 is the answer in staff-only mode once the visitor is no longer staff or no longer logged in. */
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          endSession();
        } else if (pageMounted.current) {
          setVerifyFailed(true);
          resumeAccount();
        }
      }
    );
  };

  /* N-C8: an email change on the Account tab resets confirmation (rule 14). Opening the Developer tab reads the
     state again, so its banner and disabled create buttons show without a reload. */
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    if (tab !== 'developer') {
      return;
    }
    readState().then(
      (server) => {
        if (pageMounted.current) {
          setDeveloperState(server);
        }
      },
      () => {}
    );
  }, [tab]);
  /* Restored with nothing remembered, the page can't know the current settings, so it reloads them. */
  useEffect(() => {
    if (!settings) {
      window.location.reload();
      return;
    }
    if (!restored) {
      latestSettings.account = settings;
    }
    if (restored && hasDeveloper) {
      revalidate();
    }
  }, []);
  useEffect(() => {
    latestSettings.developer = hasDeveloper ? developerState : null;
  }, [developerState]);

  /* The back/forward cache keeps the page as it was, keys and all, however long ago and whoever
     is logged in by then. Leaving clears the account and developer content from the snapshot, and a page
     brought back from the cache asks the server again before showing it: the developer state endpoint where
     there is a developer tab, and a reload (the settings page itself needs a login) where there is not. */
  useEffect(() => {
    const hide = () => {
      pausedSettings.current = latestSettings.account || pausedSettings.current;
      latestSettings.account = undefined;
      setPaused(true);
      if (hasDeveloper) {
        latestSettings.developer = emptyState();
        setVerified(false);
        setDeveloperState(emptyState());
      }
    };
    const show = (e) => {
      if (!e.persisted) {
        return;
      }
      hide();
      if (hasDeveloper) {
        revalidate();
      } else {
        window.location.reload();
      }
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, []);

  /* Every API call answers with the whole developer state, which replaces the page's copy. A
     failure leaves a notice, unless the caller shows the error itself ({quiet: true}); either
     way the promise rejects, so callers can tell. With {refresh: true} a failure also reloads
     the state, for answers to something the server may no longer offer. */
  const run = (request, { quiet, refresh } = {}) =>
    request.then(
      (data) => {
        if (pageMounted.current) {
          setDeveloperState(data);
        }
        return data;
      },
      (err) => {
        if (!quiet && pageMounted.current) {
          setNotice(eMessage(err));
        }
        if (refresh) {
          readState().then(
            (server) => {
              if (pageMounted.current) {
                setDeveloperState(server);
              }
            },
            () => {}
          );
        }
        throw err;
      }
    );

  /* Set up once, developer settings stay open: an account whose email changed since keeps its
     projects and keys, and confirms the new address before creating more. */
  const developerOn =
    !!developerState.developerEnabled && (accountVerified(developerState) || !!developerState.profile);

  /* A short pause before developer settings appear, so the change doesn't read as a reload. */
  const showDeveloper = (onReady) => {
    setNotice('');
    clearTimeout(setupTimer.current);
    setupTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
      if (onReady) {
        onReady();
      }
    }, SETUP_MS);
  };

  /* The confirmation link may be opened anywhere, and opening it turns developer settings on,
     so a page waiting for it checks every few seconds for the first minute and less often after
     that, and at once when a tab in this browser signals it. It pauses while the tab is hidden,
     and stops when the session ends or the link has expired. */
  const awaitingConfirmation = !accountVerified(developerState) && !!developerState.confirmationSentAt;
  const confirmationSentAt = awaitingConfirmation ? developerState.confirmationSentAt : null;
  useEffect(() => {
    if (!confirmationSentAt) {
      return undefined;
    }
    const expiresAt = Date.parse(confirmationSentAt) + CONFIRMATION_LINK_MS;
    const expired = () => Date.now() >= expiresAt;
    let active = true;
    let timer = null;
    let waitingSince = Date.now();
    let delay = CONFIRMATION_POLL_MS;
    const stop = () => {
      active = false;
      clearTimeout(timer);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!active || document.hidden) {
        return;
      }
      if (expired()) {
        stop();
        return;
      }
      timer = setTimeout(check, delay);
      if (Date.now() - waitingSince >= CONFIRMATION_FAST_POLL_MS) {
        delay = Math.min(delay * 2, CONFIRMATION_MAX_POLL_MS);
      }
    };
    const check = () => {
      if (!active) {
        return;
      }
      if (expired()) {
        stop();
        return;
      }
      readState().then(
        (server) => {
          if (!active) {
            return;
          }
          if (server.emailVerified) {
            stop();
            emailConfirmed(server);
          } else {
            schedule();
          }
        },
        (err) => {
          if (!active) {
            return;
          }
          if (err.status === 401) {
            stop();
          } else {
            schedule();
          }
        }
      );
    };
    const onStorage = (e) => {
      if (e.key === CONFIRMATION_SIGNAL_KEY) {
        check();
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      waitingSince = Date.now();
      delay = CONFIRMATION_POLL_MS;
      check();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      stop();
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [confirmationSentAt]);

  const emailConfirmed = (server) => {
    showDeveloper(() => {
      if (pageMounted.current) {
        setDeveloperState(server);
      }
      setConnectedMessage(Sefaria._v({ en: 'Your email is confirmed.', he: 'כתובת הדוא״ל אושרה.' }));
      clearTimeout(connectedTimer.current);
      connectedTimer.current = setTimeout(() => setConnectedMessage(''), CONNECTED_MS);
    });
  };

  /* A new account email is unverified, so the developer tab stops offering new projects and keys
     at once, then shows what the server says. */
  const developerEmailChanged = () => {
    setDeveloperState((state) => ({ ...state, ssoConnected: false, emailVerified: false, confirmationSentAt: null }));
    readState().then(
      (server) => {
        if (pageMounted.current) {
          setDeveloperState(server);
        }
      },
      () => {}
    );
  };

  if (!settings || sessionEnded || paused) {
    return null;
  }

  /* The server sends no developer state where developer settings are off, and then there is no developer tab. */
  const tabs = SETTINGS_TABS.filter((t) => t.tab !== 'developer' || hasDeveloper);

  const panels = {
    account: (
      <AccountTab
        settings={settings}
        socialProviders={socialProviders}
        onEmailChanged={hasDeveloper ? developerEmailChanged : null}
        onSessionEnded={endSession}
      />
    ),
    developer: !verified ? (
      <div className="devPocPage">
        {verifyFailed ? (
          <p className="devPocWarning" role="alert">
            <InterfaceText
              text={{
                en: "We couldn't check your session. Reload the page to see developer settings.",
                he: 'לא הצלחנו לבדוק את ההתחברות. רעננו את הדף כדי לראות את הגדרות מפתחים.',
              }}
            />
          </p>
        ) : null}
      </div>
    ) : (
      <DeveloperE
        state={developerState}
        developerOn={developerOn}
        run={run}
        notice={notice}
        setNotice={setNotice}
        connectedMessage={connectedMessage}
        homeSignal={developerHome}
      />
    ),
  };

  return (
    <div
      className={'readerNavMenu settingsPage settingsPage-' + tab}
      key="settings"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
        }
      }}
    >
      <div className="content">
        <div className="contentInner">
          <div className="settingsShell">
            <SettingsNav
              tabs={tabs}
              tab={tab}
              onSelect={(t) => {
                if (t === 'developer') {
                  setDeveloperHome((n) => n + 1);
                }
                setTab(t);
              }}
            />
            <div className="settingsPanels">
              {tabs.map((t) => (
                <div key={t.tab} className="settingsPanel" hidden={tab !== t.tab}>
                  {panels[t.tab]}
                </div>
              ))}
            </div>
          </div>
          {hasDeveloper ? <AgentInstructions /> : null}
        </div>
      </div>
    </div>
  );
};

/* Where the emailed confirmation link lands. It needs no login: confirming is a fact about
   the account, and the settings page carries on by itself wherever it is open. */
export const EmailConfirmedPage = () => {
  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIRMATION_SIGNAL_KEY, String(Date.now()));
    } catch (e) {
      /* ignore */
    }
  }, []);
  return (
    <div className="readerNavMenu settingsPage" key="emailConfirmed">
      <div className="content">
        <div className="contentInner">
          {/* Same layout as the confirmation steps in developer settings: no box, icon, title, one action. */}
          <div className="devPocPage devPocEmailConfirmed">
            <div className="devE-wrap devE-standalone">
              <section className="devE-card" aria-labelledby="devEConfirmedTitle">
                <div className="devE-head">
                  <span className="devE-ico ok" aria-hidden="true">
                    <ECheckIcon size={24} />
                  </span>
                  <h1 className="devE-title" id="devEConfirmedTitle">
                    <InterfaceText
                      text={{ en: 'Thank you for confirming your email', he: 'תודה! כתובת הדוא״ל אושרה' }}
                    />
                  </h1>
                </div>
                <div className="devE-form">
                  <a
                    className="sefaria-common-button auth-primary fullwidth"
                    href="/settings/developer?continue"
                    data-agent-action="continue-to-developer-settings"
                  >
                    <InterfaceText text={{ en: 'Continue to Developer Settings', he: 'המשך להגדרות מפתחים' }} />
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* Where an emailed confirmation link lands when it can't confirm: it expired, was already
   used, or was sent to an address that is no longer the account email. Needs no login. */
export const EmailLinkPage = ({ link }) => {
  const { status, key } = link || {};
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) {
      return;
    }
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const sendNewLink = () =>
    requestNewLink(key).then(
      () => {
        setSent(true);
        setError('');
        setWait(60);
      },
      (err) =>
        setError(
          eMessage(err, {
            en: "We couldn't send a new link. Ask for one in Developer Settings.",
            he: 'לא הצלחנו לשלוח קישור חדש. בקשו קישור בהגדרות מפתחים.',
          })
        )
    );
  const continueLink = (
    <a
      className="sefaria-common-button auth-primary fullwidth"
      href="/settings/developer?continue"
      data-agent-action="continue-to-developer-settings"
    >
      <InterfaceText text={{ en: 'Continue to Developer Settings', he: 'המשך להגדרות מפתחים' }} />
    </a>
  );
  /* Expired and old-address links share one screen and one button. The server sends a fresh link for an expired
     one without a login; a link to a former address can't be renewed from here (it must be for the account email),
     so its button opens developer settings, where the banner sends one to the current address. */
  const newLinkButton =
    status === 'expired' ? (
      <button
        className="sefaria-common-button auth-primary fullwidth"
        type="button"
        data-agent-action="send-new-link"
        onClick={sendNewLink}
      >
        <InterfaceText text={{ en: 'Send a new link', he: 'שליחת קישור חדש' }} />
      </button>
    ) : (
      <a
        className="sefaria-common-button auth-primary fullwidth"
        href="/settings/developer"
        data-agent-action="send-new-link"
      >
        <InterfaceText text={{ en: 'Send a new link', he: 'שליחת קישור חדש' }} />
      </a>
    );
  const deadLink = {
    title: { en: 'This link no longer works', he: 'הקישור כבר לא פעיל' },
    body: {
      en: 'It has expired, or it was sent to an email address that is no longer on your Sefaria account.',
      he: 'תוקפו פג, או שהוא נשלח לכתובת דוא״ל שכבר אינה משויכת לחשבון ספריא שלך.',
    },
    action: newLinkButton,
  };
  /* Once a new link is sent, the page turns into the setup's "Check your email" screen. It has no login, so it
     can't name the address; the link goes to the account email. */
  const checkEmail = {
    title: { en: 'Check your email', he: 'בדקו את תיבת הדוא״ל' },
    body: {
      en: 'We sent a new confirmation link to your account email.',
      he: 'שלחנו קישור אישור חדש לכתובת הדוא״ל של החשבון.',
    },
    action: (
      <p className="devE-hint devE-hintCenter" aria-live="polite">
        {tE("Didn't get the email?", 'הדוא״ל לא הגיע?')}{' '}
        <button
          type="button"
          className="devE-inlineLink devE-linkBtn devE-resendLink"
          data-agent-action="send-new-link"
          disabled={!!wait}
          onClick={sendNewLink}
        >
          {wait ? vE('Resend in ' + wait + 's', 'שליחה חוזרת בעוד ' + wait + ' שנ׳') : tE('Resend link', 'שליחה חוזרת')}
        </button>
      </p>
    ),
  };
  const content = sent
    ? checkEmail
    : {
        'already-confirmed': {
          title: { en: 'Already confirmed', he: 'הכתובת כבר אושרה' },
          body: { en: 'This email address is already confirmed.', he: 'כתובת הדוא״ל הזו כבר אושרה.' },
          action: continueLink,
          ok: true,
        },
        expired: deadLink,
        'not-account-email': deadLink,
        /* An address another account uses gets the same page as any link that won't work (Penina, 2026-11-15). */
        'address-in-use': deadLink,
      }[status];
  if (!content) {
    return null;
  }
  return (
    <div className="readerNavMenu settingsPage" key="emailLink">
      <div className="content">
        <div className="contentInner">
          {/* Same layout as the confirmation steps in developer settings: no box, icon, title, one action. */}
          <div className="devPocPage devPocEmailConfirmed">
            <div className="devE-wrap devE-standalone">
              <section className="devE-card" aria-labelledby="devELinkTitle">
                <div className="devE-head">
                  <span className={'devE-ico' + (content.ok ? ' ok' : '')} aria-hidden="true">
                    {content.ok ? <ECheckIcon size={24} /> : <EMailIcon size={24} />}
                  </span>
                  <h1 className="devE-title" id="devELinkTitle">
                    <InterfaceText text={content.title} />
                  </h1>
                  <p className="devE-lead devE-leadCenter">
                    <InterfaceText text={content.body} />
                  </p>
                </div>
                <div className="devE-form">
                  {content.action}
                  {error ? (
                    <p className="devE-hint devE-hintCenter devE-errorText" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

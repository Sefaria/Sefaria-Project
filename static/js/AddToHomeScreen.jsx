import React, {useEffect, useRef, useState} from 'react';
import Sefaria from './sefaria/sefaria';
import Button from './common/Button';
import Modal from './common/modal';
import {CloseButton} from './Misc';

/*
 * Add-to-home-screen POC.
 * Offers to pin Weekday Mincha or this week's parashah to the home screen on mobile web.
 * Spec: "Add to Home Screen — Light Spec & POC" doc. Design: "Add to Home Screen banner" canvas.
 */

const CONFIRMATION_MS = 6000;

const MINCHA_TITLES = [
  "Siddur Ashkenaz, Weekday, Minchah",
  "Siddur Sefard, Weekday Mincha",
  "Siddur Edot HaMizrach, Weekday Mincha",
];

// Demo switches (?a2hs=reset / ?a2hs=show), read before the reader rewrites the address.
const INITIAL_A2HS_PARAM = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get("a2hs") : null;

// Chrome fires beforeinstallprompt once per manifest; keep it so the button can use it later.
let deferredPrompt = null;
const listeners = new Set();
const notify = (type) => listeners.forEach(fn => fn(type));
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify('prompt');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify('installed');
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isStandalone = () => typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);

const getTarget = (ref) => {
  if (!ref) { return null; }
  const mincha = MINCHA_TITLES.find(t => ref === t || ref.startsWith(t + ","));
  if (mincha) {
    return {key: "mincha", label: "Mincha", stepsTitle: "Add Mincha in 3 steps",
            headline: "Back for Mincha?", start: "/" + Sefaria.normRef(mincha),
            tagline: "Add Mincha to your home screen to open it again with one tap."};
  }
  try {
    const parashahRef = Sefaria.calendars && Sefaria.calendarRef("Parashat Hashavua");
    if (parashahRef && Sefaria.refContains(parashahRef, ref)) {
      return {key: "parashah", label: "Weekly Parsha", stepsTitle: "Add the parashah in 3 steps",
              headline: "Back to study the parsha?", start: "/parashat-hashavua",
              tagline: "Add the parashah to your home screen to open it again with one tap."};
    }
  } catch (e) {}
  return null;
};

// Cookie per target: {v: visits, t: last visit time, d: dismissed, i: installed}. Works logged out.
// POC: every return to the target counts as a later visit (reloads included), so it's easy to demo.
// Parashah visits share one counter across weeks.
const readState = (key) => {
  const match = document.cookie.match(new RegExp("(?:^|; )a2hs_" + key + "=([^;]*)"));
  try { return Object.assign({v: 0, t: 0, d: 0, i: 0}, match ? JSON.parse(decodeURIComponent(match[1])) : {}); }
  catch (e) { return {v: 0, t: 0, d: 0, i: 0}; }
};
const writeState = (key, state) => {
  document.cookie = `a2hs_${key}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000; samesite=lax`;
};

const recordVisit = (key) => {
  const state = readState(key);
  state.v += 1;
  state.t = Date.now();
  writeState(key, state);
  return state;
};

// Point the page's manifest (Android) and web-app title (iOS) at a mini-app for this page.
const useMiniAppManifest = (target) => {
  useEffect(() => {
    const link = document.getElementById("appManifest");
    const title = document.getElementById("appleWebAppTitle");
    if (!target || !link) { return; }
    const originalHref = link.dataset.defaultHref || link.getAttribute("href");
    const originalTitle = title && (title.dataset.defaultContent || title.getAttribute("content"));
    // The server already renders the right manifest on a full page load; swap only after in-app navigation.
    if (!link.getAttribute("href").includes(`id=${target.key}`)) {
      const params = new URLSearchParams({start: target.start, name: target.label, id: target.key});
      link.setAttribute("href", `/site.webmanifest?${params.toString()}`);
    }
    if (title) { title.setAttribute("content", target.label); }
    return () => {
      link.setAttribute("href", originalHref);
      if (title) { title.setAttribute("content", originalTitle); }
    };
  }, [target && target.key]);
};

const SafariMenuIcon = () => (
  <svg className="a2hsInlineIcon" role="img" aria-label="Page menu" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16"/><path d="M4 12h12"/><path d="M4 17h8"/>
  </svg>
);

const ShareIcon = ({size = 18}) => (
  <svg className="a2hsInlineIcon" role="img" aria-label="Share" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>
  </svg>
);

const AddIcon = () => (
  <svg className="a2hsInlineIcon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>
  </svg>
);

const APP_TILES = [
  {bg: "#f5ddda", fg: "#d5786c", paths: ["M8 2v4", "M16 2v4", "M3 10h18"], rect: {width: 18, height: 18, x: 3, y: 4, rx: 2}},
  {bg: "#eedbea", fg: "#b36fa2", circle: {cx: 12, cy: 12, r: 10}, paths: ["M12 6v6l4 2"]},
  {bg: "#e4eaf3", fg: "#7f97b9", paths: ["M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z", "M15 5.764v15", "M9 3.236v15"]},
  {bg: "#d1eada", fg: "#5c946d", paths: ["M9 18V5l12-2v13"], circles: [{cx: 6, cy: 18, r: 3}, {cx: 18, cy: 16, r: 3}]},
];

const PhonePreview = ({label}) => (
  <div className="a2hsPhone" aria-hidden="true">
    <div className="a2hsPhoneSpeaker"/>
    <div className="a2hsPhoneGrid">
      {APP_TILES.map((tile, i) => (
        <div key={i} className="a2hsTile" style={{background: tile.bg}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tile.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {tile.rect && <rect {...tile.rect}/>}
            {tile.circle && <circle {...tile.circle}/>}
            {(tile.circles || []).map((c, j) => <circle key={j} {...c}/>)}
            {tile.paths.map((d, j) => <path key={j} d={d}/>)}
          </svg>
        </div>
      ))}
      <img className="a2hsTile a2hsSefariaIcon" src="/static/icons/library/apple-touch-icon.png" alt=""/>
      <div className="a2hsTile a2hsEmptyTile"/>
    </div>
    <div className="a2hsTileLabel">{label}</div>
  </div>
);

const Confirmation = ({label, onClose}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, []);
  const aboveAsk = typeof document !== 'undefined' && !!document.querySelector("lc-chatbot");
  return (
    <div className={`a2hsConfirmation${aboveAsk ? " aboveAsk" : ""}`} role="status" aria-live="polite">
      <div className="a2hsConfirmationIcon" aria-hidden="true">
        <img src="/static/icons/library/apple-touch-icon.png" alt=""/>
        <span className="a2hsCheck">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </span>
      </div>
      <p className="a2hsConfirmationText">{label} is on your home screen</p>
      <CloseButton onClick={onClose} altText="Dismiss"/>
    </div>
  );
};

const AddToHomeScreen = ({currentRef}) => {
  const target = getTarget(currentRef);
  const [view, setView] = useState(null);  // null | "offer" | "iosSteps" | "androidSteps" | "success"
  const [, setPromptReady] = useState(!!deferredPrompt);
  const viewRef = useRef(view);
  viewRef.current = view;

  useMiniAppManifest(target);

  useEffect(() => {
    const onEvent = (type) => {
      if (type === 'prompt') { setPromptReady(true); }
      if (type === 'installed' && target) {
        writeState(target.key, Object.assign(readState(target.key), {i: 1}));
        setView("success");
      }
    };
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  }, [target && target.key]);

  // Decide whether and when to offer, once per target page view.
  useEffect(() => {
    if (!target || isStandalone()) { setView(null); return; }
    const demo = INITIAL_A2HS_PARAM || new URLSearchParams(window.location.search).get("a2hs");
    if (demo === "reset") { writeState(target.key, {v: 0, t: 0, d: 0, i: 0}); }
    const state = recordVisit(target.key);
    if (demo !== "show" && (state.d || state.i)) { return; }
    // Only offer from the second visit on; the first visit shows nothing.
    if (state.v > 1 || demo === "show") {
      if (viewRef.current === null) { setView("offer"); }
    }
  }, [target && target.key]);

  // iOS jumps to the home screen after "Add"; treat coming back to the page from the steps as success.
  useEffect(() => {
    if (view !== "iosSteps" || !target) { return; }
    let wasHidden = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { wasHidden = true; }
      else if (wasHidden) {
        writeState(target.key, Object.assign(readState(target.key), {i: 1}));
        setView("success");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [view]);

  if (!target || !view) { return null; }

  const dismiss = () => {
    writeState(target.key, Object.assign(readState(target.key), {d: 1}));
    setView(null);
  };
  const markInstalled = () => {
    writeState(target.key, Object.assign(readState(target.key), {i: 1}));
    setView("success");
  };
  const add = async () => {
    if (isIOS()) { setView("iosSteps"); return; }
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") { markInstalled(); }
      return;
    }
    setView("androidSteps");
  };

  if (view === "success") {
    return <Confirmation label={target.label} onClose={() => setView(null)}/>;
  }

  return (
    <Modal close={dismiss}>
      <div className="a2hsModal" role="document">
        <CloseButton onClick={dismiss} altText="Close"/>
        {view === "offer" && (
          <>
            <div className="a2hsHeader">
              <h2 className="a2hsTitle">{target.headline}</h2>
              <p className="a2hsTagline">{target.tagline}</p>
            </div>
            <PhonePreview label={target.label}/>
            <Button size="fullwidth" onClick={add}>Add to home screen</Button>
          </>
        )}
        {view === "iosSteps" && (
          <>
            <h2 className="a2hsTitle a2hsStepsTitle">{target.stepsTitle}</h2>
            <ol className="a2hsSteps">
              <li><span className="a2hsStepNumber" aria-hidden="true">1</span><span>Tap <SafariMenuIcon/> next to the address, then <ShareIcon/> <strong>Share</strong>.</span></li>
              <li><span className="a2hsStepNumber" aria-hidden="true">2</span><span>Tap <strong>View More</strong>, then <AddIcon/> <strong>Add to Home Screen</strong>.</span></li>
              <li><span className="a2hsStepNumber" aria-hidden="true">3</span><span>Tap <strong>Add</strong> in the top corner.</span></li>
            </ol>
            <Button size="fullwidth" onClick={markInstalled}>Done</Button>
          </>
        )}
        {view === "androidSteps" && (
          <>
            <h2 className="a2hsTitle a2hsStepsTitle">{`Add ${target.label} in 2 steps`}</h2>
            <ol className="a2hsSteps">
              <li><span className="a2hsStepNumber" aria-hidden="true">1</span><span>Tap <strong>⋮</strong> in your browser's menu.</span></li>
              <li><span className="a2hsStepNumber" aria-hidden="true">2</span><span>Tap <strong>Add to home screen</strong> or <strong>Install app</strong>.</span></li>
            </ol>
            <Button size="fullwidth" onClick={markInstalled}>Done</Button>
          </>
        )}
      </div>
    </Modal>
  );
};

export default AddToHomeScreen;

import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import Sefaria from "./sefaria/sefaria";

// POC "landy": a first-visit welcome that orients new visitors. Some just dismiss it;
// the ones who don't know where they are, or who can say what they're looking for, are
// handed to the Library Assistant with their question already asked.

const SEEN_KEY = "landy_welcome_seen";
const FORCE_PARAM = "landy";

/**
 * Whether to show the welcome on this page load: the first visit in this browser, or
 * ?landy=1 to force it for testing (?landy=0 never shows it). Client-only, so the server
 * render never includes it.
 */
const shouldShowLandyWelcome = () => {
  if (typeof window === "undefined") { return false; }
  const forced = new URLSearchParams(window.location.search).get(FORCE_PARAM);
  if (forced === "1") { return true; }
  if (forced === "0") { return false; }
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch (e) {
    return false; // storage blocked: don't risk showing it on every page
  }
};

const markLandyWelcomeSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (e) {}
};

const calendarUrl = (title) => {
  const item = (Sefaria.calendars || []).find(c => c.title.en === title);
  return item ? { url: "/" + item.url, label: item.displayValue } : null;
};

// Where "I'd be happy just to learn the ..." leads: this week's parasha and today's daf from
// the calendar data the page already has, then the Pirkei Avot and Megillat Esther book pages.
const getLearningLinks = () => {
  const parasha = calendarUrl("Parashat Hashavua");
  const daf = calendarUrl("Daf Yomi");
  return [
    { key: "parsha", text: "landy.parsha", href: parasha?.url || "/topics/category/torah-portions", current: parasha?.label },
    { key: "daf_yomi", text: "landy.daf_yomi", href: daf?.url || "/calendars", current: daf?.label },
    { key: "pirkei_avot", text: "landy.pirkei_avot", href: "/Pirkei_Avot" },
    { key: "megillat_esther", text: "landy.megillat_esther", href: "/Esther" },
  ];
};

const track = (featureName, extra = {}) => {
  if (typeof gtag !== "function") { return; }
  gtag("event", "landy_click", { feature_name: featureName, ...extra });
};

/**
 * The welcome itself: a modal dialog on desktop, a bottom sheet (3/4 of the screen) on
 * mobile web. onAsk(text, intent) hands a prompt to the Library Assistant.
 */
const LandyWelcome = ({ mobile, onAsk, onClose }) => {
  const dialogRef = useRef(null);
  const [helpText, setHelpText] = useState("");
  const learningLinks = getLearningLinks();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    track("shown", { variant: mobile ? "sheet" : "modal" });
    return () => dialog?.close?.();
  }, []);

  const close = (featureName) => {
    track(featureName);
    onClose();
  };

  const ask = (featureName, text, intent) => {
    track(featureName);
    onClose();
    onAsk(text, intent);
  };

  const submitHelp = (e) => {
    e?.preventDefault();
    const text = helpText.trim();
    if (!text) { return; }
    ask("how_can_we_help", text);
  };

  const handleHelpKeyDown = (e) => {
    // Enter sends, as it does in the assistant; Shift+Enter adds a line.
    if (e.key === "Enter" && !e.shiftKey) {
      submitHelp(e);
    }
  };

  const whereAmI = Sefaria._("landy.where_am_i");
  const suggest = Sefaria._("landy.suggest");

  return (
    <dialog
      ref={dialogRef}
      className={`landyWelcome ${mobile ? "landyWelcomeSheet" : "landyWelcomeModal"}`}
      aria-labelledby="landyWelcomeTitle"
      onCancel={(e) => { e.preventDefault(); close("escape"); }}
      onClick={(e) => { if (e.target === dialogRef.current) { close("backdrop"); } }}
    >
      <div className="landyWelcomeContent">
        {mobile && <div className="landyWelcomeHandle" aria-hidden="true" />}
        <button
          type="button"
          className="landyWelcomeClose"
          onClick={() => close("close")}
          aria-label={Sefaria._("common.close")}
        >
          &times;
        </button>
        <h2 id="landyWelcomeTitle" className="landyWelcomeTitle">
          {Sefaria._("landy.welcome_title")}
        </h2>
        <p className="landyWelcomeSubtitle">{Sefaria._("landy.welcome_text")}</p>
        <p className="landyWelcomeAssist">{Sefaria._("landy.assist_intro")}</p>

        <ul className="landyWelcomeOptions">
          <li>
            <button type="button" className="landyWelcomeOption" onClick={() => ask("where_am_i", whereAmI)}>
              <img src="/static/icons/ai-star-outline-18.svg" alt="" aria-hidden="true" />
              <span>{whereAmI}</span>
            </button>
          </li>
          <li>
            <button type="button" className="landyWelcomeOption" onClick={() => ask("suggest", suggest, "personalize")}>
              <img src="/static/icons/ai-star-outline-18.svg" alt="" aria-hidden="true" />
              <span>{suggest}</span>
            </button>
          </li>
          <li className="landyWelcomeLearn">
            <img src="/static/icons/book.svg" alt="" aria-hidden="true" />
            <span>
              {Sefaria._("landy.just_learn")}{" "}
              {learningLinks.map((link, i) => (
                <React.Fragment key={link.key}>
                  <a
                    href={link.href}
                    title={link.current ? Sefaria._v(link.current) : undefined}
                    onClick={() => close(link.key)}
                  >
                    {Sefaria._(link.text)}
                  </a>
                  {i < learningLinks.length - 1 ? ", " : ""}
                </React.Fragment>
              ))}
            </span>
          </li>
        </ul>

        <form className="landyWelcomeHelp" onSubmit={submitHelp}>
          <label htmlFor="landyWelcomeHelpInput" className="landyWelcomeHelpLabel">
            <img src="/static/icons/ai-star-solid-18.svg" alt={Sefaria._("AI assisted")} />
            {Sefaria._("landy.how_can_we_help")}
          </label>
          <div className="landyWelcomeHelpBox">
            <textarea
              id="landyWelcomeHelpInput"
              rows={3}
              maxLength={2000}
              value={helpText}
              placeholder={Sefaria._("landy.help_placeholder")}
              onChange={(e) => setHelpText(e.target.value)}
              onKeyDown={handleHelpKeyDown}
            />
            <button type="submit" className="landyWelcomeHelpSend" disabled={!helpText.trim()}>
              {Sefaria._("landy.send")}
            </button>
          </div>
        </form>

        <button type="button" className="landyWelcomeGood" onClick={() => close("im_good")}>
          {Sefaria._("landy.im_good")}
        </button>
      </div>
    </dialog>
  );
};

LandyWelcome.propTypes = {
  mobile: PropTypes.bool,
  onAsk: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export { LandyWelcome, shouldShowLandyWelcome, markLandyWelcomeSeen, getLearningLinks, SEEN_KEY as LANDY_SEEN_KEY };

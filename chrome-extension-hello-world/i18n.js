// Shared translations + locale helpers for the Sefaria Learning Schedules extension.
// Exposes globalThis.SefariaI18n for use from popup.js and content.js.
(function () {
  const TITLE_HE = {
    "Daf Yomi": "דף יומי",
    "Daily Mishnah": "משנה יומית",
    "929": "929",
  };

  const COMMENTARY_HE = {
    "Rashi": "רש\"י",
    "Tosafot": "תוספות",
    "Steinsaltz": "שטיינזלץ",
    "Rashba": "רשב\"א",
    "Maharsha": "מהרש\"א",
    "Bartenura": "ברטנורא",
    "English Explanation of Mishnah": "ביאור באנגלית",
    "Yachin": "יכין",
    "Boaz": "בועז",
    "Tiferet Yisrael": "תפארת ישראל",
    "Ibn Ezra": "אבן עזרא",
    "Ramban": "רמב\"ן",
    "Radak": "רד\"ק",
    "Sforno": "ספורנו",
  };

  const STRINGS = {
    en: {
      todaysLearning: "Today's Learning",
      confirm: "Confirm",
      loading: "Loading…",
      empty: "No supported schedules today.",
      error: "Could not load today's calendars.",
      learnWith: "Learn with:",
      selectCommentary: "Select Commentary...",
      imDone: "I'm Done!",
      doneCheck: "Done ✓",
      completed: "Completed",
      endOfLearning: (title, date) => `End of ${title} learning for ${date}`,
    },
    he: {
      todaysLearning: "הלימוד היומי",
      confirm: "אישור",
      loading: "טוען…",
      empty: "אין לימודים זמינים היום.",
      error: "טעינת הלימודים נכשלה.",
      learnWith: "למד עם:",
      selectCommentary: "בחר פרשן...",
      imDone: "סיימתי!",
      doneCheck: "סיימתי ✓",
      completed: "הושלם",
      endOfLearning: (title, date) => `סוף לימוד ${title} ל-${date}`,
    },
  };

  function isHebrewHost(hostname) {
    if (!hostname) return false;
    return /(^|\.)sefaria\.org\.il$/i.test(hostname);
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatToday(lang) {
    const d = new Date();
    if (lang === "he") {
      return new Intl.DateTimeFormat("he-IL", { month: "long", day: "numeric" }).format(d);
    }
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return `${months[d.getMonth()]} ${ordinal(d.getDate())}`;
  }

  function calendarTitleFor(item, lang) {
    if (!item || !item.title) return "";
    if (lang === "he") return item.title.he || TITLE_HE[item.title.en] || item.title.en || "";
    return item.title.en || "";
  }

  function refDisplayFor(item, lang) {
    if (!item) return "";
    const dv = item.displayValue || {};
    if (lang === "he") return dv.he || item.ref || "";
    return dv.en || item.ref || "";
  }

  function commentaryLabel(name, lang) {
    if (!name) return "";
    if (lang === "he") return COMMENTARY_HE[name] || name;
    return name;
  }

  function originFor(lang) {
    return lang === "he" ? "https://www.sefaria.org.il" : "https://www.sefaria.org";
  }

  globalThis.SefariaI18n = {
    STRINGS,
    TITLE_HE,
    COMMENTARY_HE,
    isHebrewHost,
    formatToday,
    calendarTitleFor,
    refDisplayFor,
    commentaryLabel,
    originFor,
  };
})();

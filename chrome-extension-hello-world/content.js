(() => {
  const MARKER_CLASS = "sefaria-hello-world-marker";
  const CALENDARS_URL = "https://www.sefaria.org/api/calendars";

  function displayTitleFor(item) {
    return (item && item.title && item.title.en) || "";
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatToday() {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const d = new Date();
    return `${months[d.getMonth()]} ${ordinal(d.getDate())}`;
  }

  async function markCalendarDone(displayTitle) {
    if (!displayTitle) return;
    const { pending = [], done = [] } = await chrome.storage.local.get(["pending", "done"]);
    const updates = {};
    if (pending.includes(displayTitle)) {
      updates.pending = pending.filter((t) => t !== displayTitle);
    }
    if (!done.includes(displayTitle)) {
      updates.done = [...done, displayTitle];
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  }

  let calendarItemsPromise = null;

  function fetchCalendarItems() {
    if (!calendarItemsPromise) {
      calendarItemsPromise = fetch(CALENDARS_URL, { credentials: "omit" })
        .then((r) => r.json())
        .then((data) => (data && data.calendar_items) || [])
        .catch((err) => {
          console.warn("[Sefaria Hello World] calendars fetch failed", err);
          return [];
        });
    }
    return calendarItemsPromise;
  }

  // Parse "Book Chapter[:Verse]" — chapter may have an a/b suffix (Talmud).
  // Returns { book, chapter, verse|null } or null.
  function parseRefParts(ref) {
    const m = String(ref).match(/^(.+?)\s+(\d+[ab]?)(?::(\d+))?$/);
    if (!m) return null;
    return { book: m[1], chapter: m[2], verse: m[3] ? parseInt(m[3], 10) : null };
  }

  // Parse a calendar ref into a range. Handles:
  //   "Joshua 2"                  -> chapter-only
  //   "Chullin 20"                -> daf-only (Talmud; matches 20a + 20b)
  //   "Judges 13:2-25"            -> same-chapter verse range
  //   "Mishnah Kelim 4:1-2"       -> same-chapter verse range
  //   "Deuteronomy 14:22-16:17"   -> cross-chapter verse range
  //   "Ezekiel 47:12-48:35"       -> cross-chapter verse range
  function parseRange(ref) {
    if (!ref) return null;
    const dashIdx = ref.indexOf("-");
    if (dashIdx === -1) {
      const p = parseRefParts(ref);
      if (!p) return null;
      return {
        book: p.book,
        startChapter: p.chapter,
        startVerse: p.verse,
        endChapter: p.chapter,
        endVerse: p.verse,
      };
    }
    const before = ref.slice(0, dashIdx).trim();
    const after = ref.slice(dashIdx + 1).trim();
    const startParts = parseRefParts(before);
    if (!startParts) return null;
    let endChapter, endVerse;
    if (after.includes(":")) {
      const am = after.match(/^(\d+[ab]?):(\d+)$/);
      if (!am) return null;
      endChapter = am[1];
      endVerse = parseInt(am[2], 10);
    } else if (startParts.verse !== null) {
      endChapter = startParts.chapter;
      endVerse = parseInt(after, 10);
    } else {
      endChapter = after;
      endVerse = null;
    }
    return {
      book: startParts.book,
      startChapter: startParts.chapter,
      startVerse: startParts.verse,
      endChapter,
      endVerse,
    };
  }

  // [chapterNumber, amudOrder] — "20" -> [20,0], "20a" -> [20,0], "20b" -> [20,1]
  function chapterKey(chap) {
    const m = String(chap).match(/^(\d+)([ab]?)$/);
    if (!m) return null;
    return [parseInt(m[1], 10), m[2] === "b" ? 1 : 0];
  }

  function refInRange(candidate, range) {
    const c = parseRefParts(candidate);
    if (!c) return false;
    if (c.book !== range.book) return false;

    const cK = chapterKey(c.chapter);
    const sK = chapterKey(range.startChapter);
    const eK = chapterKey(range.endChapter);
    if (!cK || !sK || !eK) return false;

    const startHasSuffix = /[ab]$/.test(range.startChapter);
    const endHasSuffix = /[ab]$/.test(range.endChapter);

    if (cK[0] < sK[0] || cK[0] > eK[0]) return false;
    if (cK[0] === sK[0] && startHasSuffix && cK[1] < sK[1]) return false;
    if (cK[0] === eK[0] && endHasSuffix && cK[1] > eK[1]) return false;

    // Chapter-only / daf-only range: any verse (or no verse) qualifies.
    if (range.startVerse === null && range.endVerse === null) return true;

    if (
      cK[0] === sK[0] &&
      (!startHasSuffix || cK[1] === sK[1]) &&
      range.startVerse !== null &&
      c.verse !== null &&
      c.verse < range.startVerse
    ) {
      return false;
    }
    if (
      cK[0] === eK[0] &&
      (!endHasSuffix || cK[1] === eK[1]) &&
      range.endVerse !== null &&
      c.verse !== null &&
      c.verse > range.endVerse
    ) {
      return false;
    }
    return true;
  }

  // Walk all [data-ref] elements in DOM order; pick the last whose ref is inside
  // the range AND that contains a p.segmentText. Return that p.segmentText.
  function findLastSegmentInRange(range) {
    const candidates = document.querySelectorAll("[data-ref]");
    let lastPSeg = null;
    for (const el of candidates) {
      const dr = el.getAttribute("data-ref");
      if (!refInRange(dr, range)) continue;
      const ps = el.querySelectorAll("p.segmentText");
      if (ps.length) lastPSeg = ps[ps.length - 1];
    }
    return lastPSeg;
  }

  function removeMarker() {
    document.querySelectorAll("." + MARKER_CLASS).forEach((el) => el.remove());
  }

  async function maybeAppendHelloWorld() {
    const items = await fetchCalendarItems();
    if (!items.length) {
      removeMarker();
      return;
    }

    const { selected = [] } = await chrome.storage.local.get(["selected"]);
    if (!selected.length) {
      removeMarker();
      return;
    }

    let anchor = null;
    let matchedItem = null;
    for (const item of items) {
      const displayTitle = displayTitleFor(item);
      if (!selected.includes(displayTitle)) continue;
      const range = parseRange(item.ref);
      if (!range) continue;
      const candidate = findLastSegmentInRange(range);
      if (candidate) {
        anchor = candidate;
        matchedItem = item;
        break;
      }
    }

    if (!anchor) {
      removeMarker();
      return;
    }

    const displayTitle = displayTitleFor(matchedItem);
    const existing = document.querySelector("." + MARKER_CLASS);
    if (
      existing &&
      existing.previousElementSibling === anchor &&
      existing.dataset.calendarTitle === displayTitle
    ) {
      return;
    }
    if (existing) existing.remove();

    const wrapper = document.createElement("div");
    wrapper.className = MARKER_CLASS;
    wrapper.dataset.calendarTitle = displayTitle;

    const msg = document.createElement("div");
    msg.className = MARKER_CLASS + "-msg";
    msg.textContent = `End of ${displayTitle} learning for ${formatToday()}`;
    wrapper.appendChild(msg);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = MARKER_CLASS + "-btn";
    btn.textContent = "I'm Done!";
    btn.addEventListener("click", () => {
      markCalendarDone(displayTitle);
      btn.disabled = true;
      btn.textContent = "Done ✓";
    });
    wrapper.appendChild(btn);

    anchor.insertAdjacentElement("afterend", wrapper);
  }

  maybeAppendHelloWorld();

  const observer = new MutationObserver(() => {
    maybeAppendHelloWorld();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      maybeAppendHelloWorld();
    }
  }, 500);
})();

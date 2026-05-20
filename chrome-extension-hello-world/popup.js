const CALENDARS_URL = "https://www.sefaria.org/api/calendars";

const SUPPORTED_TITLES = ["Daf Yomi", "Daily Mishnah", "929"];

const COMMENTARIES = {
  "Daf Yomi": ["Rashi", "Tosafot", "Steinsaltz", "Rashba", "Maharsha"],
  "Daily Mishnah": ["Bartenura", "English Explanation of Mishnah", "Yachin", "Boaz", "Tiferet Yisrael"],
  "929": ["Rashi", "Ibn Ezra", "Ramban", "Radak", "Sforno"],
};

let LANG = "en";
let T = SefariaI18n.STRINGS.en;

async function detectLang() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const u = new URL(tab.url);
      if (SefariaI18n.isHebrewHost(u.hostname)) return "he";
    }
  } catch (e) {
    // ignore — default to English
  }
  return "en";
}

function titleEn(item) {
  return (item && item.title && item.title.en) || "";
}

function pickSupportedItems(items) {
  const byTitle = new Map();
  for (const item of items) {
    const t = titleEn(item);
    if (!t || byTitle.has(t)) continue;
    byTitle.set(t, item);
  }
  const picked = [];
  for (const wanted of SUPPORTED_TITLES) {
    const item = byTitle.get(wanted);
    if (!item) continue;
    picked.push({ item, storageKey: wanted });
  }
  return picked;
}

function refToUrlPath(ref) {
  return ref.replace(/ /g, "_").replace(/:/g, ".");
}

function itemUrl(item, commentary) {
  const origin = SefariaI18n.originFor(LANG);
  const path = item.url || refToUrlPath(item.ref || "");
  const base = `${origin}/${path.replace(/^\/+/, "")}`;
  if (!commentary) return base;
  const lang2 = LANG === "he" ? "he" : "en";
  return `${base}?lang=bi&with=${encodeURIComponent(commentary)}&lang2=${lang2}`;
}

function renderMessage(cls, text) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  list.appendChild(li);
}

async function toggleSelection(storageKey, checked) {
  const { selected = [] } = await chrome.storage.local.get(["selected"]);
  const set = new Set(selected);
  if (checked) set.add(storageKey);
  else set.delete(storageKey);
  await chrome.storage.local.set({ selected: Array.from(set) });
}

async function setCommentary(storageKey, commentary) {
  const { commentaries = {} } = await chrome.storage.local.get(["commentaries"]);
  if (commentary) commentaries[storageKey] = commentary;
  else delete commentaries[storageKey];
  await chrome.storage.local.set({ commentaries });
}

async function render(entries) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  if (!entries.length) {
    renderMessage("empty", T.empty);
    return;
  }
  const { selected = [], done = [], commentaries = {} } = await chrome.storage.local.get([
    "selected",
    "done",
    "commentaries",
  ]);
  const selectedSet = new Set(selected);
  const doneSet = new Set(done);

  for (const { item, storageKey } of entries) {
    const displayTitle = SefariaI18n.calendarTitleFor(item, LANG);

    const li = document.createElement("li");
    li.className = "schedule-row";

    const topRow = document.createElement("div");
    topRow.className = "schedule-top";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "schedule-checkbox";
    checkbox.checked = selectedSet.has(storageKey);
    checkbox.addEventListener("change", () => {
      toggleSelection(storageKey, checkbox.checked);
    });

    const a = document.createElement("a");
    a.className = "schedule-link";
    a.href = itemUrl(item, commentaries[storageKey]);
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const titleEl = document.createElement("div");
    titleEl.className = "schedule-title";
    titleEl.textContent = displayTitle;

    const refEl = document.createElement("div");
    refEl.className = "schedule-ref";
    refEl.textContent = SefariaI18n.refDisplayFor(item, LANG);

    a.appendChild(titleEl);
    a.appendChild(refEl);

    topRow.appendChild(checkbox);
    topRow.appendChild(a);

    if (doneSet.has(storageKey)) {
      const medal = document.createElement("span");
      medal.className = "schedule-medal";
      medal.textContent = "🥇";
      medal.title = T.completed;
      topRow.appendChild(medal);
    }

    li.appendChild(topRow);

    const options = COMMENTARIES[storageKey] || [];
    if (options.length) {
      const commentaryRow = document.createElement("div");
      commentaryRow.className = "commentary-row";

      const label = document.createElement("label");
      label.className = "commentary-label";
      label.textContent = T.learnWith;

      const select = document.createElement("select");
      select.className = "commentary-select";

      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = T.selectCommentary;
      select.appendChild(defaultOpt);

      for (const c of options) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = SefariaI18n.commentaryLabel(c, LANG);
        if (commentaries[storageKey] === c) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener("change", async () => {
        await setCommentary(storageKey, select.value);
        a.href = itemUrl(item, select.value);
      });

      const selectId = `commentary-${storageKey.replace(/\s+/g, "-")}`;
      select.id = selectId;
      label.htmlFor = selectId;

      commentaryRow.appendChild(label);
      commentaryRow.appendChild(select);
      li.appendChild(commentaryRow);
    }

    list.appendChild(li);
  }
}

document.getElementById("confirm-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "confirm" });
  window.close();
});

function fetchAndRender() {
  return fetch(CALENDARS_URL)
    .then((r) => r.json())
    .then((data) => render(pickSupportedItems((data && data.calendar_items) || [])))
    .catch((err) => {
      console.error(err);
      renderMessage("error", T.error);
    });
}

function applyStaticStrings() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === "he" ? "rtl" : "ltr";
  document.getElementById("header-text").textContent = T.todaysLearning;
  document.getElementById("confirm-btn").textContent = T.confirm;
  document.getElementById("today-date").textContent = `· ${SefariaI18n.formatToday(LANG)}`;
  const loading = document.querySelector("#schedule-list li.loading");
  if (loading) loading.textContent = T.loading;
}

(async () => {
  LANG = await detectLang();
  T = SefariaI18n.STRINGS[LANG];
  applyStaticStrings();
  fetchAndRender();
})();

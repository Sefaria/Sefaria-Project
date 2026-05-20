const CALENDARS_URL = "https://www.sefaria.org/api/calendars";
const SEFARIA_ORIGIN = "https://www.sefaria.org";

const SUPPORTED_TITLES = ["Daf Yomi", "Daily Mishnah", "929"];

const COMMENTARIES = {
  "Daf Yomi": ["Rashi", "Tosafot", "Steinsaltz", "Rashba", "Maharsha"],
  "Daily Mishnah": ["Bartenura", "English Explanation of Mishnah", "Yachin", "Boaz", "Tiferet Yisrael"],
  "929": ["Rashi", "Ibn Ezra", "Ramban", "Radak", "Sforno"],
};

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

function titleEn(item) {
  return (item && item.title && item.title.en) || "";
}

function displayName(rawTitle) {
  return rawTitle;
}

function pickSupportedItems(items) {
  const byTitle = new Map();
  for (const item of items) {
    const t = titleEn(item);
    if (!t || byTitle.has(t)) continue;
    byTitle.set(t, item);
  }
  const picked = [];
  const seenDisplay = new Set();
  for (const wanted of SUPPORTED_TITLES) {
    const item = byTitle.get(wanted);
    if (!item) continue;
    const key = displayName(wanted);
    if (seenDisplay.has(key)) continue;
    seenDisplay.add(key);
    picked.push({ item, displayTitle: key });
  }
  return picked;
}

function refToUrlPath(ref) {
  return ref.replace(/ /g, "_").replace(/:/g, ".");
}

function itemUrl(item, commentary) {
  const path = item.url || refToUrlPath(item.ref || "");
  const base = `${SEFARIA_ORIGIN}/${path.replace(/^\/+/, "")}`;
  if (!commentary) return base;
  return `${base}?lang=bi&with=${encodeURIComponent(commentary)}&lang2=en`;
}

function renderMessage(cls, text) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  list.appendChild(li);
}

async function toggleSelection(displayTitle, checked) {
  const { selected = [] } = await chrome.storage.local.get(["selected"]);
  const set = new Set(selected);
  if (checked) set.add(displayTitle);
  else set.delete(displayTitle);
  await chrome.storage.local.set({ selected: Array.from(set) });
}

async function setCommentary(displayTitle, commentary) {
  const { commentaries = {} } = await chrome.storage.local.get(["commentaries"]);
  if (commentary) commentaries[displayTitle] = commentary;
  else delete commentaries[displayTitle];
  await chrome.storage.local.set({ commentaries });
}

async function render(entries) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  if (!entries.length) {
    renderMessage("empty", "No supported schedules today.");
    return;
  }
  const { selected = [], done = [], commentaries = {} } = await chrome.storage.local.get([
    "selected",
    "done",
    "commentaries",
  ]);
  const selectedSet = new Set(selected);
  const doneSet = new Set(done);

  for (const { item, displayTitle } of entries) {
    const li = document.createElement("li");
    li.className = "schedule-row";

    const topRow = document.createElement("div");
    topRow.className = "schedule-top";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "schedule-checkbox";
    checkbox.checked = selectedSet.has(displayTitle);
    checkbox.addEventListener("change", () => {
      toggleSelection(displayTitle, checkbox.checked);
    });

    const a = document.createElement("a");
    a.className = "schedule-link";
    a.href = itemUrl(item, commentaries[displayTitle]);
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const titleEl = document.createElement("div");
    titleEl.className = "schedule-title";
    titleEl.textContent = displayTitle;

    const refEl = document.createElement("div");
    refEl.className = "schedule-ref";
    refEl.textContent = (item.displayValue && item.displayValue.en) || item.ref || "";

    a.appendChild(titleEl);
    a.appendChild(refEl);

    topRow.appendChild(checkbox);
    topRow.appendChild(a);

    if (doneSet.has(displayTitle)) {
      const medal = document.createElement("span");
      medal.className = "schedule-medal";
      medal.textContent = "🥇";
      medal.title = "Completed";
      topRow.appendChild(medal);
    }

    li.appendChild(topRow);

    const options = COMMENTARIES[displayTitle] || [];
    if (options.length) {
      const commentaryRow = document.createElement("div");
      commentaryRow.className = "commentary-row";

      const label = document.createElement("label");
      label.className = "commentary-label";
      label.textContent = "Learn with:";

      const select = document.createElement("select");
      select.className = "commentary-select";

      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "Select Commentary...";
      select.appendChild(defaultOpt);

      for (const c of options) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        if (commentaries[displayTitle] === c) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener("change", async () => {
        await setCommentary(displayTitle, select.value);
        a.href = itemUrl(item, select.value);
      });

      const selectId = `commentary-${displayTitle.replace(/\s+/g, "-")}`;
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
      renderMessage("error", "Could not load today's calendars.");
    });
}

document.getElementById("today-date").textContent = `· ${formatToday()}`;

fetchAndRender();

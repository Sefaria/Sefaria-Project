const CALENDARS_URL = "https://www.sefaria.org/api/calendars";
const SEFARIA_ORIGIN = "https://www.sefaria.org";

const SUPPORTED_TITLES = ["Daf Yomi", "Daily Mishnah", "929"];

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

function itemUrl(item) {
  const path = item.url || refToUrlPath(item.ref || "");
  return `${SEFARIA_ORIGIN}/${path.replace(/^\/+/, "")}`;
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

async function render(entries) {
  const list = document.getElementById("schedule-list");
  list.innerHTML = "";
  if (!entries.length) {
    renderMessage("empty", "No supported schedules today.");
    return;
  }
  const { selected = [], done = [] } = await chrome.storage.local.get(["selected", "done"]);
  const selectedSet = new Set(selected);
  const doneSet = new Set(done);

  for (const { item, displayTitle } of entries) {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "schedule-checkbox";
    checkbox.checked = selectedSet.has(displayTitle);
    checkbox.addEventListener("change", () => {
      toggleSelection(displayTitle, checkbox.checked);
    });

    const a = document.createElement("a");
    a.className = "schedule-link";
    a.href = itemUrl(item);
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

    li.appendChild(checkbox);
    li.appendChild(a);

    if (doneSet.has(displayTitle)) {
      const medal = document.createElement("span");
      medal.className = "schedule-medal";
      medal.textContent = "🥇";
      medal.title = "Completed";
      li.appendChild(medal);
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

fetchAndRender();

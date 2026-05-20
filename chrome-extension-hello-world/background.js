const NOTIFY_DELAY_MINUTES = 7 / 60; // 10 seconds
const ALARM_PREFIX = "notify:";
const BADGE_COLOR = "#d93025";
const SUPPORTED_TITLES = new Set(["Daf Yomi", "Daily Mishnah", "929"]);

async function getState() {
  const { selected = [], pending = [], done = [] } = await chrome.storage.local.get([
    "selected",
    "pending",
    "done",
  ]);
  return { selected, pending, done };
}

async function updateBadge() {
  const { pending } = await getState();
  const text = pending.length ? String(pending.length) : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

async function clearAllNotifyAlarms() {
  const all = await chrome.alarms.getAll();
  for (const a of all) {
    if (a.name.startsWith(ALARM_PREFIX)) await chrome.alarms.clear(a.name);
  }
}

async function confirmAndStartTimers() {
  await clearAllNotifyAlarms();
  await chrome.storage.local.set({ pending: [], done: [] });
  const { selected } = await getState();
  for (const title of selected) {
    chrome.alarms.create(ALARM_PREFIX + title, { delayInMinutes: NOTIFY_DELAY_MINUTES });
  }
}

async function prunePendingAndDone() {
  const { selected, pending, done } = await getState();
  const { commentaries = {} } = await chrome.storage.local.get(["commentaries"]);
  const newSelected = selected.filter((t) => SUPPORTED_TITLES.has(t));
  const selectedSet = new Set(newSelected);
  const updates = {};
  if (newSelected.length !== selected.length) updates.selected = newSelected;
  const newPending = pending.filter((t) => SUPPORTED_TITLES.has(t) && selectedSet.has(t));
  if (newPending.length !== pending.length) updates.pending = newPending;
  const newDone = done.filter((t) => SUPPORTED_TITLES.has(t) && selectedSet.has(t));
  if (newDone.length !== done.length) updates.done = newDone;
  const newCommentaries = {};
  let commentariesChanged = false;
  for (const [t, c] of Object.entries(commentaries)) {
    if (SUPPORTED_TITLES.has(t)) newCommentaries[t] = c;
    else commentariesChanged = true;
  }
  if (commentariesChanged) updates.commentaries = newCommentaries;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  const all = await chrome.alarms.getAll();
  for (const a of all) {
    if (!a.name.startsWith(ALARM_PREFIX)) continue;
    const title = a.name.slice(ALARM_PREFIX.length);
    if (!SUPPORTED_TITLES.has(title) || !selectedSet.has(title)) {
      await chrome.alarms.clear(a.name);
    }
  }
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(prunePendingAndDone);
chrome.runtime.onStartup.addListener(prunePendingAndDone);
prunePendingAndDone();

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.pending) updateBadge();
  if (changes.selected) {
    const selected = changes.selected.newValue || [];
    const selectedSet = new Set(selected);
    const { pending = [], done = [] } = await chrome.storage.local.get(["pending", "done"]);
    const updates = {};
    const newPending = pending.filter((t) => selectedSet.has(t));
    if (newPending.length !== pending.length) updates.pending = newPending;
    const newDone = done.filter((t) => selectedSet.has(t));
    if (newDone.length !== done.length) updates.done = newDone;
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    const all = await chrome.alarms.getAll();
    for (const a of all) {
      if (!a.name.startsWith(ALARM_PREFIX)) continue;
      const title = a.name.slice(ALARM_PREFIX.length);
      if (!selectedSet.has(title)) await chrome.alarms.clear(a.name);
    }
  }
});

let alarmQueue = Promise.resolve();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const title = alarm.name.slice(ALARM_PREFIX.length);
  alarmQueue = alarmQueue.then(async () => {
    const { selected, pending, done } = await getState();
    if (!selected.includes(title)) return;
    if (done.includes(title)) return;
    if (pending.includes(title)) return;
    await chrome.storage.local.set({ pending: [...pending, title] });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "confirm") {
    confirmAndStartTimers().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
});

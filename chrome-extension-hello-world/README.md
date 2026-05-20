# Sefaria Hello World — Chrome Extension

Appends a "Hello World" block at the end of the chapter the user is reading on sefaria.org — but only when the current page is part of one of Sefaria's scheduled learning calendars (Parashat Hashavua, Daf Yomi, Daily Mishnah, Tanakh Yomi, etc., fetched from `/api/calendars`).

## Install locally (unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select this folder: `chrome-extension-hello-world`.
5. Visit any text page on https://www.sefaria.org/ (e.g. https://www.sefaria.org/Genesis.1). You should see a blue "Hello World" box at the bottom of the chapter.

## Debugging

- **Content script logs / errors**: open DevTools on the sefaria.org tab (`Cmd+Opt+I`) → **Console**. Content script errors appear there.
- **Inspect the injected element**: in DevTools Elements, search for `sefaria-hello-world-marker`.
- **Reload after edits**: go to `chrome://extensions`, click the circular **reload** icon on the extension card, then refresh the sefaria.org tab.
- **Toggle the extension**: use the on/off switch on the extension card to verify behavior with it disabled.
- **Manifest errors**: shown at the top of the extension card on `chrome://extensions` — click "Errors" to see details.

## Files

- `manifest.json` — MV3 manifest, declares the content script for sefaria.org.
- `content.js` — finds the chapter container and appends the Hello World element; re-runs on SPA navigations via a `MutationObserver`.
- `content.css` — styles the Hello World block.

## Tweaking the target location

Sefaria is a single-page app, and the DOM differs across reader modes. `findChapterContainer()` in `content.js` tries several selectors in order. If the box appears in the wrong place (or not at all) on a given page, open DevTools, find the element that wraps the chapter text, and add its selector to the top of that function.

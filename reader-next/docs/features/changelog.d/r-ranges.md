## 2026-11-10 — ranges lane (wave 2): long ranges, keys that do not scroll, keyboard and touch selection

### Corrected

- **TXD-070** A range of whole sections longer than what loads with the page (`/Genesis.1-50`) is all blue at once and its address is
  written by its segments (`/Genesis.1.1-50.26`) in place once its last chapter is known, as on sefaria.org. It kept its address with
  no blue. _Verified_ 2026-11-10.
- **TXD-055** Only keys that scroll count as reading on, and a settled scroll ends it: Cmd+C or Shift after selecting a range no
  longer lets a later reflow drop the range. _Verified_ 2026-11-10 (sefaria.org keeps it).
- **CAL-002** The Daf Yomi card and `/todays-daf-yomi` land on both amudim written by segments (`/Bekhorot.53a.1-53b.17`), now
  required by the tests. _Verified_ 2026-11-10 for `/todays-daf-yomi`; sefaria.org's in-app card click shows `/Bekhorot.53a-53b`
  (one rule here, recorded).
- **RTE-027** A title with a backslash is a 404: root cause found (h3 decodes `%5C` in the request URL it shares with srvx), not in
  the ref codec; fix proposed for the server entry.

### Added

- **TXD-057** A selection made by keyboard (Shift+arrows) or touch (a long press) makes a range as a mouse one does. A deliberate
  difference: sefaria.org listens to mouseup only.

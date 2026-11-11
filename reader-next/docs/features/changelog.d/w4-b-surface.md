## 2026-11-10 — wave 4, lane b-surface: reading surface parity and keyboard behaviour

### Corrected (verified on www.sefaria.org the same day)

- **TXD-054 / TXD-056** First screen of a section opened with no verse: the column opens scrolled past its top strip, the section's title at the top of the text, and stays so while the previous section loads above (Psalms 23 opened on the end of Psalm 22; Genesis 1 showed the book-title strip). _Verified._
- **TXD-034** Stacked bilingual spacing: 10px Hebrew to English, 20px to the next verse, Hebrew right-aligned, the enlarged first letter at line-height 1.2 (Genesis 1:1 is 88px as live, was 107px). _Verified._
- **TXD-046** Phone continuous gutter: numbers and dots 4px from the screen's edges; colliding numbers step inwards where outwards would leave the page. No sideways scroll at 320-414px. _Verified._
- **TXD-011** Section headings: daf "ב׳ א" (not "ב."); complex books show their nodes without the book title ("Bereshit, Chapter 1", "Weekday, Shacharit, …"); other simple books "Chapter 1" / "Siman 1". _Verified._

### Built

- **SHL-071** With the sidebar open, Escape closes the sidebar only (it closed the panel and went to /texts). Recorded difference: from a verse with the sidebar open legacy closes both.
- **I18-003** Focus returns to the verse when the sidebar closes, and to the panel beside when one of several closes (status → done).
- **I18-005** A polite live region names the section the reader has moved into, once per section.
- **I18-013** Hebrew accessible names for the text panel's bar, its section regions and verse groups in the Hebrew interface.
- **SHL-017** Tab wraps inside the Text display options menu.

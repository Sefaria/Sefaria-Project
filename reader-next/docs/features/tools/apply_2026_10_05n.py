"""Findings of the text parity run (scripts/parity-text.mjs: segments of 36 texts x bi/he/en, live vs rebuild), 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-045", [
    "CORRECTION (VERIFIED 2026-10-05, Psalms 119 in Hebrew): Hebrew segment numbers are plain letters — א … יט טו טז … קיט — with NO geresh/gershayim ('טו', not 'ט״ו'). The rebuild had added punctuation.",
    "CORRECTION (VERIFIED, Zohar Bereshit 1 in English mode): the 'English' slot of Zohar is a Hebrew translation; its segments are numbered in HEBREW (א, ב) there. The rule 'a Hebrew-only segment in an English/bilingual panel shows an English numeral' holds for a Hebrew PRIMARY shown alone (Arukh HaShulchan 1:13 in English mode: '13' with the Hebrew text) but not for a Hebrew TRANSLATION. The number's language follows the slot and its direction.",
])
add("TXT-025", [
    "VERIFIED 2026-10-05: with lang=he on a text that has NOTHING in Hebrew (Philo, Teshuvot haRashba) the live reader rewrites the URL to lang=bi and shows the English text with English numerals and an English section heading ('Chapter 1'). The rebuild now turns such a panel bilingual.",
    "VERIFIED (Arukh HaShulchan, English mode): the translation array is shorter than the Hebrew (12 vs 29). A segment with an EMPTY translation entry (1:11) renders as an empty row with its number only; segments beyond the end of the translation (1:13, 1:14) fall back to the Hebrew text. Rebuild reproduces both.",
])
add("TXT-025", [
    "VERIFIED 2026-10-05 (Peri Megadim on Orach Chayim, Mishbezot Zahav 1, English mode): with no translation at all the segments are shown in Hebrew and numbered in Hebrew (א). Together with the Arukh HaShulchan case (a text WITH a translation: fallback segments keep English numbers) the numeral follows whether the panel is effectively Hebrew. Harness note: innerText of the live segment omits the number of the language class CSS hides; scripts/parity-text.mjs reads .segmentNumber too.",
])
add("TXD-025", [
    "BUG-COMPAT (VERIFIED 2026-10-05, Ramban on Genesis 1:1:3 English): the stored HTML is mis-nested — '(See <a>Rashi, <i>ibid.</a></i>) It was thus…' inside a footnote <i> — and the browser's HTML5 parser repairs it so the whole footnote stays hidden; a plain tag parser ends the footnote at the first </i> and leaks its tail ') It was thus … created.' into the text. The rebuild now repairs mis-nested inline markup with parse5 before extracting footnotes (src/lib/html/repair.ts).",
])
add("TXD-028", ["PARITY NOTE 2026-10-05: Vilna/Venice page markers are an empty <i data-overlay data-value> on the live site (shown by CSS, absent from innerText) and a text node in the rebuild; visually equivalent (small grey marker at the line start/end)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)

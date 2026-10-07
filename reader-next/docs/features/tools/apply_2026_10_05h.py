"""Dictionary lookup on selected words, verified on www.sefaria.org 2026-10-05 (Genesis 1:1). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("CON-042", [
    "VERIFIED 2026-10-05 (Genesis 1:1, lang=he, sidebar open): selecting בְּרֵאשִׁ֖ית pushes ONE history entry and rewrites the URL to ?lang=he&lookup=בְּרֵאשִׁ֖ית&with=Lexicon&lang2=en; the sidebar shows three dictionaries (BDB Augmented Strong, Jastrow, BDB).",
    "BUG (VERIFIED 2026-10-05): later selections update the sidebar and REPLACE the history entry, but the URL's lookup= stays on the FIRST word (reload shows the wrong word). The rebuild writes every lookup into the URL.",
    "VERIFIED 2026-10-05: 2–3 words are looked up (and show 'No definitions found for \"בְּרֵאשִׁ֖ית בָּרָ֣א\".'); 4 words do nothing (the sidebar content stays empty); with the sidebar CLOSED a selection does nothing; a link with lookup=…&with=Lexicon opens straight to the definitions.",
    "NOT confirmed: the atlas says clearing the selection returns the sidebar to Resources. A synthetic empty mouseup left the Lexicon in place. The rebuild leaves it in place.",
])
add_details("CON-043", [
    "VERIFIED 2026-10-05: request /api/words/<NFC word>?always_consonants=1&never_split=1&lookup_ref=Genesis 1:1; Genesis 1:1 shows BDB Augmented Strong (text_categories 'Tanakh, Torah'…), Jastrow and BDB (unrestricted). A word typed into the box is not filtered by category and sends no lookup_ref.",
    "Old quirk, NOT ported: shouldActivate tests /[\\s:\\u0590-\\u05ff.]+/, so ANY selection containing a space or period (an English phrase) is looked up and shows 'No definitions found'. The rebuild requires a Hebrew letter.",
])
add_details("CON-044", [
    "VERIFIED 2026-10-05: line-for-line identical text on the live site and in the rebuild for בְּרֵאשִׁ֖ית, וַיֹּ֥אמֶר and אֱלֹהִ֑ים (Strong's, Jastrow, BDB).",
    "BUG (from code, ReaderPanel-style template string in LexiconBox.renderBDBEntrySenses): `note` is a JSX element interpolated into a string, so a BDB sense with note=true would print '[object Object]' for the 'Note.' marker. The rebuild prints 'Note.'. Other old-markup problems fixed: <div> and bare <span> directly inside <ol>.",
    "Citation links come in two forms: <a class=\"refLink\" href data-ref> (Jastrow) and <a data-ref href> without the class (BDB). The old click handler only recognises .refLink, so BDB citations fall through to the entry click; the rebuild treats any a[data-ref] as a citation.",
])
add_details("TXD-057", [
    "The click that ends a drag-selection is ignored (old TextRange.handleClick: window.getSelection().type === 'Range'); the rebuild does the same in Segment. Selection text excludes segment numbers, link dots, footnote markers and bodies.",
])
add_details("SHL-053", ["VERIFIED 2026-10-05: a selection never opens a closed sidebar."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)

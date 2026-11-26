---
title: How to Format Citations for the Linker
excerpt: >-
  Learn about formatting citations to ensure they're recognized by the Sefaria
  Linker. 
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
## Citation Format

Sefaria's engineers have endeavored to build the Linker to capture as many references as possible. Generally speaking, if a title is written out in full, followed by the numeric references, the Linker will work well. Every text on Sefaria can be referenced, but some of them are trickier than others.

Please note the following details:

* Punctuation: Standard punctuation (e.g., spaces, commas, periods, and colons) shouldn't inhibit the Linker's recognition capabilities. 

* Dash: When using a dash or hyphen, please note that it indicates a range of verses or sections of text (see the examples below.)  Therefore, extra hyphens will cause confusion.

* Spelling Variants: The Linker recognizes a number of common spelling variants for texts in the Library.  For example: When citing "2 Kings", we'll recognize the titles Melachim Bet, Melachim II, Second Kings, 2 Kings, II Melachim, Kings II, II Melakhim, and II Kings.

* Chapter and Verse References: The Linker recognizes both chapter-level and verse-level references, as well as ranges of verses or chapters. Therefore, all of these are valid citations:

  * `Second Kings 2`
  * `II Kings, 2:5`
  * `II Kings 2 5`
  * `Kings II 2-4`
  * `2 Kings 2:3-6`
  * `Melachim II 2:3-3:3`

* Some texts use Talmudic numbering (and not just the Talmud). When citing these texts, we expect the references to appear in a talmudic form.  For example:

  * `Shabbat 7b`
  * `Zohar 2, 20b`  (referring to volume 2, page 20b)
  * `Rif Shabbat 7b` (referring to 7b in _dapei ha Rif_)

* Specifying Talmudic Citations: Make these more specific by adding segment numbers that match Sefaria's segmentation of the Talmud. These citations will look like `Shabbat 3b:6`. The Linker can also support ranges, like `Shabbat 3b:5-11`. You can find Sefaria's segment numbers in the margins of the text as displayed in the Sefaria Library. When you click a segment or highlight a range of segments, you will also see the segments reflected in the page URL. More specific citations allow the Linker to show users more relevant text in a pop-up, as the links will point to a more precise location. Precise links are also prioritized above more general links in the Web Pages section of the Sefaria Library Resource Panel that points to your site.

* Interwoven Titles: When a title is spelled out in a literary context, the linker will fail to catch the reference.  For example, `Mishnah Taanit 4:3` would work well, but `In the 3rd Mishnah of Taanit, chapter 4` would not be recognized.  In general, it's best to use complete citations, written explicitly. This will ensure most of the core Jewish canon (Tanakh, Mishnah, Tosefta, Talmud, Midrash, Zohar, etc.) is recognized and linked.

### Trickier Texts

Texts that have a complex structure are more challenging for the Linker to recognize.  For example, when citing the Four Questions of the Haggadah, this citation would work: `Haggadah, Magid, Four Questions`, as would a number of variants. However, it is unlikely that a citation like that will occur on its own. The Mishneh Torah presents a similar situation. While we record many variants of section names in the Mishneh Torah, citations are hard to get right without looking at the precise way in which the text is recorded in the Sefaria Library. In order to ensure you're always getting a correct reference, navigate to the text in the Sefaria Library, select the text in question, and copy the citation as it appears in the URL.

### Tip: Testing Citations With the Sefaria Library Search Bar

If you are trying to create a citation in a way that Sefaria can understand, you can use the Sefaria Library search bar to test it out. For example, if you type a recognized citation into the search bar and press enter, it will navigate directly to the text. If it performs a keyword search instead, the citation was not recognized. As you start typing into the search bar, you can use the autocomplete suggestions to see all of the spelling variations that Sefaria understands, which can help you get to the valid citation.

Alternatively, if you can find the text you are citing in Sefaria, the URL will include its citation in a way Sefaria understands. Make sure to replace `_` with ` `, and `.` with `:`.

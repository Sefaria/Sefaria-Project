---
title: Embed Linker v3 on Your Site
excerpt: >-
  Learn about the Sefaria Linker: A tool that links references on external
  webpages and links them to corresponding texts in the Sefaria Library.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
The Sefaria Linker automatically connects references to Jewish texts on pages across the internet to primary sources in the Sefaria Library, and vice versa. Websites that use the Sefaria Linker give their users direct on-site access to any primary sources they cite. The Linker also automatically links websites to the Sefaria Resource Panel, so Sefaria users exploring texts mentioned on your site see a direct link to the relevant content. In this way, Sefaria users may learn about your site.

Linker v3 offers advantages for both Hebrew and English content. It decreases incorrect links and catches many more types of citations. For documentation for the previous version, see [Linker v2](doc:linker-v2).

## Bookmarklet

Currently, there is no Javascript bookmarklet available for Linker v3. That being said, you can easily adapt the bookmarklet linked at the bottom of [this page](http://www.sefaria.org/linker) by following the documentation below.

## Embedding Code

Place this code on your web page, just before the `</body>` tag. These lines will work for a static HTML page. If your site loads content dynamically after the page loads (e.g., Single Page Applications), see the note at the bottom for dynamic sites.

```
	<script type="text/javascript" charset="utf-8" src="https://www.sefaria.org/linker.v3.js"></script>
	<script>
	    sefaria.link();
	</script>
```

## Options

Options can be passed to `sefaria.link()` as key-value pairs in an object.  See below for examples of this functionality.

### `mode`

The `mode` option affects how the found references behave.   If not specified, the default is "link" mode.  _Please note: In previous versions of the Linker, the default was "pop-up-click"._

The value of `mode` is one of the following strings:

* `"link"`: Any references are turned into links, which open in a new browser tab when clicked. No pop-up box with textual content appears.

* `"popup-click"`: When a user clicks on a reference, a pop-up box opens and displays the relevant textual content along with a link to the Sefaria Library.

### `contentLang`

This specifies the language used to display the text in the pop-up box. Options are `bilingual`, `english`, and `hebrew`. The default value is `bilingual`.

### `interfaceLang`

This specifies the language of the pop-up interface, which controls both the text in the bottom bar and its orientation (left-to-right or right-to-left). Options are `english` or `hebrew`. The default value is `english`.

### `excludeFromLinking`

This sets a CSS selector that selects elements on the page that you do _not_ want linked. This may be useful, for example, if you have page headers where links or pop-ups may be distracting. Anything within an existing `<a>` tag will be excluded by default. Citations that are found but excluded are still tracked for usage in the Web Pages section in the Sefaria Library, a panel that links Library users to sites across the web that reference a specific text. The value of the parameter is a string, which is any valid CSS selector.

### `whitelistSelector`

This sets a CSS selector that defines elements on the page that should always be searched for citations. This field shouldn't be required by default, since the Linker relies on heuristics to find the main page content. However, this parameter can be used when part of the page is missing.

### `dynamic`

Set this to true if the Linker is being called dynamically or if your page content changes dynamically after the initial page load. Normally, the Linker sends a tracking signal back to Sefaria and determines the page URL by checking the first canonical link tag on your page. However, most dynamic pages do not update this tag when their content changes. By setting `dynamic `to true, the linker will instead use window.href to get the current URL, ensuring that dynamically generated pages are tracked correctly.

### `popupStyles`

The `popupStyles` ption allows for custom styling of the pop-up box, so you can select colors, borders, fonts, and so forth.  If present, it must be a dictionary of JavaScript-style attributes and their values. See examples below.

### `hidePopupsOnMobile`

By default, to improve user experience, the Linker won't attempt to create pop-ups on small screens and instead defaults to the `link` mode. If you want to use popups on all screen sizes, set this parameter to `false`.

### `versionPreferencesByCorpus`

The pop-up window created by the Linker will automatically display the default version for each text. In order to specify preferred versions of a text, use this parameter. If the version title doesn't exist for that text, the Linker will use the default version. You can find the version titles for each book by visiting its Table of Contents and clicking on "Versions". For example, [here](https://www.sefaria.org/Genesis?tab=versions) are the versions for the book of Genesis currently available in the Sefaria Library. Each version preference must be organized by language and corpus in the following format:

```
{
   <other linker options>,
   "versionPreferencesByCorpus": {
      <corpus>: {
         <lang>: <version title>
      }
   }
}
```

`corpus` can take one of the following values: `Tanakh`, `Bavli`, `Yerushalmi`, `Mishnah`, `Midrash Rabbah`.

Below is an example of one such usage:

```json
{
   "versionPreferencesByCorpus": {
      "Tanakh": {
         "en": "The Koren Jerusalem Bible"
      },
      "Bavli": {
         "he": "Wikisource Talmud Bavli"
      }
   }
}
```

In the above example, "The Koren Jerusalem Bible" version will be used for English-language translations for all Tanakh texts, and the "Wikisource Talmud Bavli" version will be used for all Hebrew texts from the Babylonian Talmud. If one or both of the selected versions do not exist, the defaults will be used in their place.

### `debug`

If true, this will turn on debug mode, which may help to determine why a certain citation isn't being linked. In debug mode, citations will be surrounded by a colored border with the following meanings:

* Green border: citation successfully linked
* Red border: citation recognized but not successfully linked. This may be because the text does not exist in Sefaria's database, the citation was incorrectly marked, or the Linker has a bug. Please note that these citations will not appear when debug mode is set to false.
* Yellow border: citation was linked to multiple possible links because it was determined to be ambiguous. Please note that ambiguous citations will not appear when debug mode is set to false.

To report an issue with a citation in debug mode, click in the citation in question and select Report. The Report button only appears in debug mode.

## Deprecated options

The following options are no longer supported in version three of the Sefaria Linker

* `selector`
* `excludeFromTracking`
* `parenthesesOnly`
* `quotationOnly`

## Dynamic Sites

The Sefaria Linker's code searches for citations and creates links once when `sefaria.link()` is called. If you have a dynamic site on which content changes after page load, you can make additional calls to `sefaria.link()` any time your content changes. You should pass the parameter `{dynamic: true}` to ensure the linker recognizes the correct page URL if it has changed.

## Versions

Occasionally, we may update the Linker to provide additional functionality or modify the interface. If you plan on injecting custom styles, you may prefer to use a specific version of the linker. To do so, simply append the version number to the base file name of the linker (e.g,`linker.v3.js`). The unversioned `linker.js` file will always be the most up-to-date.

## Examples of Calling the Plugin With Options

Include elements with "Torah" class in the search for citations:

```
	sefaria.link({whitelistSelector: ".Torah"});
```

Invoke pop-up-click mode:

```
	sefaria.link({mode: "popup-click"});
```

Add custom styling to the pop-up box:

```
	sefaria.link({
		popupStyles: {
			color: "#e3fc11",
			border: '4em solid black' 
		}
	});
```

Do all of the above, together:

```
	sefaria.link({
		mode: "popup-click",
		whitelistSelector: ".Torah",
		popupStyles: {
			color: "#e3fc11",
                	border: '4em solid black' 
		}
	});
```

Use only Hebrew for the interface and content:

```
	sefaria.link({
		contentLang: "hebrew",
		interfaceLang: "hebrew"
	});
```

# Citation Format

Version three of the Sefaria Linker should be able to recognize most types of citations. Below are a few examples of the types of citations which should work:

* בראשית א
* רשי ראש השנה ד״ה אלא ביבנה
* פרק מאימתי
* פרק בתרא דפסחים
* שם פרק ג
* בראשית פרק א עד פרק ד

Please note: The Linker supports ibid/שם citations, although we recommend caution when linking them, as they currently cause many false positives.

Use the `debug` option defined above [above](#debug)  to investigate why a citation wasn't linked.

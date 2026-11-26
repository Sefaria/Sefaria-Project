---
title: 'The Educator Playbook: A Quick Guide to Vibe-Coding with Sefaria'
deprecated: false
hidden: false
metadata:
  robots: index
---
Welcome to the Educator’s Playbook! Below, you’ll find information about how to make sure you get the data you need from Sefaria’s database. Click the links below to see what to add to a specific prompt you have to ensure your AI Assistant is building the tool you intend it to build.

[I want to build with text data](https://developers.sefaria.org/#prompt-1-i-want-to-build-with-text-related-data)
[I want to build with learning schedules (i.e. Parasha, Daf Yomi etc)](https://developers.sefaria.org/#prompt-1-i-want-to-build-with-text-related-data)
[I want to build with linked texts data (how different texts connect)](https://developers.sefaria.org/docs/the-educator-playbook-a-quick-guide-to-vibe-coding-with-sefaria#prompt-3-i-want-to-build-with-data-about-linked-texts)
[I want to build with languages and translations of texts](https://developers.sefaria.org/docs/the-educator-playbook-a-quick-guide-to-vibe-coding-with-sefaria#prompt-3-i-want-to-build-with-data-about-linked-texts)
[I want my AI to see all the data available from Sefaria](https://developers.sefaria.org/docs/the-educator-playbook-a-quick-guide-to-vibe-coding-with-sefaria#prompt-3-i-want-to-build-with-data-about-linked-texts)

### Prompt #1: I want to build with text-related data

<br />To build with data related to texts, input your prompt, then add the following text in the line below your prompt. This will ensure that the AI Assistant uses the correct pathways to retrieve Sefaria’s data.

```text
The Addendum

When building this, please ONLY get texts from Sefaria via the most updated texts API endpoint, the documentation from developers.sefaria.org

Below is a summary of [https://developers.sefaria.org/reference/get-v3-texts](https://developers.sefaria.org/reference/get-v3-texts). Go to [https://developers.sefaria.org/reference/get-v3-texts.md](https://developers.sefaria.org/reference/get-v3-texts.md) to get the full documentation and OpenAPI spec.

This API endpoint fetches the text of a Jewish text passage (e.g., "Esther 1:1") from Sefaria, with more control over language and formatting than older versions of the API.
API Endpoint: GET /api/v3/texts/{tref}
Path parameter:
tref — a Sefaria reference like Esther 1.1, Berakhot 14b.2, or Rashi on Genesis 1:1:1. Give the most specific reference you have (a single verse/segment, or at least a full section).
Query Parameters:
Param    Purpose
`version`: Which version(s) of the text to return. Can be a language (hebrew), a language + specific edition (hebrew|Miqra according to the Masorah), or a special keyword such as 'source' (original language), 'translation', 'primary' (Sefaria's default pick), or 'all'. Can be repeated for multiple versions.
`fill_in_missing_segments`: 1 to fill gaps in a partial version using another version of the same language; defaults to 0.
`return_format`: Controls HTML/footnotes in the output - 'default' (raw), 'text_only' (strips all HTML/footnotes/refs), 'strip_only_footnotes', or 'wrap_all_entities' (wraps links/topic references in HTML).

What you get back: A JSON object with:
versions — the actual text you requested, plus metadata per version (title, language, direction, license, source, etc.)
available_versions — every other version that exists for this text, even ones you didn't request
Reference/navigation info — ref, heRef (Hebrew ref), next/prev refs, sectionRef, whether the ref spans multiple sections
Book metadata — title, categories (e.g. \["Tanakh", "Writings"]), sectionNames (e.g. \["Chapter", "Verse"]), titleVariants (alternate spellings), structural depth (textDepth, isComplex)
warnings — if a requested language/version doesn't exist, a note here instead of an error
Summary: When you call the Texts v3 API endpoint and give it a reference (and, optionally, a version/format), it will return the text plus everything you need to know about which edition it came from and how to navigate to nearby passages.

–

Fetch the complete documentation index at: [https://developers.sefaria.org/llms.txt](https://developers.sefaria.org/llms.txt). Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.
```

<br />

### Prompt #2: I want to build with learning schedules (i.e., Parashah, Daf Yomi, and similar)<br />

To build with learning schedules, input your prompt, then add the following text on the line below your prompt. This ensures that the AI Assistant knows the correct pathways to use to retrieve Sefaria’s data.

```text
The Addendum

When building this, please ONLY get calendars from Sefaria via their API, documented at developers.sefaria.org

Below is a summary of [https://developers.sefaria.org/reference/get-calendars](https://developers.sefaria.org/reference/get-calendars). Go to [https://developers.sefaria.org/reference/get-calendars.md](https://developers.sefaria.org/reference/get-calendars.md) to get the full documentation and OpenAPI spec.

For parashah breakdowns, see [https://developers.sefaria.org/reference/get-aliyot-by-parasha.md](https://developers.sefaria.org/reference/get-aliyot-by-parasha.md) and use in conjunction with the [https://developers.sefaria.org/reference/get-v3-texts.md](https://developers.sefaria.org/reference/get-v3-texts.md) endpoint to retrieve texts with those references.

This API endpoint returns the daily or weekly Jewish learning schedule for a given date (Torah portion, Daf Yomi, Daily Rambam, etc.).
Endpoint: GET /api/calendars
Query parameters:
Param   Purpose
`year`, `month`, `day`: Get the schedule for a specific date instead of today. All three must be supplied together, or it falls back to today's date.
`timezone`: Override the timezone (IANA format, e.g. America/New_York). Defaults to the client's timezone.
`diaspora`: 1 for the diaspora weekly Torah reading, 0 for the Israel reading.
custom
Pick a Haftarah tradition: `ashkenazi`, `sephardi`, or `edot hamizrach`.

What you get back:
date — the date the response covers
timezone — the timezone used
calendar_items — a list of learning-schedule entries for that date, each with:
title (en/he) — the name of the schedule (e.g., "Daf Yomi", "Parashat Hashavua")
displayValue (en/he) — the specific reading (e.g., "Bava Kamma 26")
ref / heRef — the Sefaria reference for that reading
url — the path to it on Sefaria
category — its primary category (Tanakh, Talmud, Halakhah, etc.)
order — display ordering used internally
optional description (en/he) and extraDetails (e.g., a breakdown of Torah readings for  a given parashah)
Summary: To find out what’s on the docket for daily learning — Daf Yomi, Torah portion, and all other calendars available on Sefaria — on a given day, call the Calendars API with no parameters. Otherwise, include a specific date and schedule to find the relevant information.
–

Fetch the complete documentation index at: [https://developers.sefaria.org/llms.txt](https://developers.sefaria.org/llms.txt). Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.
```

<br />

### Prompt #3: I want to build with data about linked texts

To build with linked texts, enter your prompt, then add the following text on the line below it. This ensures that the AI Assistant knows the correct pathways to use to retrieve Sefaria’s data.

```text
The Addendum

When building this, please ONLY get links from Sefaria via their API, documented at developers.sefaria.org

Below is a summary of [https://developers.sefaria.org/reference/get-related](https://developers.sefaria.org/reference/get-related), go to [https://developers.sefaria.org/reference/get-related.md](https://developers.sefaria.org/reference/get-related.md) to get the full documentation and OpenAPI spec.

This single call retrieves everything connected to a given text reference, including commentary links, user-created Sheets, Topics, manuscripts, and media.
Endpoint: GET /api/related/{tref}
Path Parameter:
tref — a Sefaria reference, e.g. Genesis 1:1, Berakhot 2a, or Rashi on Genesis 1:1.
What you get back from this single reference:
links — connections to other texts (e.g., commentaries, cross-references, or parallel passages). Each entry has the linked work's title (index_title), category (e.g., Commentary, Talmud), the ref you'd fetch to read it, and the compDate (composition date range, negative = BCE).
sheets — public user-made Sheets that reference this passage, with associated titles, URLs, owner info, view count, and any Topics tagged on the Sheet.
notes — a user's personal notes on the text. Always empty for third-party API calls, as these are only visible to the note's own author when logged in.
topics — Topics associated with this passage (e.g., "Parashat Devarim"), with bilingual title and description, as well as how strongly the two are related (order includes PageRank-style relevance scores).
manuscripts — scanned manuscript pages covering this passage, with image or thumbnail URLs and manuscript metadata (title, source, and description).
media — linked audio and video (e.g., Torah reading recordings), with URLs, start and end timestamps for the relevant clip, and license info.
Summary: When you pass this reference, you get back every piece of related content Sefaria has connected to the text in question. That includes five unique arrays (links, Sheets, Topics, manuscripts, and media), any of which may come back empty if nothing exists for the reference in question.

–

Fetch the complete documentation index at: [https://developers.sefaria.org/llms.txt](https://developers.sefaria.org/llms.txt). Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.
```

<br />

### Prompt #4: I want to build with languages and translations of texts

To build with languages and translations, input your prompt, then add the following text on the line below your prompt. This ensures that the AI Assistant knows the correct pathways to use to retrieve Sefaria’s data.

```text
The Addendum

When building this, please ONLY get texts from Sefaria via their API, documented at developers.sefaria.org

Below is a summary of [https://developers.sefaria.org/reference/get-translations-lang](https://developers.sefaria.org/reference/get-translations-lang), go to [https://developers.sefaria.org/reference/get-translations-lang.md](https://developers.sefaria.org/reference/get-translations-lang.md) to get the full documentation and OpenAPI spec.

It will be helpful to use this data in conjunction with the [https://developers.sefaria.org/reference/get-v3-texts.md](https://developers.sefaria.org/reference/get-v3-texts.md) endpoint to retrieve texts with those references, additionally [https://developers.sefaria.org/reference/get-translations.md](https://developers.sefaria.org/reference/get-translations.md) is another language-related endpoint which can help.

This API endpoint returns all texts on Sefaria that have a translation in a given language, grouped by category.
Endpoint: GET /api/texts/translations/{lang}
Path parameter:
lang — an ISO 639-1 language code (e.g., en, he, yi, fr, de, ar).
What you get back: A dictionary of texts translated into that language, organized by Sefaria's category and secondary category (e.g., Tanakh, Talmud, Halakhah, etc.). Each entry includes:
title — the book's title on Sefaria
url — base URL for the book
versionTitle — the title of that specific translation/edition
rtlLanguage — whether the text reads right-to-left (he) or left-to-right (en)
Summary: When you pass a language code, you’ll get back a categorized index of every book Sefaria has a translation for in that language. This is useful for building a browsable library filtered by language rather than looking up one text at a time.

–

Fetch the complete documentation index at: [https://developers.sefaria.org/llms.txt](https://developers.sefaria.org/llms.txt). Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.
```

<br />

### Prompt #5: I want my AI to see all the data available from Sefaria

To build generally with Sefaria’s data, input your prompt, then add the following text on the line below your prompt. This ensures that the AI Assistant knows the correct pathways to use to retrieve Sefaria’s data.

```text
The Addendum

Please retrieve Jewish texts to support this project from Sefaria.

Fetch the complete documentation index at: [https://developers.sefaria.org/llms.txt](https://developers.sefaria.org/llms.txt). Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

Typically, the most helpful endpoints are:
[https://developers.sefaria.org/reference/get-v3-texts.md](https://developers.sefaria.org/reference/get-v3-texts.md)
[https://developers.sefaria.org/reference/get-v2-index.md](https://developers.sefaria.org/reference/get-v2-index.md)
[https://developers.sefaria.org/reference/get-related.md](https://developers.sefaria.org/reference/get-related.md)
```

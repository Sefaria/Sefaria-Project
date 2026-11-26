---
title: The Disambiguator
excerpt: Precise linking improvements through citation disambiguation
deprecated: false
hidden: false
metadata:
  robots: index
---
[View source code →](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/helper/linker/disambiguator.py)

# Bringing Redemption to Citations: Building Sefaria's Citation Disambiguator

_The Rabbis taught in their famous statement in [Megillah 15a](https://www.sefaria.org/Megillah.15a.20?lang=he\&with=all\&lang2=he):_

> וְאָמַר רַבִּי אֶלְעָזָר אָמַר רַבִּי חֲנִינָא: כׇּל הָאוֹמֵר דָּבָר בְּשֵׁם אוֹמְרוֹ מֵבִיא גְּאוּלָּה לָעוֹלָם

_"Anyone who says a matter in the name of the one who said it brings redemption to the world."_

On Sefaria, one way this shows up is through links. When a text cites another text, we want readers to be able to click the citation and get to the right place.

That sounds simple, but rabbinic citations were written for people, not machines. An author might write “as it says in chapter 2,” “see there,” “in the Gemara,” or cite a page when they really mean one line on that page. A learned reader can often use the surrounding words to figure out what the author meant. A computer sees several possible destinations, or a reference that is technically correct but much too broad.

For example, a citation may point to Berakhot 19b, but the useful link is really to Berakhot 19b:1 (in Sefaria system). A citation may say only “chapter 2,” but the surrounding discussion makes clear which book’s chapter 2 is meant out of the all techinically possible options.

Over the past several months, we have been building Sefaria’s citation disambiguator: a system that uses the surrounding text to choose the specific source a citation is referring to.

## After the Linker

The linker first finds citations and possible refs. The disambiguator runs next, handling cases where the linker found a ref that is too broad, like a page or chapter, or found several possible refs for the same citation.

Broadly speaking, it handles two problems: overly broad citations and ambiguous citations.

## Problem #1: Citations That Are Too Broad

Many citations identify the correct book or chapter but stop short of the specific passage being discussed.

Consider this example from [Shemot Rabbah](https://www.sefaria.org/Shemot_Rabbah.29.9?lang=he\&with=all\&lang2=he):

> דבר אחר: אנכי ה' אלהיך, הה"ד (עמוס ג): אריה שאג מי לא יירא, וזהו דכתיב **(ירמיה י)**:
>
> **מי לא ייראך מלך הגוים כי לך יאתה**
>
> אמרו הנביאים לירמיהו: מה ראית לומר מלך הגוים...

The linker correctly identifies the citation as Jeremiah chapter 10.

But a human reader immediately notices that the quoted words:

> מי לא ייראך מלך הגוים

appear specifically in [Jeremiah 10:7](https://www.sefaria.org/Jeremiah.10.7?lang=he):

> **מי לא ייראך מלך הגוים כי לך יאתה כי בכל חכמי הגוים ובכל מלכותם מאין כמוך**

Linking to Jeremiah 10 is technically correct, but linking to Jeremiah 10:7 is much more useful. The challenge is teaching software to make the same inference.

## Problem #2: Citations That Are Ambiguous

Some citations are not merely broad. They are genuinely ambiguous.

Consider this example from [Malbim Beur Hamilot on Isaiah](https://www.sefaria.org/Malbim_Beur_Hamilot_on_Isaiah.26.7.1?lang=he\&with=all\&lang2=he):

> ,ומגביל לו שם מעגל הנאמר על דרך הסבובי, צדק ומשפט ומישרים כל מעגל טוב
>
> **('שם ב)**
>
> מישרים הוא הדרך האמצעי

The highlighted citation simply says:

_"There, chapter 2."_

But where is "there"?

Earlier in the discussion, both Genesis and Proverbs had been mentioned. The linker therefore produces multiple candidates:

- Genesis 2
- Proverbs 2

A human reader resolves the ambiguity using the surrounding words:

> צדק ומשפט ומישרים

These words closely match [Proverbs 2:9](https://www.sefaria.org/Proverbs.2.9?lang=he):

> **אז תבין צדק ומשפט ומישרים כל מעגל טוב**

The correct destination is therefore Proverbs 2:9, not Genesis 2.

Notice that the key challenge here is not recognizing the citation or parsing its possible meanings. The linker can already identify **('שם ב)** as a citation and determine, syntactically, the refs it could point to. The part we are concerned with now is choosing the best option, which requires looking at the words amd context around it.

## A Compound Case: Broad and Ambiguous

Some citations contain both problems at once.

In [Ikar Tosafot Yom Tov on Mishnah Terumot](https://www.sefaria.org/Ikar_Tosafot_Yom_Tov_on_Mishnah_Terumot.8.8.1?lang=he\&with=all\&lang2=he), we find:

> אבל כשהם שתי חביות ברשות היחיד אין לטמא שתיהם...
>
> דלא ילפינן מסוטה דספק טומאה ברשות היחיד טמא אלא דבר שיכול להיות.
>
> ועיין בריש פרק ח' דנזיר

The highlighted citation means:

_"See the beginning of chapter 8 of Nazir."_

**This is not only a broad citation. It is also an ambiguous one.**

First, the system has to determine which Nazir is being cited. Does the author mean Mishnah Nazir, or Bavli Nazir? Then, after choosing the right work, it still has to determine what "the beginning of chapter 8" refers to more precisely; in this case, the correct resolution is [Nazir 57a:6](https://www.sefaria.org/Nazir.57a.6?lang=he\&with=all\&lang2=he).

In each case, the linker has found something real, but the result still needs refinement before it becomes a useful link.

## Building a Citation Disambiguator

To address these cases, we built a second-pass system that runs after Sefaria's linker has identified a citation but before the final link is created.

The disambiguator receives:

- The citation span identified by the linker
- The surrounding text in which the citation appears
- Two or more candidate references produced by the linker.

Its job is simple:

Given these candidates, determine the exact segment being referenced — or decline to make a decision if the evidence is insufficient.

## How It Works

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Stage
      </th>

      <th>
        What Happens
      </th>

      <th>
        Why It Matters
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        1. Linker output
      </td>

      <td>
        The standard linker identifies a citation span and produces one or more possible refs.
      </td>

      <td>
        The disambiguator starts with a bounded problem: refine a broad ref or choose among candidates.
      </td>
    </tr>

    <tr>
      <td>
        2. Context window
      </td>

      <td>
        The system loads the full citing text, normalizes it, and extracts the words around the citation.
      </td>

      <td>
        The surrounding discussion often contains the real clue.
      </td>
    </tr>

    <tr>
      <td>
        3. Dicta parallel matching
      </td>

      <td>
        The context is sent to Dicta's Parallels API, which looks for close textual matches.
      </td>

      <td>
        If the source is quoted or closely paraphrased, Dicta can often find the exact segment.
      </td>
    </tr>

    <tr>
      <td>
        4. Dicta review
      </td>

      <td>
        If Dicta finds a candidate, the system either accepts high-confidence non-segment matches directly or sends lower-confidence candidates to LLM confirmation.
      </td>

      <td>
        This preserves the shortcut for statistically strong Dicta matches while still checking less certain results.
      </td>
    </tr>

    <tr>
      <td>
        5. Keyword search fallback
      </td>

      <td>
        If Dicta finds no usable candidate, or if the LLM rejects a lower-confidence Dicta candidate, an LLM generates short keyword queries for Sefaria search.
      </td>

      <td>
        Search is the fallback path when Dicta does not produce an accepted resolution.
      </td>
    </tr>

    <tr>
      <td>
        6. Candidate narrowing
      </td>

      <td>
        If more than 25 candidates appear, the system ranks them by word overlap with the citing passage and keeps the strongest candidates.
      </td>

      <td>
        This keeps the final LLM decision focused without discarding smaller candidate sets unnecessarily.
      </td>
    </tr>

    <tr>
      <td>
        7. LLM selection and confirmation
      </td>

      <td>
        A model chooses among remaining candidates when needed and verifies that the citation really points there.
      </td>

      <td>
        The system remains conservative: better no link than a confident wrong one.
      </td>
    </tr>

    <tr>
      <td>
        8. Save resolution
      </td>

      <td>
        If confirmed, Sefaria updates the marked citation and creates the more precise link.
      </td>

      <td>
        The learner now lands closer to the text actually being cited.
      </td>
    </tr>
  </tbody>
</Table>


<Image src="https://files.readme.io/b984ed51cefba58c98b4189f30bd4f56e73949c7d96939028ac8eba8943fbaa2-image_3.png" align="center" />


##

## Why Some Matches Can Skip the LLM

Dicta's contribution has been central to this project. Their Parallels API gives the disambiguator a way to detect close textual matches across Jewish texts, which is often the strongest evidence that a broad or ambiguous citation points to a particular segment.

One useful feature of the system is that some cases can be resolved without an LLM call.

When Dicta returns a strong textual parallel, the disambiguator also checks how close the matched phrase appears to the citation span in the source text. If the Dicta score is high enough and the matched phrase is sufficiently nearby, the system accepts the match directly.

The thresholds for this shortcut were not chosen arbitrarily. These thresholds were derived by analyzing roughly 3,000 Dicta queries and comparing match score, phrase distance, and observed correctness.

For example, if a source writes:

> **(ירמיה י)**

and immediately quotes:

> **מי לא ייראך מלך הגוים**

then a close match to [Jeremiah 10:7](https://www.sefaria.org/Jeremiah.10.7?lang=he) is strong evidence that the broad citation points specifically to that verse.

More specifically, the disambiguator uses a direct-accept path when Dicta returns a high-scoring match and the matched phrase appears very close to the citation in the source text. If the original citation is section-level, the system accepts the match when the Dicta score is at least 5 and the matched phrase is within 10 characters of the citation span. For other cases, the bar is higher: the Dicta score must be at least 15, and the matched phrase must be within 5 characters.

## What Changed in Practice

One of the biggest changes is in Talmud citations. Historically, these links were not very visible to users at the level where Sefaria readers often need them most: the individual Talmud segment.

That is partly because Sefaria's Talmud segmentation follows the Koren-Steinsaltz edition. Older rabbinic authors, of course, did not cite the Talmud according to those modern segment boundaries. They cited a masekhet, a perek, a daf, or an amud. Those links were useful, but they usually stopped at a broader unit of text.

The disambiguator changes that. By comparing the surrounding citation context against candidate passages, it can turn many of those broader Talmud references into links to specific Talmudic segments. In practice, this has produced more than 440,000 Talmud segment resolutions, making a large body of previously broad citations much more directly useful to readers.

## Results

The impact has been substantial. So far, the disambiguator has helped resolve about **537,000 Bavli citations** and **32,000 Yerushalmi citations** to exact lines. It has also made more than **110,000 Tanakh citations** and more than **100,000 Halakhah citations** more precise.

Across the library, this work affected about **787,000 links in total**: roughly **320,000 new links** were added, and about **467,000 existing links** were modified
to point to more precise segment-level refs.


<Image src="https://files.readme.io/b8b229267ee0e3548f41661a1aa3a74bd4894f96f2b84fb0229ec02511263bd0-image.png" align="center" caption="Summary of Disambiguator impact" border={true} />


<br />


<Image src="https://files.readme.io/40c694ee9553bb3b4cf771f61e7c5e55d36071e318aa4206090b4abfcf0b92a0-image.png" align="center" caption="Reader sidebar view of Shabbat.88a.5 BEFORE disambiguator launch" border={true} framed={true} />


<br />


<Image src="https://files.readme.io/15a6be8e83fe9ceb05d3bd158777bd60d3afa77a0deb3e0ddd07a7bd08400d57-image.png" align="center" caption="Reader sidebar view of Shabbat.88a.5 AFTER disambiguator launch" border={true} framed={true} />


When a reader follows a citation from a midrash to a verse, from a commentary to a sugya, or from one commentator to another, they should arrive at the passage the author actually had in mind.

In a library built from those connections, even a single click matters.

As always, we welcome questions, ideas, and feedback. You can reach us any time at [developers@sefaria.org](mailto:developers@sefaria.org).

[View source code →](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/helper/linker/disambiguator.py)

<br />

<br />

---
title: Formatting within Sefaria Texts
excerpt: >-
  Learn more about the HTML supported by Sefaria, used for in-line text
  formatting, as well as adding footnotes, commentaries, and other in-text
  emphasis.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: text-references
      title: Text References
---
At times, texts in the Sefaria Library require an indication of a specific word or location within a larger segment of text. For example, a word or section of text may have specific formatting, but the structure outlined in [The Structure of a Book on Sefaria](doc:the-structure-of-a-text-on-sefaria) lacks a built-in method for this indication.

A common solution is to use HTML/XML tags within a segment, but this approach comes with a major drawback: Data within these tags is stored in the specific version of the text rather than in the index. If the data were stored in the index, it would provide a universal structure for all versions of the text. Unfortunately, this is the best method we currently have for including sub-segment level data. Below are a few examples of this type of tagging.

## Text Formatting

Formatting a text is a simple, single-step process. To do so, wrap the relevant text in an appropriate HTML tag. For example, to mark a word as bold, wrap it in a `<b>` tag. This approach is commonly used in commentaries that open with a quote from the text being commented on (_dibbur hamatkhil_, דיבור המתחיל).

## Footnotes

Footnotes contain two parts: (a) a marker, which is usually a number, and (b) text. Footnotes can be added to a text using a `<sup class="footnote-marker">` tag for the marker and an `<i class="footnote">` tag for the text. 

For example, this segment contains a footnote:

`The main text is here <sup class="footnote-marker">1</sup><i class="footnote">The text inside the footnote</i>and the main text continues here.`

To see how a footnote appears in the Sefaria Library, see the asterisk in the first verse of the book of Genesis in [this version](https://www.sefaria.org/Genesis.1.1?ven=The_Contemporary_Torah,_Jewish_Publication_Society,_2006\&lang=bi\&aliyot=0).

## Inline References

Some commentaries refer to a specific word or phrase within another text, but will not quote the relevant text. In printed books, this may appear as a marker, similar to a footnote. In the Sefaria Library, however, it would not be appropriate to place an entire commentary inside the referenced text, as is done with footnotes. Therefore, inline references are displayed as a small marker within the segment, viewable only when a user has selected a commentary that requires such a reference in the Resource Panel.

Creating an inline reference requires that data exist both within the text segment and in the link between the commentator and the parent text. To achieve this, the parent segment must contain an `<i>` tag with the CSS properties `data-commentator` and `data-order`, and the `data-commentator` field must match the `collective_title` of the text.

For example, in the case of `Rashi on Genesis`, the `data-commentator` field would match the `collective_title` of `Rashi`, and the `data-order` field will usually match the segment number of the linked comment. An exception to this rule is when individual comments are so long that they have their own internal structure, in which case the section number can be used. In addition, an optional `data-label` can be added as an all-purpose override of any display logic. When an optional `data-label`is added, whatever it is set to is what will be displayed.

Please note: The link object requires the field `inline_reference`. The value of `inline_reference` will be a dictionary with keys `data-commentator`, `data-order` and `data-label`(optional) with values that are identical to what was set in the `<i>` tag in the parent segment.

For example, if the parent segment is:
`Lorem ipsum <i data-commentator="Child" data-order="1"></i>consectetur adipiscing elit.`

The link object will be:

```
{
    'refs': ['Parent 1:1', 'Child 1:1'],
    'type': 'commentary',
    'inline_reference': {
        'data-commentator': "Child",
        'data-order': 1
    }
}
```

Here, as well, the `data-commentator` field must match the `collective_title` of the commentator.

## Allowed HTML Tags and Attributes

Below is a chart of all of the allowed HTML tags in Sefaria Library texts, with their corresponding attributes (if any) and the ways in which they are used within the Library:

### Allowed HTML Tags with Corresponding Attributes

The following is a list of allowed HTML tags with associated attributes. The table provides insight into both the tags and attributes supported by Sefaria and how we use them in the texts in our library.

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Tag
      </th>

      <th>
        Attributes
      </th>

      <th>
        Use in Sefaria Texts
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        `<i>`
      </td>

      <td>
        `class`

        `dir`

        `data-overlay`

        `data-value`

        `data-commentator`

        `data-order`

        `data-label`
      </td>

      <td>
        There are three uses of `<i>` tags:  
        1. **Footnotes**: Uses content internal to the`<i>` tag, as explained above.  
        2. **Commentary Placement**: Uses the `data-commentator`, `data-order` and `data-label` attributes, as explained above.
        3. **Structure Placement**: Indicates page transitions and uses the `data-overlay` and `data-value` attributes.

        The `class` attribute is used for CSS styling, as is standard.

        The `dir` attribute is used to indicate text direction inline. For example, `rtl` is used for a text that is read from right to left, and `ltr` is used for a text that is read from left to right.
      </td>
    </tr>

    <tr>
      <td>
        `<img>`
      </td>

      <td>
        `src`

        `alt`
      </td>

      <td>
        This tag is used for images in text, as seen in [Mishnat Eretz Yisrael](https://www.sefaria.org/Mishnat_Eretz_Yisrael_on_Pirkei_Avot.1.1.42?lang=en\&with=all\&lang2=en).

        `src` is the URL to the image.

        `alt` is an alt-text for the image.
      </td>
    </tr>

    <tr>
      <td>
        `<sup>`
      </td>

      <td>
        `class`
      </td>

      <td>
        This tag is used for footnotes. For more on footnotes see above.
      </td>
    </tr>

    <tr>
      <td>
        `<span>`
      </td>

      <td>
        `class`

        `dir`
      </td>

      <td>
        This tag is used inline for text when specific CSS styling (or direction) needs to be applied to a specific sub-segment of the text.
      </td>
    </tr>

    <tr>
      <td>
        `<a>`
      </td>

      <td>
        `dir`

        `class`

        `href`

        `data-ref`

        `data-ven`

        `data-vhe`

        `data-scroll-link`
      </td>

      <td>
        This tag is used for links featured within a version of the text. The attributes specific to Sefaria are as followed:

        `data-ref`: A way to refer to the `Ref` of the given text inline  
        `data-ven`: A way to refer to the English version of a text inline  
        `data-vhe`: A way to refer to the Hebrew version of a text inline  
        `data-scroll-link`: A way to contain a link within the same book, and, upon clicking, scroll to the new segment of the text instead of opening the text in a new panel.
      </td>
    </tr>
  </tbody>
</Table>

### Allowed HTML Tags

The following tags are allowed on Sefaria, and do not have any supported attributes associated with them.

| Tag        | Use in Sefaria Texts                                                                                                                                                                                                                                                    |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<b>`      | This tag is used to mark a segment of the text as bold, such as in the above example of emphasizing a _dibbur hamatkhil_.                                                                                                                                               |
| `<br>`     | This tag is used to create line breaks in a text. Sefaria does not support use of `<p>` within a version of a text.                                                                                                                                                     |
| `<strong>` | This tag provides another way of bolding sections of a text, present in some versions.                                                                                                                                                                                  |
| `<em>`     | This tag provides another way of italicizing sections of a text, present in some versions.                                                                                                                                                                              |
| `<sub>`    | This tag provides a way to include subscripts.                                                                                                                                                                                                                          |
| `<u>`      | This is an outdated tag, used for underlining a portion of the text. Modern web development encourages the use of CSS for all text styling. This tag is supported, since it might be present in old digitized versions of Jewish texts inherited by Sefaria.            |
| `<big>`    | This is an outdated tag, used for increasing the size of a portion of the text. Modern web development encourages the use of CSS for all text styling. This tag is supported, since it might be present in old digitized versions of Jewish texts inherited by Sefaria. |
| `<small>`  | This is an outdated tag, used for decreasing the size of a portion of the text. Modern web development encourages the use of CSS for all text styling. This tag is supported, since it might be present in old digitized versions of Jewish texts inherited by Sefaria. |

<br />

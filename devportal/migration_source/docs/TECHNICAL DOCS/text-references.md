---
title: Text References
excerpt: >-
  The core of Sefaria's system is the system of text references. Understanding
  how they work is key to using our API and our broader codebase.
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
      slug: topic-ontology
      title: Topic Ontology
---
# Text References (Citations)

Sefaria's infrastructure depends on the ability to unambiguously refer to specific segments of text in the repository. Text reference implementation is done in order to achieve the following goals:

* References should be human and machine-readable.
* References should be environment agnostic (i.e., they should not depend on database IDs).
* References should be flexible so as to accommodate human variation, such as alternate spellings.

The following are all valid refs:

* `Bereishit`
* `Job 3`
* `Mishna Berakhot 4.2`
* `Sanhedrin 4b`
* `Ex. 12:2-8`
* `Song_of_Songs.2.4-3.3`
* `Berakhot.2a.10-13`
* `Rashi on Genesis 1:2:1`
* `M. Peah 3`
* `Rambam Laws of Repentance 2:1`
* `Masekhet Shabbat 7b:12-20`
* `Pirkei_Avot_2.1`
* `Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani`

A valid ref consists of a title string, optionally followed by a sections string. A title string is any one of the known text titles or title variants. A section string lists sections of the text.

<Image align="center" alt="Various Valid Sefaria Refs, composed of a Title String and a Sections String" caption="Various Valid Sefaria Refs, composed of a Title String and a Sections String" src="https://files.readme.io/b9c1dec-ref.drawio_1.png" width="70% " />

## Section String Separators

Section Strings can be separated by any of the following characters:

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Separator
      </th>

      <th>
        Name
      </th>

      <th>
        Examples
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        `.`
      </td>

      <td>
        Period
      </td>

      <td>
        `Genesis 1.1`  
        `Berakhot 2a.1`
      </td>
    </tr>

    <tr>
      <td>
        `,`
      </td>

      <td>
        Comma
      </td>

      <td>
        `Genesis 1,1`  
        `Berakhot 2a,1`
      </td>
    </tr>

    <tr>
      <td>
        ` `
      </td>

      <td>
        Space
      </td>

      <td>
        `Genesis 1 1`  
        `Berakhot 2a 1`
      </td>
    </tr>

    <tr>
      <td>
        `:`
      </td>

      <td>
        Colon
      </td>

      <td>
        `Genesis 1:1`  
        `Berakhot 2a:1`
      </td>
    </tr>
  </tbody>
</Table>

A ranged text is indicated by use of a `-` hyphen character. The following are valid examples of ranged refs:

* `Genesis 1:1-2`
* `Genesis 1:1-2:1`
* `Rashi on Genesis 1:1:3-2:3:1`

## Notes

* Talmud references use a special _daf_ syntax, which allows for the presence of both a number and either 'a' or 'b' (e.g., `Shabbat 31a` or `Pesachim 22b`).
* Commentary text names inherit the structure (i.e., the depth and section names) of their base text and add an additional level called 'Comment'. For example, the ref `Ramban on Genesis 4:5:2` refers to Ramban's second comment on the fifth verse of chapter four of the book of Genesis.
* Within a sections string, `.` `,` `:`   are all interchangeable.
* The range separator ( "-" ) should appear either 0 or 1 times, and should never appear in the title string.
* Spaces may be replaced with _ for better display in URLs, but not by "-" because a hyphen represents a range separator.

## Classes of References Not Yet Supported

* A reference whose location is defined by its target, such as `שם` or `ibid`. Please note that partial references can include `להלן`, `לקמן`, `בסימן`, and similar. 
* References by _Dibbur HaMatkhil_
* References by chapter Name (i.e., `Keitzad Mevarchim`)
* References in the discursive flow of the text

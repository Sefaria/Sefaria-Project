# encoding=utf-8

"""
Script to convert Footnotes in B'Mareh HaBazak to standard footnote format. At the time this project was issued, the
footnotes looked like this:

***
Text Text<sup>1</sup> Text Text....
~~~<sup>2</sup>~~~
~~~~
<br>______<br>
<sup>1</sup> Footnote text
<sup>2</sup> Footnote text
***

The objective of this script is to move to the standard footnote scheme:
***
Lorem ipsum dolor sit amet, <sup>1</sup><i class="footnote>The text inside the footnote</i>consectetur adipiscing elit.
***

Method:
1) Check the each section contains one and only one segment with the <br>_____<br> pattern
2) Assuming that holds up, use pattern to identify footnotes and footnote markers.
3) Check that a 1-to-1 matching can be established between footnote markers and footnotes.
4) Set up proper footnotes. Footnotes can be long; combine paragraphs with <br> tags.
5) Remove <br>_____<br> and everything below.
"""


"""
Add versions notes to certain text versions.
"""
from sefaria.model import *

versions = VersionSet({"versionTitle": "The Holy Scriptures: A New Translation (JPS 1917)"})
for v in versions:
    v.versionNotes = "This 1917 translation by the Jewish Publication Society is in the public domain. JPS graciously shared digital images of this text with the Open Siddur Project, from which the text was imported by Sefaria."
    v.save()

versions = VersionSet({"versionTitle": "Wikisource Talmud Bavli"})
for v in versions:
    v.versionNotes = "The text is according to the Vilna Shas, and has been segmented according the punctuation of the <a href='http://www.korenpub.com/EN/categories/talmud' target='_blank'>Steinsaltz Koren Gemara</a>, courtesy of <a href='http://www.korenpub.com/' target='_blank'>Koren Publishers</a>."
    v.save()
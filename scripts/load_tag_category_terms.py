# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria import model


tag_categories = [u'Art', u'Authors', u'Tanakh', u'Calendar', u'Education', u'Folklore', u'Food', u'Geography', u'History', u'Holidays', u'Israel', u'Language', u'Law', u'Literature', u'Medicine', u'Philosophy', u'Prayer', u'Religion', u'Ritual Objects', u'Science', u'Society', u'Texts', u'Torah Portions']
he_tag_categories = [u'אמנות', u'אישים', u'תנ"ך', u'מעגל השנה', u'חינוך', u'הווי ומסורת', u'מזון', u'גיאוגרפיה', u'היסטוריה', u'מועדי ישראל', u'ישראל', u'לשון', u'חוקים', u'ספרות', u'רפואה', u'פילוסופיה', u'תפילה', u'הדתות', u'מצוה ומנהג', u'מדע', u'קהילה וחברה', u'טקסטים', u'פרשיות התורה']
z = zip(tag_categories, he_tag_categories)

ts = model.TermScheme()
if not ts.load({"name": "Tag Category"}):
    ts.name = "Tag Category"
    ts.save()


def add_term(i, en, he):
    term = model.Term()
    term.name = en
    term.scheme = ts.name
    term.order = i
    term.set_titles([
        {
            "lang": "en",
            "text": en,
            "primary": True
        },
        {
            "lang": "he",
            "text": he,
            "primary": True
        }
    ])
    term.save()


# Need to remove "Law/חוקים" from Halakhah --
titles_to_delete_if_they_exist = [(u"Law", "en"), (u"חוקים", "he")]
for title in titles_to_delete_if_they_exist:
    term = model.Term().load_by_title(title[0])
    if term:
        term.remove_title(title[0], title[1])
        term.save()
# --------------------


for i, (en, he) in enumerate(z, 1):

    term = model.Term()

    en_term_exists = term.load_by_title(en)
    he_term_exists = term.load_by_title(he)

    if en_term_exists or he_term_exists:
        title = en_term_exists.get_primary_title()
        if en == title:
            en_term_exists.scheme = ts.name
            en_term_exists.order = i
            term.save()

    else:
        add_term(i, en, he)

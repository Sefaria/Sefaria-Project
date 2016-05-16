# -*- coding: utf-8 -*-

from sefaria import model


months = [u'Tishrei', u'Cheshvan', u'Kislev', u'Tevet', u'Shevat', u'Adar', u'Nisan', u'Iyar',
          u'Sivan', u'Tammuz', u'Av', u'Elul']

he_months = [u'תשרי', u'חשון', u'כסלו', u'טבת', u'שבט', u'אדר', u'ניסן', u'אייר', u'סיוון', u'תמוז', u'אב', u'אלול']

ts = model.TermScheme()
if not ts.load({"name": "he-month"}):
    ts.name = "he-month"
    ts.save()

for index, month in enumerate(months):

    en, he = month, he_months[index]
    print en
    term = model.Term()
    term.name = en
    term.scheme = ts.name
    term.order = index + 1
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
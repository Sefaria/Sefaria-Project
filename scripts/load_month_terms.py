# -*- coding: utf-8 -*-

from sefaria import model


months = ['Tishrei', 'Cheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Nisan', 'Iyar',
          'Sivan', 'Tammuz', 'Av', 'Elul']

he_months = ['תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול']

ts = model.TermScheme()
if not ts.load({"name": "he-month"}):
    ts.name = "he-month"
    ts.save()

for index, month in enumerate(months):

    en, he = month, he_months[index]
    print(en)
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
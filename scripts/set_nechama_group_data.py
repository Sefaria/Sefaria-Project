# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model.group import Group


g = Group().load({"name": u"גיליונות נחמה"})

g.toc = {
	"categories": ["Tanakh", "Commentary"],
	"title": "The Nechama Leibowitz Collection",
	"heTitle": u"גיליונות נחמה",
	"description": "<span class='dedication'>In loving memory of our mother, grandmother, and great-grandmother Miriam Magda Reichner<br>The Rubinstein family<br> Toronto, Canada and Raanana, Israel</span>",
	"heDescription": u"<span class='dedication'>לעילוי נשמת אמנו, וסבתנו, סבתא רבתא שלנו מרים רייכנער<br>נדבת משפחת רובינשטיין<br>טורונטו, קנדה ורעננה, ישראל<span class='dedication'>"}

g.save()



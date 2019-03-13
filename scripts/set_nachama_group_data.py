# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model.group import Group


g = Group().load({"name": u"גיליונות נחמה"})

g.toc = {
	"categories": ["Tanakh", "Commentary"],
	"title": "The Nechama Leibowitz Collection",
	"heTitle": u"גיליונות נחמה",
	"description": "<span class='dedication'>Dedicated in loving memory of our mother and grandmother Miriam Magda Reichner by the Rubinstein family — Toronto, Canada & Raanana, Israel.</span>",
	"heDescription": u"לעילוי נשמת אמנו וסבתנו מרים רייכנער נדבת משפחת רובינשטיין — טורונטו, קנדה — רעננה, ישראל."
}

g.save()



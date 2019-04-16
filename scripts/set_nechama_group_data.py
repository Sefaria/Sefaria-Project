# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model.group import Group

g = Group().load({"name": u"גיליונות נחמה"})

g.toc = {
	"categories": ["Tanakh", "Commentary"],
	"title": "The Nechama Leibowitz Collection",
	"heTitle": u"גיליונות נחמה",
	"description": "<span class='dedication'>Dedicated in loving memory of our mother and grandmother Miriam Magda Reichner.<br>The Rubinstein family — Toronto, Canada & Raanana, Israel.</span>",
	"heDescription": u"<span class='dedication'>לעילוי נשמת אמנו וסבתנו מרים רייכנער<br>נדבת משפחת רובינשטיין — טורונטו, קנדה ורעננה, ישראל<span class='dedication'>"
}


g.save()



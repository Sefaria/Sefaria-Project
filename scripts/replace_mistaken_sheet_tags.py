# -*- coding: utf-8 -*-

from sefaria.sheets import change_tag

replacement_pairs = [("Mishneg Torah", "Mishneh Torah"),
("Torte Law", "Tort Law"),
("Barenness","Bareness"),
("Kindess","Kindness"),
("Altrusim","Altruism"),
("Tribes, Twelve Tribes, Dessert Encampment",["Tribes", "Twelve Tribes", "Desert Encampment"]),
("syangogue","synagogue"),
("Abraham Charachter","Abraham Character"),
("Family Purety","Family Purity"),
("Locusts, Darkness, Kabbalah, Ninth Plague, Eight Plague, Egypt, Pyramids",["Locusts", "Darkness", "Kabbalah", "Ninth Plague", "Eighth Plague", "Egypt", "Pyramids"]),
("Lashon Harah,","Lashon Harah"),
("Yoreh Deah, Basar Bechalav, meat and milk","Yoreh Deah, Basar Bechalav, meat and milk".split(",")),
("Mishkan, Solar Energy, Temple, Tabernacle","Mishkan, Solar Energy, Temple, Tabernacle".split(",")),
("Fire, Mountains, Negev, Shema, Red Sea, Israel, Flames, Clouds","Fire, Mountains, Negev, Shema, Red Sea, Israel, Flames, Clouds".split(",")),
("Tabernacle, Animal Skins, Tent","Tabernacle, Animal Skins, Tent".split(",")),
("purim, megillat esther, mishneh torah","purim, megillat esther, mishneh torah".split(",")),
("Mishnah, Bava Kamma, Jewish Law, Damages","Mishnah, Bava Kamma, Jewish Law, Damages".split(",")),
("Olive Oil, Olive Tree, Eternal Light","Olive Oil, Olive Tree, Eternal Light".split(",")),
("Ezekiel, Tree, Kingdom, Unity","Ezekiel, Tree, Kingdom, Unity".split(",")),
("sarah and hagar, isaac and ishmael","sarah and hagar, isaac and ishmael".split(",")),
("Sukkot, Succah, Cows, Jacob, Sustainability, Ecology","Sukkot, Succah, Cows, Jacob, Sustainability, Ecology".split(",")),
("Animals, Ark, Noah","Animals, Ark, Noah".split(",")),
("Eagle's Wings, Sinai, Yoga","Eagle's Wings, Sinai, Yoga".split(",")),
("Animals, Sacrifice, Sukkot","Animals, Sacrifice, Sukkot".split(",")),
("Pesach, Shir Hashirim, Sinai, Genesis","Pesach, Shir Hashirim, Sinai, Genesis".split(",")),
("Angels, Guardians, New York, Guardian Angels","Angels, Guardians, New York, Guardian Angels".split(",")),
("Miriam, Wells, Leprosy, Moses","Miriam, Wells, Leprosy, Moses".split(",")),
("Israel, Sacrifice, Cow","Israel, Sacrifice, Cow".split(",")),
("Angel, Jacob, Wrestling","Angel, Jacob, Wrestling".split(",")),
("Succah, Passover, Goat, Sacrifice, Lotus","Succah, Passover, Goat, Sacrifice, Lotus".split(",")),
("Politics, Monarchy, Democracy, Christianity","Politics, Monarchy, Democracy, Christianity".split(",")),
("Love, Attraction, Magnetism, Magnetic Attraction","Love, Attraction, Magnetism, Magnetic Attraction".split(",")),
("Passover,","Passover"),
("Be’ersheva, sheep, wells, oaths, art, collage","Be’ersheva, sheep, wells, oaths, art, collage".split(",")),
("Passover, Goat, Sacrifice, Egypt, Lotus","Passover, Goat, Sacrifice, Egypt, Lotus".split(",")),
("God's Ways; Mercy; Compassion; Hesed","God's Ways; Mercy; Compassion; Hesed".split(";"))]

for (old, new) in replacement_pairs:
	change_tag(old,new)

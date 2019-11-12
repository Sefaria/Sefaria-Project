# -*- coding: utf-8 -*-
import csv
from collections import defaultdict
from sefaria.model import Term, TermSet
from sefaria.utils.util import titlecase
from sefaria.sheets import change_tag
from sefaria.system.database import db
from html.parser import HTMLParser
h = HTMLParser()

# Assumption: first term loaded can grab primary title
langs = ["en", "he"]
en_file = "data/tmp/terms_to_import.csv"
he_filename = "data/tmp/he_terms_to_import.csv"

name_to_term_map = {}  # Map normalized titles to Term objects
term_list = []
he_synonyms = {}  # map of He primary -> he Secondaries

# First - clean up needless whitespace
replacement_pairs = [(t, t.strip()) for t in db.sheets.distinct("tags") if t != t.strip()]

# and clean up typos
replacement_pairs += [("Mishneg Torah", "Mishneh Torah"),
("Torte Law", "Tort Law"),
("MIddot", "Middot"),
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
("Jew Curious,","Jew Curious"),
("Be’ersheva, sheep, wells, oaths, art, collage","Be'ersheva, sheep, wells, oaths, art, collage".split(",")),
("Passover, Goat, Sacrifice, Egypt, Lotus","Passover, Goat, Sacrifice, Egypt, Lotus".split(",")),
("God's Ways; Mercy; Compassion; Hesed","God's Ways; Mercy; Compassion; Hesed".split(";")),
("Purim, Megillat Esther, Mishneh Torah","Purim, Megillat Esther, Mishneh Torah".split(","))]

for (old, new) in replacement_pairs:
    change_tag(old,new)

replacement_dict = {a:b for (a,b) in replacement_pairs}


# Load current terms
# Add names to map
for term in TermSet():
    term.count = 10000

    assert isinstance(term, Term)
    for lang in langs:
        for title in term.get_titles(lang):
            # Skip titlecasing existing terms - there's no only a few cases, and it can break links
            name_to_term_map[title] = term

# Load Hebrew variants sheet
# - create map of He primary -> he Secondaries
with open(he_filename, "rb") as he_file:
    next(he_file)
    for row in csv.reader(he_file):
        main_he = row[0].decode("utf-8")
        he_synonyms[main_he] = [r.decode("utf-8") for r in row[1:] if r]

"""
        en_term = min(he_terms[main_he])
        for secondary_term in [r.decode("utf-8") for r in row[1:] if r]:
            he_terms[secondary_term].add(en_term)
"""


# Load proto-terms from English variants sheet
# For each
# - If any of these terms, or their Hebrew synonyms, exist - add to existing term
# - else create new proto-term
with open(en_file, 'rb') as tfile:
    next(tfile)
    rows = csv.reader(tfile)
    for row in rows:
        (he_name, count, en_primary, en_names) = (h.unescape(row[0].decode("utf-8")), int(row[1]), titlecase(row[2]), list(set([titlecase(x) for x in row[3:] if x])))
        if replacement_dict.get(en_primary):
            if isinstance(replacement_dict.get(en_primary), list):
                continue
            en_primary = replacement_dict.get(en_primary)
        all_names = [he_name] + [en_primary] + en_names + he_synonyms.get(he_name, [])
        already_used = [name_to_term_map.get(x) for x in all_names if name_to_term_map.get(x)]
        if len(set(already_used)) >= 2:
            print("Bridged Terms: {} {}".format(en_primary, [t.get_primary_title("en") for t in already_used]))

        elif len(set(already_used)) == 1:
            existing_term = already_used[0]
            assert isinstance(existing_term, Term)

            if not existing_term.has_title(he_name, "he"):
                existing_term.add_title(he_name, "he")
                name_to_term_map[he_name] = existing_term

            for en_name in [en_primary] + en_names:
                if not existing_term.has_title(en_name, "en"):
                    existing_term.add_title(en_name, "en")
                    name_to_term_map[en_name] = existing_term

            for he_name in he_synonyms.get(he_name, []):
                if not existing_term.has_title(he_name, "he"):
                    existing_term.add_title(he_name, "he")
                    name_to_term_map[he_name] = existing_term

            existing_term.count += count

        else: # new
            new_term = Term()
            new_term.name = en_primary
            new_term.add_primary_titles(en_primary, he_name)
            name_to_term_map[en_primary] = new_term
            name_to_term_map[he_name] = new_term

            for variant in en_names:
                if variant:
                    new_term.add_title(variant, "en")
                    name_to_term_map[variant] = new_term

            for he_syn in he_synonyms.get(he_name, []):
                new_term.add_title(he_syn, "he")
                name_to_term_map[he_name] = new_term

            new_term.count = count

# Collapse Terms to list and print / save

unique_terms = list(set([o for (k, o) in list(name_to_term_map.items())]))
unique_terms.sort(key=lambda t: t.count, reverse=True)
for term in unique_terms:
    if "-" in term.get_primary_title("en"):
        old_primary = term.get_primary_title("en")
        new_primary = old_primary.replace("-"," ")

        term.add_title(new_primary, "en", primary=True, replace_primary=True)
        term.add_title(old_primary, "en")
        term.name = new_primary

    try:
        print("{} / {} / {}".format(term.count, term.get_primary_title("en"), term.get_primary_title("he")))
        print()
        term.save()
    except Exception as e:
        print("ERROR saving %s" % term.get_primary_title("en"))
        print(getattr(e, "message").encode("utf-8"))


db.term.ensure_index("titles.text", unique=True)
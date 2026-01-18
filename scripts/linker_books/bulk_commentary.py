"""
Add all books with "on" in title
"""
from scripts.linker_books.stats import linker_supported_indexes, indexes_with_alt_struct, indexes_with_keyword, get_simple_indexes
from sefaria.model import *
import os
from sefaria.model.linker.match_template import MatchTemplate
import csv
from sefaria.helper.linker_index_converter import LinkerIndexConverter, ReusableTermManager, LinkerCategoryConverter
from random import sample
from tqdm import tqdm

RTM = ReusableTermManager()


def delimiter_to_regex(delim):
    if delim == "bold":
        return r"^<b>(.+?)</b>"
    elif delim == "dash":
        return r'^(.+?)[\-–]'
    elif delim == "period":
        return r"^(.*?)\."
    else:
        raise ValueError(f"Unknown delimiter: {delim}")


def get_delimiter_table():
    with open("../../data/private/linker books to convert - delimiters.csv", "r") as fin:
        cin = csv.DictReader(fin)
        return {row['Title']: row['Delimiter'] for row in cin if (row['Has Dibur'] == 'TRUE' and row['Delimiter'])}


def modify_rif_commentary():
    delim_table = get_delimiter_table()
    with open("../../data/private/rif_commentaries.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term_slug = row['Commentary Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal commentary_term_slug
                index = node.ref().index
                rif_base_title = next((bt for bt in index.base_text_titles if bt.startswith("Rif ")), None)
                if len(index.base_text_titles) == 1:
                    base_text_title = index.base_text_titles[0]
                elif rif_base_title:
                    base_text_title = rif_base_title
                else:
                    raise ValueError(f"{index.title} has {index.base_text_titles}")
                base_match_templates = library.get_index(base_text_title).nodes.match_templates
                if not node.is_root():
                    return None
                book_slug = base_match_templates[0]['term_slugs'][-1]
                print(book_slug, node.index.title)
                if "on Rif" in node.index.title:
                    return [
                        MatchTemplate(term_slugs=[commentary_term_slug, "rif", book_slug]),
                    ]
                else:
                    return [
                        MatchTemplate(term_slugs=[commentary_term_slug, book_slug]),
                    ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                addtyps = node.addressTypes[:]
                ret = {}
                delim = delim_table.get(title, None)
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    ret = {
                        **ret,
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
                if len(addtyps) == 4:
                    ret = {
                        **ret,
                        "referenceableSections": [True, True, False, True]
                    }
                return ret
            print("Converting", row['Title'])

            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def modify_mt_minor_and_rabbah():
    delim_table = get_delimiter_table()
    with open("../../data/private/mt_minor_rabbah.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term_slug = row['Commentary Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal commentary_term_slug
                index = node.ref().index
                assert len(index.base_text_titles) == 1
                base_match_templates = library.get_index(index.base_text_titles[0]).nodes.match_templates
                if not node.is_root():
                    return None
                if not commentary_term_slug.strip():
                    ct_term = Term().load_by_title(node.index.collective_title)
                    commentary_term_slug = RTM.get_or_create_term_for_titled_obj(ct_term).slug
                if "Mishneh Torah" in node.index.title:
                    mt_book_slug = base_match_templates[0]['term_slugs'][-1]
                    return [
                        MatchTemplate(term_slugs=[commentary_term_slug, "mishneh-torah", "hilchot", mt_book_slug]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "mishneh-torah", mt_book_slug]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "rambam", "hilchot", mt_book_slug]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "rambam", mt_book_slug]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "hilchot", mt_book_slug]),
                    ]
                elif "Tractate" in node.index.title:
                    minor_book_slug = base_match_templates[0]['term_slugs'][-1]
                    return [
                        MatchTemplate(term_slugs=[commentary_term_slug, minor_book_slug]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "tractate", minor_book_slug]),
                    ]
                elif "Rabbah" in node.index.title:
                    rabbah_book_slug = base_match_templates[0]['term_slugs'][0]
                    return [
                        MatchTemplate(term_slugs=[commentary_term_slug, rabbah_book_slug, "rabbah"]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "midrash", rabbah_book_slug, "rabbah"]),
                        MatchTemplate(term_slugs=[commentary_term_slug, "midrash-rabbah", rabbah_book_slug]),
                    ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                addtyps = node.addressTypes[:]
                # make sure MT has Perek, Halakhah
                # make sure Minor has Perek, Halakhah
                if "Tractate" in title or "Mishneh Torah" in title:
                    addtyps[0] = "Perek"
                    addtyps[1] = "Halakhah"
                elif "Rabbah" in title:
                    addtyps[0] = "Perek"
                ret = {
                    "addressTypes": addtyps,
                }
                delim = delim_table.get(title, None)
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    ret = {
                        **ret,
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
                if len(addtyps) == 4:
                    ret = {
                        **ret,
                        "referenceableSections": [True, True, False, True]
                    }
                return ret
            print("Converting", row['Title'])

            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def modify_yerushalmi_commentary():
    delim_table = get_delimiter_table()
    with open("../../data/private/yerushalmi_commentaries.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term_slug = row['Commentary Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal commentary_term_slug
                if not node.is_root():
                    return None
                yerushalmi_book = node.get_primary_title().split(" on Jerusalem Talmud ")[1]
                book_term_list = NonUniqueTermSet({"titles": {"$elemMatch": {"text": yerushalmi_book, "primary": True}}}).array()
                if len(book_term_list) > 0:
                    book_term = book_term_list[0]
                elif yerushalmi_book == "Ta'anit":
                    book_term = NonUniqueTerm.init("taanit1")
                else:
                    raise ValueError(f"Could not find term for {yerushalmi_book}")
                if not commentary_term_slug.strip():
                    ct_term = Term().load_by_title(node.index.collective_title)
                    commentary_term_slug = RTM.get_or_create_term_for_titled_obj(ct_term).slug
                return [
                    MatchTemplate(term_slugs=[commentary_term_slug, "yerushalmi", book_term.slug]),
                    MatchTemplate(term_slugs=[commentary_term_slug, "yerushalmi", "tractate", book_term.slug]),
                    MatchTemplate(term_slugs=[commentary_term_slug, "talmud", "yerushalmi", "tractate", book_term.slug]),
                    MatchTemplate(term_slugs=[commentary_term_slug, "talmud", "yerushalmi", book_term.slug]),
                ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                addtyps = node.addressTypes[:]
                addtyps[0] = "Perek"
                ret = {
                    "addressTypes": addtyps,
                }
                delim = delim_table.get(title, None)
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    ret = {
                        **ret,
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
                if len(addtyps) == 4:
                    ret = {
                        **ret,
                        "referenceableSections": [True, True, False, True]
                    }
                return ret
            print("Converting", row['Title'])

            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()

def modify_some_other_commentaries():
    delim_table = get_delimiter_table()
    with open("../../data/private/base_on.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term_slug = row['Commentary Term Slugs']
            base_text_term_slug = row['Base Text Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal commentary_term_slug
                if not node.is_root():
                    return None
                if not commentary_term_slug:
                    ct = node.index.collective_title
                    if ct == "Commentary of the Rosh":
                        commentary_term_slug = "rosh"
                    elif ct == "Chidushei Chatam Sofer":
                        commentary_term_slug = "chatam-sofer"
                    else:
                        ct_term = Term().load_by_title(ct)
                        commentary_term_slug = RTM.get_or_create_term_for_titled_obj(ct_term).slug
                return [
                    MatchTemplate(term_slugs=[commentary_term_slug, base_text_term_slug]),
                ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                delim = delim_table.get(title, None)
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    return {
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
            print("Converting", row['Title'])

            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def modify_mishnah_commentary():
    delim_table = get_delimiter_table()
    with open("../../data/private/mishnah_commentaries.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term_slug = row['Commentary Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal commentary_term_slug
                if not node.is_root():
                    return None
                mishnah_book = node.get_primary_title().split(" on Mishnah ")[1]
                book_term_list = NonUniqueTermSet({"titles": {"$elemMatch": {"text": mishnah_book, "primary": True}}}).array()
                if len(book_term_list) > 0:
                    book_term = book_term_list[0]
                elif mishnah_book == "Ta'anit":
                    book_term = NonUniqueTerm.init("taanit1")
                else:
                    raise ValueError(f"Could not find term for {mishnah_book}")
                if not commentary_term_slug.strip():
                    ct_term = Term().load_by_title(node.index.collective_title)
                    commentary_term_slug = RTM.get_or_create_term_for_titled_obj(ct_term).slug
                return [
                    MatchTemplate(term_slugs=[commentary_term_slug, "mishnah", book_term.slug]),
                ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                delim = delim_table.get(title, None)
                addtyps = node.addressTypes[:]
                addtyps[0] = "Perek"
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    return {
                        "addressTypes": addtyps,
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
                else:
                    return {
                        "addressTypes": addtyps,
                    }
            print("Converting", row['Title'])

            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def modify_easy_commentary():
    delim_table = get_delimiter_table()
    # GOOD TO GO!!
    with open("../../data/private/base_and_commentary_on.csv") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            commentary_term = row['Commentary Term Slugs']
            base_text_term = row['Base Text Term Slugs']

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                if not node.is_root():
                    return None
                return [
                    MatchTemplate(term_slugs=[commentary_term, base_text_term]),
                ]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                index =node.ref().index
                title = index.title
                delim = delim_table.get(title, None)
                if delim:
                    delim_re = delimiter_to_regex(delim)
                    return {
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": [delim_re],
                    }
            print("Converting", row['Title'])

            vs = VersionState(index=library.get_index(row['Title']))
            vs.refresh()
            converter = LinkerIndexConverter(row['Title'], get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def recover_already_added_indexes():
    indexes = []
    # loop through all files in ../../data/private/linker_books_already_added/ using os.listdir
    for file in os.listdir("../../data/private/linker_books_already_added/"):
        if not file.endswith(".csv"):
            continue
        with open(f"../../data/private/linker_books_already_added/{file}") as fin:
            cin = csv.DictReader(fin)
            for row in cin:
                index = library.get_index(row['Title'])
                indexes.append(index)
    return indexes


def scan_commentaries():
    indexes = linker_supported_indexes(get_simple_indexes(), reverse=True)
    indexes = indexes_with_alt_struct(indexes, reverse=True)
    indexes = indexes_with_keyword(" on ", indexes)
    indexes += recover_already_added_indexes()
    rows = []
    has_base_and_commentary_terms = []
    has_base_term = []
    mishnah_commentaries = []
    yerushalmi_commentaries = []
    mt_or_minor_or_rabbah = []
    rif = []
    btt_diff = []

    for x in tqdm(indexes):
        if not getattr(x, 'collective_title', None):
            continue
        ct = x.collective_title
        commentary_term = NonUniqueTermSet({"titles": {"$elemMatch": {"text": ct, "primary": True}}})
        base_text_title = x.title.split(" on ")[1]
        base_text_term = NonUniqueTermSet({"titles": {"$elemMatch": {"text": base_text_title, "primary": True}}})
        # load 3 random textchunks from x
        # sample_seg_refs = sample(x.all_segment_refs(), min(3, len(x.all_segment_refs())))
        # sample_text = [s.text("he").text for s in sample_seg_refs]
        sample_text = ["", "", ""]

        row = {
            "Title": x.title,
            "Collective Title": ct,
            "Commentary Term Slugs": "|".join([t.slug for t in commentary_term]),
            "Base Text Title": base_text_title,
            "Real BTTs": ",".join(x.base_text_titles),
            "Base Text Term Slugs": "|".join([t.slug for t in base_text_term]),
            "Sample Text 1": sample_text[0] if len(sample_text) > 0 else "",
            "Sample Text 2": sample_text[1] if len(sample_text) > 1 else "",
            "Sample Text 3": sample_text[2] if len(sample_text) > 2 else "",
            "Address Types": ",".join(x.nodes.addressTypes),
        }
        if len(commentary_term) == 1 and len(base_text_term) == 1:
            has_base_and_commentary_terms.append(row)
        if len(base_text_term) == 1:
            has_base_term.append(row)
        if " on Mishnah " in x.title:
            mishnah_commentaries.append(row)
        if "Jerusalem Talmud" in x.title:
            yerushalmi_commentaries.append(row)
        if "on Mishneh Torah" in x.title or "on Tractate" in x.title or "Rabbah" in x.title:
            mt_or_minor_or_rabbah.append(row)
        if "on Rif" in x.title or "on Eruvin" in x.title:
            rif.append(row)
        if row["Base Text Title"] != row["Real BTTs"]:
            btt_diff.append(row)

        rows.append(row)
    with open("../../data/private/commentary_on.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rows)

    with open("../../data/private/base_and_commentary_on.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(has_base_and_commentary_terms)
    with open("../../data/private/base_on.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(has_base_term)
    with open("../../data/private/mishnah_commentaries.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(mishnah_commentaries)
    with open("../../data/private/yerushalmi_commentaries.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(yerushalmi_commentaries)
    with open("../../data/private/mt_minor_rabbah.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(mt_or_minor_or_rabbah)
    with open("../../data/private/rif_commentaries.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rif)
    with open("../../data/private/btt_diff.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(btt_diff)
    print(len(indexes))


if __name__ == '__main__':
    scan_commentaries()
    # modify_easy_commentary()
    # modify_mishnah_commentary()
    # modify_some_other_commentaries()
    # modify_yerushalmi_commentary()
    # modify_mt_minor_and_rabbah()
    # modify_rif_commentary()

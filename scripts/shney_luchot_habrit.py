import csv
import difflib
from sefaria.system.database import db
import django
django.setup()
from sefaria.model import *
from sefaria.system.exceptions import InputError

def create_ref_map(refs_map, file):
    with open(file) as f:
        reader = csv.reader(f)
        for row in reader:
            refs_map[row[0]] = row[1]


def get_section_segment(ref):
    if "-" in ref:
        print("Range: {}".format(ref))
        segment = None
        section = " ".join(ref.split()[0:-1])
    else:
        last_word = ref.split()[-1]
        if last_word.isdigit():
            section = " ".join(ref.split()[0:-1])
            segment = int(last_word)
        else:
            section = ref
            segment = None
    return section, segment

def get_text_for_source_refs(ref_map, draft_text, prod_text):
    # go through each prod source ref, get its text, figure out its corresponding draft source ref, and get its text and compare both
    match_csv = open("scripts/shney_luchot_habrit_source_sheet_refs.csv", 'w')
    match_writer = csv.writer(match_csv)
    with open("list of refs") as f:
        for ref in f:
            orig_ref = ref
            ref = ref.replace("\n", "")

            section, segment = get_section_segment(ref)

            # now try to get production text and draft text
            draft_section_text = prod_section_text = []
            draft_section_ref = ""
            prod_section_text = prod_text[section.replace("Shelah", "Shney Luchot HaBrit")]
            draft_section_ref = ref_map[section]
            draft_section_text = draft_text[draft_section_ref]

            # now look for production segment inside draft section OR if there is no segment, all we need is draft section ref
            if not segment:
                match = draft_section_ref
            else:
                if segment <= len(prod_section_text):
                    prod_segment_text = prod_section_text[segment-1]
                    match_segment = find_prod_in_draft(prod_segment_text, draft_section_text)
                    match = "{} {}".format(draft_section_ref, match_segment)
                else:
                    match = draft_section_ref
            if not match:
                match = draft_section_ref
            #replace_source(orig_ref.replace("\n", ""), match)
            match_writer.writerow([orig_ref, match])
    match_csv.close()





def find_prod_in_draft(prod_segment, draft_section):
    max_ratio = 0.0
    max_finds = []
    for i, draft_segment in enumerate(draft_section):
        ratio = difflib.SequenceMatcher(None, draft_segment, prod_segment).ratio()
        if ratio > max_ratio:
            max_ratio = ratio
            max_finds = []
            max_finds.append(i)
        elif ratio == max_ratio:
            max_finds.append(i)
    if len(max_finds) > 1:
        print("too many")
    return max_finds[0] + 1


def load_csv(dict_refs_to_text, file):
    with open(file) as f:
        reader = csv.reader(f)
        start = False
        for row in reader:
            if row[0] == "Version Notes":
                start = True
                continue
            if not start:
                continue
            section = " ".join(row[0].split()[0:-1])
            if section not in list(dict_refs_to_text.keys()):
                dict_refs_to_text[section] = []
            dict_refs_to_text[section].append(row[1])


def replace_source(orig_ref, new_ref):
    sheets = db.sheets.find({"sources.ref": orig_ref})
    sheets = list(sheets)
    if len(sheets) == 0:
        return
    for sheet in sheets:
        for source_n, source in enumerate(sheet['sources']):
            if 'ref' in list(source.keys()) and source['ref'] == orig_ref:
                print("Changing sheet...{}".format(sheet["id"]))
                print("{}".format(new_ref))
                sheet["sources"][source_n]['ref'] = new_ref
                try:
                    sheet["sources"][source_n]['heRef'] = Ref(new_ref).he_normal()
                except InputError as e:
                    print(e.message)
        db.sheets.save(sheet)


if __name__ == "__main__":
    # #for each key ref get production text, for value ref, get draft text
    # ref_map = {}
    # prod_ref_to_text = {}
    # draft_ref_to_text = {}
    # info = {}
    # info["versionTitle"] = "Shney Luchot Habrit by Rabbi Eliyahu Munk"
    # info["lang"] = "en"
    # create_ref_map(ref_map, "shney_luchot_habrit - mapping.csv")
    # load_csv(prod_ref_to_text, "production.csv")
    # load_csv(draft_ref_to_text, "draft.csv")
    # matches = get_text_for_source_refs(ref_map, draft_ref_to_text, prod_ref_to_text)
    #draft_ref_to_text[row[1]] = get_text(row[1], text_info["lang"], text_info["versionTitle"], "http://draft.sefaria.org")["text"]
    with open("scripts/shney_luchot_habrit_source_sheet_refs.csv") as file:
        reader = csv.reader(file)
        for row in reader:
            orig, new = row
            replace_source(orig.replace("\n", ""), new)

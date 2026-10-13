import argparse
import csv
import re
from datetime import datetime

import sefaria.model as model
from sefaria.system.database import db

index_name_errors = {}
cross_index_span_errors = {}

new_index_alt_titles = {
    "Chulin": "Chullin",
    "Keilim": "Kelim",
    "Uktzin": "Oktzin",
    "Kinim": "Kinnim",
    "Bechorot": "Bekhorot",
    "Megilah": "Megillah",
    "Erchin": "Arakhin",
    "Machshirin": "Makhshirin",
    "Maaserot": "Maasrot",
    "Damai": "Demai",
    "Ohalot": "Oholot",
    "Chalah": "Challah",
    "Kidushin": "Kiddushin",
    "Bava Kama": "Bava Kamma",
    "Avodah Zara": "Avodah Zarah",
    "Bikurim": "Bikkurim",
    "Nidah": "Niddah",
}


def prepare_alt_titles_on_indices():
    for alt_title in new_index_alt_titles:
        print(alt_title)
        idx = model.library.get_index(f"Mishnah {new_index_alt_titles[alt_title]}")
        print(idx.title)
        try:
            idx.nodes.add_title(f"Mishnah {alt_title}", "en")
            idx.save(override_dependencies=True)
        except Exception:
            pass


def parse_daily_mishnah(filename):
    # See here: https://stackoverflow.com/questions/17315635/csv-new-line-character-seen-in-unquoted-field-error
    # for the irregular open flags
    db.daily_mishnayot.remove()
    with open(filename) as csvfile:
        mishnahs = csv.reader(csvfile, dialect=csv.excel_tab)
        next(mishnahs)
        for row in mishnahs:
            if not len(row):
                continue
            parse_row(row[0], row[1])
    print(index_name_errors)
    db.daily_mishnayot.ensure_index("date")


def parse_row(input_ref, date_str):
    print(f"{input_ref} {date_str}")
    tref = f"Mishnah {input_ref}"
    try:
        rf = model.Ref(tref)
        mishnah = {
            "date": datetime.strptime(date_str, "%m/%d/%Y"),
            "ref": rf.normal(),
        }
        db.daily_mishnayot.save(mishnah)
    except Exception as e:
        # print "Exception {} on row {} {}".format(e.message, input_ref, date_str)
        if "Could not find title in reference" in e.message:
            print(f"Exception {e.message} on row {input_ref} {date_str}")
            m_obj = re.match(r"[a-zA-Z ]+", input_ref)
            if m_obj:
                index_name = m_obj.group(0).strip()
                index_name_errors[index_name] = 1
        elif "Couldn't understand text sections" in e.message:
            print(f"Splitting {input_ref}")
            split_refs = input_ref.split(" - ")
            parse_row(split_refs[0], date_str)
            parse_row(split_refs[1], date_str)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-f", "--filename", help="abs path of data csv")
    args = parser.parse_args()
    print(args.filename)
    prepare_alt_titles_on_indices()
    parse_daily_mishnah(args.filename)

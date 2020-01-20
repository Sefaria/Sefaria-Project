# -*- coding: utf-8 -*-
import csv
from datetime import datetime
import argparse
import sefaria.model as model
from sefaria.system.database import db




def parse_daily_mishnah(filename):
    # See here: https://stackoverflow.com/questions/17315635/csv-new-line-character-seen-in-unquoted-field-error
    # for the irregular open flags
    db.daily_rambam.remove()
    with open(filename, 'rU') as csvfile:
        rambams = csv.reader(csvfile, dialect=csv.excel_tab)
        for row in rambams:
            if not len(row):
                continue
            rf = model.Ref("Mishneh Torah, {}".format(row[2]))
            rambam = {
                "date": datetime.strptime(row[1], "%m/%d/%Y"),
                "ref": rf.normal(),
            }
            db.daily_rambam.save(rambam)
    db.daily_rambam.ensure_index("date")










if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-f", "--filename", help="abs path of data csv")
    args = parser.parse_args()
    print(args.filename)
    parse_daily_mishnah(args.filename)

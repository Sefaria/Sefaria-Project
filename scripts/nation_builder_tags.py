import django
import csv
from sefaria.helper.crm.nationbuilder import get_all_tags, nationbuilder_get_all

django.setup()


def export_all_tags():
    with open('tags_outf.csv', 'w+') as outf:
        csv_writer = csv.DictWriter(outf, ["tag", "count"])
        csv_writer.writeheader()
        for tag in nationbuilder_get_all(get_all_tags):
            csv_writer.writerow(dict(tag=tag["name"], count=tag["taggings_count"]))


export_all_tags()

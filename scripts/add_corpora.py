import django
django.setup()
from tqdm import tqdm
from sefaria.model import *

if __name__ == '__main__':
    for category in tqdm(['Tanakh', 'Mishnah', 'Bavli', 'Yerushalmi']):
        for index in library.get_indexes_in_category(category, full_records=True):
            if 'Minor Tractates' in index.categories:
                continue
            index.corpora = [category]
            index.save()
import django
django.setup()
from tqdm import tqdm
from sefaria.model import *

if __name__ == '__main__':
    from tqdm import tqdm
    from sefaria.system.database import db
    for category in tqdm(['Tanakh', 'Mishnah', 'Bavli', 'Yerushalmi']):
        for index in library.get_indexes_in_category(category, full_records=True):
            if 'Minor Tractates' in index.categories:
                continue
            index.corpora = [category]
            props = index._saveable_attrs()
            db.index.replace_one({"_id": index._id}, props, upsert=True)
            # index.save()
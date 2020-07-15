# encoding=utf-8

from sefaria.model import *
from sefaria.system.exceptions import BookNameError

tractates = library.get_indexes_in_category('Mishnah', full_records=True)
assert len(tractates) == 63

# remove stale versionStates
VersionState().load({'title': 'Rambam on Mishnah Beitzah'}).delete()
VersionState().load({'title': 'Rambam on Mishnah Nedarim'}).delete()

for tractate in tractates:
    print("Working on {}".format(tractate.title))
    try:
        r = library.get_index("Rambam {}".format(tractate.title))
        assert isinstance(r, Index)
        r.set_title("Rambam on {}".format(tractate.title))
        r.save()
    except BookNameError:
        pass

    rambam_index = library.get_index("Rambam on {}".format(tractate.title))
    tractate_seder = tractate.categories[1]
    if tractate_seder not in rambam_index.categories:
        rambam_index.categories.append(tractate_seder)

    if not hasattr(rambam_index, 'base_text_titles'):
        rambam_index.base_text_titles = [tractate.title]
    assert tractate.title in rambam_index.base_text_titles

    if rambam_index.base_text_mapping is None:
        rambam_index.base_text_mapping = 'many_to_one'
    assert rambam_index.base_text_mapping == 'many_to_one'

    rambam_index.save()

seder_kodashim = library.get_index("Rambam Introduction to Seder Kodashim")
seder_kodashim.categories.append("Seder Kodashim")
seder_kodashim.save()



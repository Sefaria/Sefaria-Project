import sefaria.model as model
from sefaria.system.database import db
from sefaria.clean import remove_old_counts
from sefaria.counts import update_counts
from sefaria.summaries import update_summaries


torah = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']

def update_version_title(old, new, language):
    """
    Rename a text version title, including versions in history
    'old' and 'new' are the version title names.
    """
    query = {
        "versionTitle": old,
        "language": language
    }
    db.texts.update(query, {"$set": {"versionTitle": new}}, upsert=False, multi=True, writeConcern={ 'w': 1 })

    #update_version_title_in_history(old, new, language)


def update_version_title_in_history(old, new, language):
    """
    Rename a text version title in history records
    'old' and 'new' are the version title names.
    """
    query = {
        "version": old,
        "language": language,
    }
    db.history.update(query, {"$set": {"version": new}}, upsert=False, multi=True, writeConcern={ 'w': 1 })

language = 'he'

default_version_title_cantillaiton = "Tanach with Ta'amei Hamikra"
default_version_title_vowels = "Tanach with Nikkud"
default_version_title_consonants = "Tanach with Text Only"

rename_version_title_cantillation = "Koren with Ta'amei Hamikra"
rename_version_title_vowels = "Wikisource with Nikkud"

new_version_title_cantillaiton = "Westminster Leningrad Codex"
new_version_title_vowels = "Westminster Leningrad Codex - Vowels"
new_version_title_consonants = "Westminster Leningrad Codex - Consonants"

#change old default versions
print("renaming default taamei hamikra ")
update_version_title(default_version_title_cantillaiton, rename_version_title_cantillation, language)
print("changing old taamei hamikra history")
update_version_title_in_history(default_version_title_cantillaiton, rename_version_title_cantillation, language)


print("renaming default nikkud")
update_version_title(default_version_title_vowels, rename_version_title_vowels, language)
print("changing old nikkud history")
update_version_title_in_history(default_version_title_vowels, rename_version_title_vowels, language)

#change Leningrad versions to have the old default names
print("renaming Leningrad taamei hamikra to old default name")
update_version_title(new_version_title_cantillaiton, default_version_title_cantillaiton, language)
update_version_title_in_history(new_version_title_cantillaiton, default_version_title_cantillaiton, language)

print("renaming Leningrad nikkud to old default name")
update_version_title(new_version_title_vowels, default_version_title_vowels, language)
update_version_title_in_history(new_version_title_vowels, default_version_title_vowels, language)

print("renaming Leningrad consonants to an old style default name")
update_version_title(new_version_title_consonants, default_version_title_consonants, language)
update_version_title_in_history(new_version_title_consonants, default_version_title_consonants, language)


#delete old renamed texts
print("deleting old texts versions")
model.VersionSet({"versionTitle": rename_version_title_cantillation, "language": language, "title" : { '$nin': ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']}}).delete()
model.VersionSet({"versionTitle": rename_version_title_vowels, "language": language	}).delete()

#make sure the new texts are the default.
print("un-defaulting Koren")
db.texts.update({"versionTitle": rename_version_title_cantillation, "language": language, "title" : { '$in': ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']}}, {"$set": {"status": "locked"}, "$unset": {"priority": ""}}, upsert=False, multi=True, writeConcern={ 'w': 1 })

print("prioritizing and locking Leningrad")
db.texts.update({"versionTitle": default_version_title_cantillaiton, "language": language}, {"$set": {"status": "locked", "priority":1}}, upsert=False, multi=True, writeConcern={ 'w': 1 })

print("prioritizing and locking JPS 1917")
db.texts.update({"versionTitle": "The Holy Scriptures: A New Translation (JPS 1917)", "language": 'en'}, {"$set": {"status": "locked", "priority":1}}, upsert=False, multi=True, writeConcern={ 'w': 1 })
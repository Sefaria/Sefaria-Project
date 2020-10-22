#encoding=utf-8
import django
django.setup()
from sefaria.model import *

# root = library.get_toc_tree().get_root()

def moveIndexInto(index, category):
    assert isinstance(index, Index)
    assert isinstance(category, Category)

    index.categories = category.path[:]
    print("Moving - " + index.get_title() + " to " + index.categories + " (moveIndexInto)")
    index.save(override_dependencies=True)

def moveCategoryInto(category, parent):
    """
    c = Category().load({'path': ["Tanaitic", "Minor Tractates"]})
    p = Category().load({"path": ["Talmud", "Bavli"]})
    moveCategoryInto(c, p)

    if parent is None, move to root.

    :param category:
    :param parent:
    :return:
    """
    assert isinstance(category, Category)
    assert isinstance(parent, Category) or parent is None

    old_category_path = category.path[:]
    old_parent_path = category.path[:-1]
    new_parent_path = parent.path[:] if parent else []

    # move all matching categories
    clauses = [{"path." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    old_parent_length = len(old_parent_path)
    for cat in CategorySet(query):
        # replace old_parent_path with new_parent_path
        cat.path = new_parent_path + cat.path[old_parent_length:]
        print("Saving moved category - " + cat.path)
        cat.save(override_dependencies=True)

    # move all matching Indexes
    clauses = [{"categories." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    for ind in IndexSet(query):
        assert isinstance(ind, Index)
        ind.categories = new_parent_path + ind.categories[old_parent_length:]
        print("Moving - " + ind.get_title() + " to " + ind.categories  + " (moveCategoryInto)")
        ind.save(override_dependencies=True)

    """
     Handle commentary on parallel trees separately.
     "title": "Commentary of Chida on Tractate Gerim",
     "categories": [
     "Tanaitic",
     "Commentary",
     "Commentary of Chida",
     "Minor Tractates"
     ],
    """

def create_category(path, en=None, he=None):
    c = Category()
    if not Term().load({"name": path[-1]}):
        print("adding term for " + en)
        term = Term()
        term.name = en
        term.add_primary_titles(en, he)
        term.save()
    c.add_shared_term(en)
    c.path = path
    c.lastPath = path[-1]
    print("Creating - {}".format(" / ".join(c.path)))
    c.save(override_dependencies=True)
    return c

### Avot D'Rabbi Natan  -> Midrash Aggadic Midrash
i = library.get_index("Avot D'Rabbi Natan")
p = Category().load({"path": ["Midrash", "Aggadic Midrash"]})
moveIndexInto(i, p)


### Commentaries of ADRN
# e.g:
# ["Tanaitic", "Commentary", "Kisse Rahamim", "Minor Tractates"]
# -> ["Midrash", "Aggadic Midrash", "Commentary", "Kisse Rahamim"]
create_category(["Midrash", "Aggadic Midrash", "Commentary"])

adrn_comms = ["Binyan Yehoshua on Avot D'Rabbi Natan",
"Gra's Nuschah on Avot D'Rabbi Natan",
"Haggahot R' Yeshaya Berlin on Avot D'Rabbi Natan",
"Haggahot Ya'avetz on Avot D'Rabbi Natan",
"Kisse Rahamim on Avot D'Rabbi Natan",
"Mitzpeh Etan on Avot D'Rabbi Natan",
"Rishon Letzion on Avot D'Rabbi Natan",
"Tumat Yesharim on Avot D'Rabbi Natan"]

for comm in adrn_comms:
    i = library.get_index(comm)
    name = i.categories[2]
    c = create_category(["Midrash", "Aggadic Midrash", "Commentary", name])
    moveIndexInto(i, c)

library.rebuild(include_toc=True)
# remove empty categories that had been just ADRN
for p in [
    ["Tanaitic", "Commentary", "Binyan Yehoshua", "Minor Tractates" ],
    ["Tanaitic", "Commentary", "Mitzpeh Etan", "Minor Tractates" ],
    ["Tanaitic", "Commentary", "Tumat Yesharim", "Minor Tractates" ],
    ]:
    c = Category().load({"path": p})
    c.delete()

### The rest of the minor tractates -> Talmud/Bavli
c = Category().load({'path': ["Tanaitic", "Minor Tractates"]})
p = Category().load({"path": ["Talmud", "Bavli"]})
moveCategoryInto(c, p)

### Commentary on minor tractates -> Talmud/Bavli
c = Category().load({'path': ["Tanaitic", "Commentary"]})
p = Category().load({"path": ["Talmud", "Bavli"]})
moveCategoryInto(c, p)

### 	Megillat Taanit -> Midrash
i = library.get_index("Megillat Taanit")
c = Category().load({"path": ["Midrash"]})
moveIndexInto(i, c)

### Tosefta -> New top level category
c = Category().load({"path": ["Tanaitic", "Tosefta"]})
moveCategoryInto(c, None)

### Remove Tanaitic
library.rebuild(include_toc=True)
c = Category().load({"path": ["Tanaitic"]})
c.delete()


# Click Talmud -> Commentary of Chida (crash)


# Remove Modern Works
c = Category().load({"path": ["Modern Works", "English Explanation of Mishnah"]})
p = Category().load({"path": ["Mishnah", "Commentary"]})
moveCategoryInto(c, p)

c = Category().load({"path": ["Modern Works", "Works of Eliezer Berkovits"]})
p = Category().load({"path": ["Philosophy"]})
moveCategoryInto(c, p)


# Shoel uMeshiv to subcat
c = create_category(["Responsa", "Shoel uMeshiv"], en="Shoel uMeshiv", he="שואל ומשיב")
ts = ["Shoel uMeshiv Mahadura I",
"Shoel uMeshiv Mahadura II",
"Shoel uMeshiv Mahadura III",
"Shoel uMeshiv Mahadura IV",
"Shoel uMeshiv Mahadura V",
"Shoel uMeshiv Mahadura VI"]

for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)

# Contemporary .. into Halacha
c = create_category(["Halacha", "Contemporary Halakhic Problems"], en="Contemporary Halakhic Problems", he='בעיות הלכתיות עכשוויות')
ts = [
'Contemporary Halakhic Problems, Vol I',
'Contemporary Halakhic Problems, Vol II',
'Contemporary Halakhic Problems, Vol III',
'Contemporary Halakhic Problems, Vol IV',
'Contemporary Halakhic Problems, Vol V',
'Contemporary Halakhic Problems, Vol VI']
for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)

# Gray Matter into Halacha
c = create_category(["Halacha", "Gray Matter"], en="Gray Matter", he='גריי מאטר')
ts = [
'Gray Matter I',
'Gray Matter II',
'Gray Matter III',
'Gray Matter IV',
]
for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)

# Marei HaBazak to subcat
c = create_category(["Responsa", "B'Mareh HaBazak"], en="B'Mareh HaBazak", he='שו"ת במראה הבזק')
ts = ["B'Mareh HaBazak Volume I",
"B'Mareh HaBazak Volume III",
"B'Mareh HaBazak Volume IV",
"B'Mareh HaBazak Volume IX",
"B'Mareh HaBazak Volume V",
"B'Mareh HaBazak Volume VI",
"B'Mareh HaBazak Volume VII",
"B'Mareh HaBazak Volume VIII"]

for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)

# Daf Shevui -> Talmud Commentary
c = create_category(["Talmud", "Commentary", "Daf Shevui"], en="Daf Shevui", he="דף שבועי")
ts = ["Daf Shevui to Avodah Zarah",
 "Daf Shevui to Ketubot",
 "Daf Shevui to Kiddushin",
 "Daf Shevui to Megillah",
 "Daf Shevui to Sukkah"]

for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)

#
i = library.get_index("A New Israeli Commentary on Pirkei Avot")
c = Category().load({"path": ["Mishnah", "Commentary"]})   # deeper cat?


# Other, Grammar -> Reference, Grammar
c = Category().load({"path": ["Other", "Grammar"]})
p = Category().load({"path": ["Reference"]})
moveCategoryInto(c, p)


# Other, Dictionary -> Reference, Dictionary
c = Category().load({"path": ["Other", "Dictionary"]})
p = Category().load({"path": ["Reference"]})
moveCategoryInto(c, p)
# Jastrow, Klein Dictionary, Otzar Laazei Rashi  => Reference, Dictionary
ts = ['Jastrow', 'Klein Dictionary', 'Otzar Laazei Rashi']
for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, c)
# Into reference
ts = ["The Jewish Spiritual Heroes", "Ein Zocher", "Devash Lefi", "Midbar Kedemot"]
for t in ts:
    i = library.get_index(t)
    moveIndexInto(i, p)


# Remove Other


# Rename Philosophy -> Jewish Thought (remains same in Hebrew)
#	Subsections:
#		Rishonim
#		Achronim
#		Modern

# Within Halacha - topical subdivisions, with alphabetical internal to each topic

# Get rid of "modern commentary" on the sidebar.

# Pin major commentaries on Mishnah


# Tanakh Commentary
# Talmud Commentary
#	Alphabetical  (? really?  not crono?)


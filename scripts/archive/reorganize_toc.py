import sefaria.model as model
from sefaria.system.database import db
from sefaria.clean import remove_old_counts

# Move the history books

model.IndexSet({"categories":"History"}).update({"categories": ['Apocrypha']})

anaBekhoach = model.Index().load({'title': 'Ana BeKhoach'})
anaBekhoach.categories = ['Liturgy','Piyutim'] #why doesn't update() work on an instance?
anaBekhoach.save()

model.IndexSet({"title":{"$regex": "Rabbah?"}}).update({"categories": ['Midrash', 'Aggadic Midrash', 'Midrash Rabbah']})
#this one should not have been updated.
model.Index().update({'title': 'Tanna Debei Eliyahu Rabbah'}, {'categories': ['Midrash', 'Aggadic Midrash']})

model.IndexSet({'title': {"$regex" : 'Ein Yaakov'}}).update({'categories': ['Midrash', 'Aggadic Midrash']})

model.Index().update({'title': 'Midrash Tanchuma'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Legends of the Jews'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Midrash Mishlei'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Pirkei Derabi Eliezer'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Midrash on Proverbs'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': "Midrash B'not Zelophehad"}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Midrash Tehilim'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Pesikta de rav kahana'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'The Fathers according to Rabbi Nathan'}, {'categories': ['Midrash', 'Aggadic Midrash']})
model.Index().update({'title': 'Yalkut Shimoni'}, {'categories': ['Midrash', 'Aggadic Midrash']})


model.Index().update({'title': 'Sifra'}, {'categories': ['Midrash', 'Halachic Midrash']})
model.Index().update({'title': "Mekhilta d'Rabbi Yishmael"}, {'categories': ['Midrash', 'Halachic Midrash']})
model.Index().update({'title': 'Mekhilta'}, {'categories': ['Midrash', 'Halachic Midrash']})
model.Index().update({'title': 'Sifre Bamidbar'}, {'categories': ['Midrash', 'Halachic Midrash']})


# Rebuild counts docs, so they get the allVersionCounts field
model.refresh_all_states()

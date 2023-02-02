import django
django.setup()
from sefaria.model import *

if __name__ == '__main__':
    for index in IndexSet():
        versions = index.versionSet()
        try:
            langs = [v.actualLanguage for v in versions]
        except AttributeError:
            print('adding actualLang en to', version)
            for version in versions:
                version.actualLanguage = 'en'
        if 'he' in langs:
            for version in versions:
                if version.actualLanguage != 'he' or version.versionTitle == 'Hebrew Translation':
                    version.isBaseText = False
                else:
                    version.isBaseText = True
                version.save()
        else:
            if index.title in ['Teshuvot HaRitva', 'Musafia Teshuvot HaGeonim', 'Yismach Yisrael on Pesach Haggadah',
                               'Minchat Ani on Pesach Haggadah', 'From Sinai to Ethiopia']\
                    or index.title in ['Legends of the Jews', 'Kol Dodi Dofek', 'Saadia Gaon on Deuteronomy',
                                       'Saadia Gaon on Exodus', 'Saadia Gaon on Numbers', 'Commentary on Selected Paragraphs of Arpilei Tohar']:
                for version in versions:
                    version.isBaseText = False
                    version.save()
            else:
                origLang = 'de' if index.title == 'Rav Hirsch on Torah' else 'en'
                for version in versions:
                    if version.actualLanguage == origLang:
                        version.isBaseText = True
                    else:
                        version.isBaseText = False
                    version.save()

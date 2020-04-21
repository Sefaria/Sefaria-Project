import django
django.setup()
from sefaria.model import *

if __name__ == "__main__":
    ref1 = library.get_wrapped_refs_string('(רמב"ם כלאים א, א-ג; רמב"ם בכורות א, יד; שו"ע יו"ד סא, יא)')
    print(ref1)
    # assert ref1[0] == Ref('Mishneh Torah, Diverse Species 1:1-3')
    ref11 = library.get_wrapped_refs_string('(רמב"ם תרומות ג, יח; שו"ע או"ח שלא, כו)')
    print(ref11)
    ref2 = library.get_refs_in_string('(משנה תורה מעשר שני ב, ה-ו)')
    print(ref2)
    ref3 = library.get_refs_in_string('(משנה תורה, הלכות מעשר שני ונטע רבעי יא, ה-ו)')
    print(ref3)
    ref4 = library.get_refs_in_string('(רמב"ם תמידין ומוספין ז, כא)')
    print(ref4)
    ref5 = library.get_refs_in_string('(רמב"ם תרומות ב, ט; להלן ח, ד, 7)')
    print(ref5)
    ref6 = library.get_refs_in_string('(רמב"ם מאכ"א יד, ג)')
    print(ref6)
    ref7 = library.get_refs_in_string('(רמב"ם בכורות א, יד; שו"ע יו"ד סא, יא)')
    print(ref7)
    ref8 = library.get_refs_in_string('(רמב"ם שמיטה ויובל יג, יג).')
    print(ref8)
    ref9 = library.get_refs_in_string('(רמב"ם מעשר א, א).')
    print(ref9)
    ref10 = library.get_wrapped_refs_string('פני קצירת השעורים לקרבן העומר. שנאמר (ויקרא כג, ט-יד): ')
    print(ref10)


    # assert ref1 == [Ref('Mishneh Torah, Diverse Species 1:1-3')]
    assert ref2 == [Ref('''Mishneh Torah, Second Tithes and Fourth Year's Fruit 2:5-6''')]
    assert ref3 == [Ref('''Mishneh Torah, Second Tithes and Fourth Year's Fruit 11:5-6''')]
    assert ref4 == [Ref('Mishneh Torah, Daily Offerings and Additional Offerings 7:21')]
    assert ref5 == [Ref('Mishneh Torah, Heave Offerings 2:9')]
    assert ref6 == [Ref('Mishneh Torah, Forbidden Foods 14:3')]


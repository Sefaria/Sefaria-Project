# -*- coding: utf-8 -*-
__author__ = 'stevenkaplan'
from sefaria.helper.schema import *

def create_schema():
    root = SchemaNode()
    root.add_primary_titles("Sefer HaYashar", u"ספר הישר")


    for index, chapter in enumerate(en_chapters):
        ch_node = JaggedArrayNode()
        ch_node.add_primary_titles(chapter, he_chapters[index])
        ch_node.add_structure(["Paragraph"])
        root.append(ch_node)

    footnotes = SchemaNode()
    footnotes.add_primary_titles("Footnotes", u"הערות")

    footnote_en_chs = ["Introduction", "Main Content", "Addendum I", "Addendum II"]
    footnote_he_chs = [u"הקדמה", u"תוכן", u"נספח א", u"נספח ב"]
    footnote_chs = zip(footnote_en_chs, footnote_he_chs)
    for footnote_ch in footnote_chs:
        en = footnote_ch[0]
        he = footnote_ch[1]
        ch_node = JaggedArrayNode()
        ch_node.add_primary_titles(en, he)
        ch_node.add_structure(["Paragraph"])
        footnotes.append(ch_node)


    root.append(footnotes)
    root.validate()

    return root.serialize()





def make_map_for_simple_to_complex(en_chapters, he_chapters):
    mappings = {}
    end_of_intro = 9
    for i in range(25):
        count = i+1
        if count > end_of_intro:
            mappings["Sefer HaYashar 1:{}".format(count)] = "Sefer HaYashar, {} {}".format(en_chapters[1], count-end_of_intro)
        else:
            mappings["Sefer HaYashar 1:{}".format(count)] = "Sefer HaYashar, {} {}".format(en_chapters[0], count)

    for count, ch_title in enumerate(en_chapters):
        if count not in [0, 19, 20, 21]:
            mappings["Sefer HaYashar {}".format(count)] = "Sefer HaYashar, {}".format(en_chapters[count])

    return mappings

if __name__ == "__main__":
    he_chapters = [u"הקדמה",
                            u"השער הראשון - סוד בריאת העולם.",
                            u"השער השני - מפורש בו עמודי העבודה וסיבותיה.",
                            u"השער השלישי - באמונה ובענינים בסודות הבורא יתברך.",
                            u"השער הרביעי - העבודה על דרך קצרה.",
                            u"השער החמישי - בעמודי העבודה. והם חמישה, ואלו הם, השכל, והאהבה, והיראה,   והחכמה, והאמונה.",
                            u"השער השישי - בפירוש הדברים המסייעים על עבודת האל, יתעלה, והמעכבים אותה.",
                            u"השער השביעי - בעניני התשובה וכל הדברים התלויים בה והנלוים אליה מסדר התפילה   ועניני הפרישות.",
                            u"השער השמיני - מעניני דעת הבורא יתברך.",
                            u"השער התשיעי - בסימני רצון הבורא ובאשר יוכל אדם להכיר אם מצא חן בעיני אלהיו   ואם קבל מעשיו.",
                            u"השער העשירי - בעניני התשובה.",
                            u"השער האחד עשר - במעלות הצדיקים.",
                            u"השער השנים עשר - בסודות העולם הבא.",
                            u"השער השלושה עשר - בכל עניני העבודה.",
                            u"השער הארבעה עשר - בחשבון האדם עם נפשו.",
                            u"השער החמישה עשר - בפירוש העת הראויה לעבודת האל יתברך.",
                            u"השער השישה עשר - אזכור בו קצת חמודות העולם הבא, וכנגדם אזכיר פגעי העולם   הזה ומכשלותיו ורעותיו.",
                            u"השער השבעה עשר - בזכרון האדם יום המות.",
                            u"השער השמונה עשר - בהפרש אשר בין צדיק ורשע.",
                            u"הקדמת המתרגם",
                            u"נספח א",
                            u"נספח ב"]

    en_chapters = ["INTRODUCTION",
                "CHAPTER I The Mystery of the Creation of the World",

                "CHAPTER II The Pillars Of The Service Of God And Its Motivation",

                "CHAPTER III Concerning Faith and Matters Involved In The Mysteries Of The Creator Blessed Be He",

                "CHAPTER IV Service Briefly Discussed",

                "CHAPTER V Concerning The Pillars Of Worship",

                "CHAPTER VI An Explanation Of The Things Which Help In The Worship Of God May He Be Extolled And The Things Which Hinder",

                "CHAPTER VII Concerning Repentance And All Matters Pertaining To It From The Order Of Prayer And The Matters Of Self Restraint",

                "CHAPTER VIII Matters Concerning The Knowledge Of The Creator Blessed Be He",

                "CHAPTER IX Concerning The Signs Of The Will Of The Creator And How A Man Can Know He Has Found Favor In The Eyes Of His God And If God Has Accepted His Deeds",

                "CHAPTER X Concerning Repentance",

                "CHAPTER XI Concerning The Virtues Of The Righteous",

                "CHAPTER XII Concerning The Mysteries Of The World To Come",

                "CHAPTER XIII Concerning Service to God",

                "CHAPTER XIV Concerning The Reckoning A Man Must Make With Himself",

                "CHAPTER XV Explaining The Time Which Is Most Proper For The Service Of God Blessed Be He",

                "CHAPTER XVI I shall note in this chapter some of the delights of the world to come and as opposed to them I will note the plagues the stumbling blocks and the evil of this world",

                "CHAPTER XVII When A Man Remembers The Day Of Death",

                "CHAPTER XVIII Concerning The Difference Between The Righteous Man And The Wicked One",

                "TRANSLATORS FOREWORD",

                "Addendum I THE ETHICAL WORK SEFER HAYASHAR AND THE PHILOSOPHICAL VIEWS CONTAINED THEREIN",

                "Addendum II THE LOVE AND THE FEAR OF GOD IN THE SEFER HAYASHAR"]


    index = create_schema()
    mappings = make_map_for_simple_to_complex(en_chapters, he_chapters)
    migrate_to_complex_structure("Sefer HaYashar", index, mappings)

    library.get_index("Sefer HaYashar").delete()
    i = library.get_index("Complex Sefer HaYashar")
    i.set_title("Sefer HaYashar")
    i.set_title(u"ספר הישר", lang="he")
    i.save()


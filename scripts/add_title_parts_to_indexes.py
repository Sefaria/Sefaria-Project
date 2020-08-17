import django
django.setup()
from sefaria.model import *
import regex as re
from sefaria.system.database import db

all_added_titles = 0
rambam_re = re.compile(
    '''(?:רמב"ם|משנה תורה)[,\s]*(?:הלכות|הל'|הלכו')\s(?P<full_name>(?P<name_one>.+?)(?:\sו(?P<name_two>.+)|$))''')

def find_the_end_part(ind):
    titles_he = ind.all_titles('he')
    parts_3 = {re.match(rambam_re, t).group('full_name') for t in titles_he if re.match(rambam_re, t) and re.match(rambam_re, t).group('full_name')}
    parts_3_1 = {re.match(rambam_re, t).group('name_one') for t in titles_he if re.match(rambam_re, t) and re.match(rambam_re, t).group('name_one')}
    parts_3_2 = {re.match(rambam_re, t).group('name_two') for t in titles_he if
               re.match(rambam_re, t) and re.match(rambam_re, t).group('name_two')}
    parts_3 = parts_3.union(parts_3_1).union(parts_3_2)
    add_list = []
    for part in parts_3:
        for word in part.split():
            if re.search('ם', word) and word != 'יום':
                parts_3 = parts_3.union({part.replace(word, word.replace('ם', 'ן'))})
            elif re.search('ן', word):
                parts_3 = parts_3.union({part.replace(word, word.replace('ן', 'ם'))})
    ls_p_3 = list(parts_3)
    print(ls_p_3), print(len(ls_p_3))
    return ls_p_3


def all_rambam_titles_regex(self):
    rambam_re = re.compile(
        '''(?:רמב"ם|משנה תורה)[,\s]*(?:הלכות|הל'|)\s(?P<full_name>(?P<name_one>.+?)(?:\sו(?P<name_two>.+)|$))''')
    mt = [library.get_index(t) for t in library.get_indexes_in_category('Mishneh Torah')]
    full_names = [(re.match(rambam_re, t).group('full_name'), ind.get_title('he')) for ind in mt for t in
                  ind.all_titles('he') if re.match(rambam_re, t) and re.match(rambam_re, t)]
    divided_names_one = [(re.match(rambam_re, t).group('name_one'), ind.get_title('he')) for ind in mt for t in
                         ind.all_titles('he') if
                         re.match(rambam_re, t) and re.match(rambam_re, t).group('name_one')]
    divided_names_two = [(re.match(rambam_re, t).group('name_two'), ind.get_title('he')) for ind in mt for t in
                         ind.all_titles('he') if
                         re.match(rambam_re, t) and re.match(rambam_re, t).group('name_two')]
    rambam_book_names_t = list(set(full_names + divided_names_one + divided_names_two))
    rambam_dict = dict(rambam_book_names_t)
    # add "mem and nun sofit" options
    add_list = []
    for k, v in rambam_dict.items():
        for word in k.split():
            if re.search('ם', word) and word != 'יום':
                add_list.append((k.replace(word, word.replace('ם', 'ן')), v))
            elif re.search('ן', word):
                add_list.append((k.replace(word, word.replace('ן', 'ם')), v))
    rambam_dict.update(add_list)
    rambam_book_names = rambam_dict.keys()
    self._generated_to_primary_index_titles['rambam'] = rambam_dict
    self._full_title_lists['rambam'] = rambam_book_names
    return rambam_book_names, rambam_dict

def ramabam_alt_title_list(self):
    rambam_books = self.all_rambam_titles_regex()[0]
    rambam = list(map(re.escape, ['רמב"ם ' + rt for rt in rambam_books]))
    mt = list(map(re.escape, ['משנה תורה ' + rt for rt in rambam_books]))
    rambam_book_list = rambam + mt
    return rambam_book_list


def to_add_to_mongo(endParts, title_type = None, comentators_name = []):
    if title_type == 'rambam':
        gen_titles = [
        {
            "lang": "he",
            "parts": [
                [
                    "רמב\"ם",
                    "משנה תורה"
                ],
                [
                    " הלכות ",
                    ", ",
                    " הלכו' ",
                    " "
                ]
            ]
        }
        #     ,
        # {
        #     "lang": "en",
        #     "titleParts": [
        #         [
        #             "Rambam",
        #             "Mishneh Torah"
        #         ],
        #         [
        #             " Hilchot ",
        #             ", "
        #         ],
        #         [
        #             ""
        #         ]
        #     ]
        # }
    ]
    else:
        gen_titles = [
            {
                "lang": "he",
                "titleParts": [
                    [
                        ", ",
                        " "
                    ]
                ]
            }
                ,
            {
                "lang": "en",
                "titleParts": [
                    [
                         ""
                    ],
                    [
                        " ",
                        ", "
                    ],
                    [
                        ""
                    ]
                ]
            }
        ]
        gen_titles[0]["parts"].insert(0, comentators_name)
    gen_titles[0]["parts"].append(endParts)
    return gen_titles


def more_end_parts(end_parts_list, title_type='rambam'):
    if not end_parts_list:
        return []
    mongo_ind = db.index.find_one({"title": ind.title})
    gen_titles = mongo_ind['schema'].get('titleParts', None)
    if not gen_titles:
        end_parts = find_the_end_part(ind)
        gen_titles = to_add_to_mongo(end_parts, title_type=title_type)
    gen_titles[0]['parts'][-1] = list(set(gen_titles[0]['parts'][-1]+end_parts_list))
    return gen_titles


def rambam_name_table():
    names = library.get_indexes_in_category("Mishneh Torah")
    en_names = names
    he_raw = [library.get_index(name).get_title('he') for name in names]
    he_names = []
    name_dict = {}
    for he, en in zip(he_raw, en_names):
        s = re.split('''(?:הלכות|הלכה|הל'|הלכ)\s''', he)
        if len(s) > 1:
            he = s[1]
            he_names.append(he)
            name_dict[he] = en
    name_dict['מלוה'] = name_dict['מלווה ולווה']
    name_dict['מלוה ולוה'] = name_dict['מלווה ולווה']
    name_dict['מלוה ולווה'] = name_dict['מלווה ולווה']
    name_dict['תפלה'] = name_dict['תפילה וברכת כהנים']
    name_dict['יו"ט'] = name_dict['שביתת יום טוב']
    name_dict['י"ט'] = name_dict['שביתת יום טוב']
    name_dict['יום טוב'] = name_dict['שביתת יום טוב']
    name_dict['ת"ת'] = name_dict['תלמוד תורה']
    name_dict['ע"ז']  = name_dict['עבודה זרה וחוקות הגויים']
    name_dict['עכו"ם'] = name_dict['עבודה זרה וחוקות הגויים']
    name_dict['ע"ג'] = name_dict['עבודה זרה וחוקות הגויים']
    name_dict['עו"ג'] = name_dict['עבודה זרה וחוקות הגויים']
    # name_dict['עבודה זרה'] = name_dict['עבודה זרה וחוקות הגויים']
    name_dict['עבודת כוכבים'] = name_dict['עבודה זרה וחוקות הגויים']
    name_dict['אבות הטומאה'] = name_dict['שאר אבות הטומאות']
    name_dict['שאר אבות הטומאה'] = name_dict['שאר אבות הטומאות']
    name_dict['שאר אבות הטומאות'] = name_dict['שאר אבות הטומאות']
    name_dict['אבות הטומאות'] = name_dict['שאר אבות הטומאות']
    name_dict['שאר א"ה'] = name_dict['שאר אבות הטומאות']
    name_dict['טומאת משכב ומושב'] = name_dict['מטמאי משכב ומושב']
    name_dict['מטמא משכב ומושב'] = name_dict['מטמאי משכב ומושב']
    name_dict['משכב ומושב'] = name_dict['מטמאי משכב ומושב']
    name_dict['צרעת'] = name_dict['טומאת צרעת']
    # name_dict["שכני'"] = name_dict['שכנים']
    # name_dict["שכני"] = name_dict['שכנים']
    name_dict['ס"ת'] = name_dict['תפילין ומזוזה וספר תורה']
    # name_dict['ציצית'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['ס"ת ומזוזה'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['ספר תורה'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['מזוזה'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['תפלין'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['תפילין וס"ת'] = name_dict['תפילין ומזוזה וספר תורה']
    name_dict['אבידה'] = name_dict['גזילה ואבידה']
    name_dict['גנבה'] = name_dict['גניבה']
    # name_dict['שמיטין'] = name_dict['שמיטה ויובל']
    name_dict['שמיטין ויובל'] = name_dict['שמיטה ויובל']
    name_dict['שמיטה ויובלות'] = name_dict['שמיטה ויובל']
    name_dict['שמיטין ויובלות'] = name_dict['שמיטה ויובל']
    name_dict['שמטה ויובל'] = name_dict['שמיטה ויובל']
    name_dict['יובל'] = name_dict['שמיטה ויובל']
    name_dict['ביכורין'] = name_dict['ביכורים ושאר מתנות כהונה שבגבולין']
    name_dict['בכורים'] = name_dict['ביכורים ושאר מתנות כהונה שבגבולין']
    name_dict['זכיה ומתנה'] = name_dict['זכייה ומתנה']
    # name_dict["מכיר'"] = name_dict['מכירה']
    name_dict['שאר אבות הטומאה'] = name_dict['שאר אבות הטומאות']
    name_dict['מעשה קרבנות'] = name_dict['מעשה הקרבנות']
    name_dict['מעשה קרבן'] = name_dict['מעשה הקרבנות']
    name_dict['מעה"ק'] = name_dict['מעשה הקרבנות'] # notice when there isn't the word "הלכה" the 'ה"' seems like an indication to halachah "ק"
    name_dict['תענית'] = name_dict['תעניות']
    name_dict['מקוואות'] = name_dict['מקואות']
    name_dict['ערכין וחרמין'] = name_dict['ערכים וחרמין']
    name_dict['ערכין'] = name_dict['ערכים וחרמין']
    name_dict['שאלה ופקדון'] = name_dict['שאלה ופיקדון']
    name_dict["שאל' ופקדון"] = name_dict['שאלה ופיקדון']
    name_dict['פקדון'] = name_dict['שאלה ופיקדון']
    # name_dict['מעשר שני'] = name_dict['מעשר שני ונטע רבעי']
    name_dict['מ"ש ונטע רבעי'] = name_dict['מעשר שני ונטע רבעי']
    name_dict['מעשר שני ונ"ר'] = name_dict['מעשר שני ונטע רבעי']
    # name_dict['מע"ש'] = name_dict['מעשר שני ונטע רבעי'] # is this right? קכא ג מיי׳ פ״ה מהל׳ אישות הל׳ ה ופ״ג מהל׳ מע״ש הל׳ יז (ב"ק 112)
    name_dict['מ"ש ונ"ר'] = name_dict['מעשר שני ונטע רבעי']
    name_dict['מ"ש'] = name_dict['מעשר שני ונטע רבעי']
    name_dict['נטע רבעי'] = name_dict['מעשר שני ונטע רבעי']
    name_dict['מתנות ענים'] = name_dict['מתנות עניים']
    name_dict['מ"ע'] = name_dict['מתנות עניים']
    name_dict['טומאת אוכלין'] = name_dict['טומאת אוכלים']
    name_dict['טומאות אוכלין'] = name_dict['טומאת אוכלים']
    name_dict['טומאות מת'] = name_dict['טומאת מת']
    name_dict['טומאת המת'] = name_dict['טומאת מת']
    name_dict['גזילה ואבדה'] = name_dict['גזילה ואבידה']
    name_dict['גזלה ואבדה'] = name_dict['גזילה ואבידה']
    name_dict['גזלה ואבידה'] = name_dict['גזילה ואבידה']
    name_dict['אבדה'] = name_dict['גזילה ואבידה']
    name_dict['תמידין'] = name_dict['תמידים ומוספין']
    name_dict['תמידין ומוספין'] = name_dict['תמידים ומוספין']
    name_dict['איסורי מזבח'] = name_dict['איסורי המזבח']
    name_dict['אסורי מזבח'] = name_dict['איסורי המזבח']
    name_dict['א"מ'] = name_dict['איסורי המזבח']
    name_dict['איס"ב'] = name_dict['איסורי ביאה']
    name_dict['א"ב'] = name_dict['איסורי ביאה']
    name_dict['אסורי ביאה'] = name_dict['איסורי ביאה']
    name_dict['קידוש החדש'] = name_dict['קידוש החודש']
    name_dict['קדוש החדש'] = name_dict['קידוש החודש']
    name_dict['לולב'] = name_dict['שופר וסוכה ולולב']
    name_dict['סוכה'] = name_dict['שופר וסוכה ולולב']
    name_dict['סוכה ולולב'] = name_dict['שופר וסוכה ולולב']
    name_dict['אבילות'] = name_dict['אבל']
    name_dict['אבלות'] = name_dict['אבל']
    name_dict['דיעות'] = name_dict['דעות']
    name_dict['שלוחים ושותפין'] = name_dict['שלוחין ושותפין']
    name_dict['שותפין'] = name_dict['שלוחין ושותפין']
    name_dict['כלי מקדש'] = name_dict['כלי המקדש והעובדין בו']
    # name_dict['כלי המקדש'] = name_dict['כלי המקדש והעובדין בו']
    name_dict['ביאת המקדש'] = name_dict['ביאת מקדש']
    name_dict['מ"א'] = name_dict['מאכלות אסורות']
    name_dict['מא"ס'] = name_dict['מאכלות אסורות']
    name_dict['אסורות'] = name_dict['מאכלות אסורות']
    # name_dict["ממרי'"] = name_dict['ממרים']
    # name_dict["שכירו'"] = name_dict['שכירות']
    name_dict["תרומה"] = name_dict['תרומות']
    # name_dict["סנהד'"] = name_dict['סנהדרין והעונשין המסורין להם']
    name_dict['ק"ש'] = name_dict['קריאת שמע']
    name_dict['יום הכפורים'] = name_dict['עבודת יום הכפורים'] # because it makes problems with my code...can be fixed by taking it step by step
    name_dict['נ"כ'] = name_dict['תפילה וברכת כהנים']
    name_dict['נשיאות כפים'] = name_dict['תפילה וברכת כהנים']
    name_dict['נשיאת כפים'] = name_dict['תפילה וברכת כהנים']
    name_dict['חנוכה'] = name_dict['מגילה וחנוכה']
    name_dict['מצה'] = name_dict['חמץ ומצה']
    name_dict['חמץ'] = name_dict['חמץ ומצה']
    name_dict['חו"מ'] = name_dict['חמץ ומצה'] # note: this is also the r"t of חושן משפט not sopused to be a problem
    name_dict['גרושין'] = name_dict['גירושין']
    name_dict['נ"מ'] = name_dict['נזקי ממון']
    name_dict['פסולי מוקדשין'] = name_dict['פסולי המוקדשין']
    name_dict['פסולי המוקדשים'] = name_dict['פסולי המוקדשין']
    name_dict['ק"פ'] = name_dict['קרבן פסח']
    name_dict['רוצח וש"נ'] = name_dict['רוצח ושמירת נפש']
    name_dict['שמירת הנפש'] = name_dict['רוצח ושמירת נפש']
    name_dict['יבום'] = name_dict['יבום וחליצה']
    name_dict['חליצה'] = name_dict['יבום וחליצה']

    # for name in name_dict.keys():
    #     first = re.split('\s', name)
    #     if len(first) > 1:
    #         name_dict[first[0]] = name_dict[name]
    # del name_dict['איסורי']
    # del name_dict['טומאת']
    name_dict['מעשר'] = name_dict['מעשרות']
    return name_dict


def reverse_rambam_name_table():
    rnt = rambam_name_table()
    rev = {}
    for k, v in rnt.items():
        rev[v] = rev.get(v, [])
        rev[v].append(k)
    return rev

if __name__ == "__main__":
    mt = library.get_indexes_in_category('Mishneh Torah')
    rev_rambam_table = reverse_rambam_name_table()
    for ind_name in mt:
        print(ind_name)
        ind = library.get_index(ind_name)
        end_parts = find_the_end_part(ind)
        all_added_titles += len(end_parts)*8  # just from the end_parts I got 1624, 1728, 2592
        to_db = more_end_parts(rev_rambam_table.get(ind_name, []))
        # to_db = to_add_to_mongo(end_parts, title_type='rambam')
        # print(to_db)
        db.index.update_one({"title": ind.title}, {"$set": {"schema.titleParts": to_db}})
    print(all_added_titles)

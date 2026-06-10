from collections import defaultdict
import django, csv, json, re
django.setup()
from collections import defaultdict
from tqdm import tqdm
from itertools import product
from functools import reduce
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.helper.link import add_links_from_text
from urllib.parse import urlparse

vtitles = ['On Your Way', 'On Your Way New', 'On Your Way New', 'On Your Way New', 'On Your Way new']
books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']

class KeywordReferenceResolver:
    
    def __init__(self, raw_keywords, resolver) -> None:
        self.keyword_list = self.expand_keywords(raw_keywords)
        self.resolver = resolver
    
    def expand_keywords(self, raw_keywords):
        keyword_list = []
        for raw_keyword in raw_keywords:
            quote_side = raw_keyword['quote']
            cartesian_product = product(*raw_keyword.get('keyword_combinations', []))
            temp_keywords = raw_keyword.get('keywords', [])
            temp_keywords += ["".join(temp_product) for temp_product in cartesian_product if len(temp_product) > 0]
            quote_side_expanded = ['after', 'before'] if quote_side == 'either' else [quote_side]
            keyword_list += [
                {"keyword": kw, "quote": temp_quote_side} for kw in temp_keywords for temp_quote_side in quote_side_expanded
            ]
        # combine duplicate keywords that have both 'after' and 'before'
        quote_sides_by_kw = defaultdict(set)
        for kw in keyword_list:
            quote_sides_by_kw[kw['keyword']].add(kw['quote'])
        final_keyword_list = []
        for kw, quote_set in quote_sides_by_kw.items():
            assert len(quote_set) <= 2
            quote_side_compressed = 'either' if len(quote_set) == 2 else list(quote_set)[0]
            final_keyword_list += [{"keyword": kw, "quote": quote_side_compressed}]
        final_keyword_list.sort(key=lambda x: len(x['keyword']), reverse=True)
        return final_keyword_list

def get_keyword_resolvers():
    onkelos_kws = [{"quote": "either", "keywords": ['אונקלוס']}]
    rashi_kws = [
        {
            "quote": "either",
            "keyword_combinations": [
                [
                    "לשון "
                ],
                [
                    "רש\"י",
                    "רש\'\'י",
                    "רבנו שלמה"
                ]
            ]
        },
        {
            "quote": "after",
            "keyword_combinations": [
                [
                    "כתב ",
                    "שכתב ",
                    "כתבה ",
                    "וכתבה ",
                    "כלשון ",
                    "פירש ",
                    "שפירש "
                ],
                [
                    "רש\"י",
                    "רש\'\'י",
                    "רבנו שלמה"
                ]
            ]
        },
        {
            "quote": "after",
            "keyword_combinations": [
                [
                    "ו",
                    ""
                ],
                [
                    "רש\"י",
                    "רש\'\'י",
                    "רבנו שלמה"
                ],
                [
                    " כתב",
                    " כתבה",
                    " פירש",
                ],                                
            ],
            "keywords": ["פירש\"י", "פירש''י"]
        },
        {
            "quote": "before",
            "keyword_combinations": [
                [
                    "לשון ",
                    "כדברי ",
                    "כך פירש ",
                    "וכן פירש ",
                    "כמו שפירש ",
                    "כמו שכתב ",
                    "וכתבה ",
                    "שהזכיר ",
                    "כך מצאתי בפירוש ",
                    "זה כתב ",
                    "כאלה ",
                    "זה ל"
                ],
                [
                    "רש\"י",
                    "רש\'\'י",
                    "רבנו שלמה"
                ],
                [
                    '.',
                    ''
                ]
            ]
        }
    ]
    ibn_kws = [
        {
            "quote": "after",
            "keyword_combinations": [
                [
                    'ו',
                    ''
                ],
                [
                    "רבי אברהם",
                    "ר\"א",
                    "ר\'\'א",
                    "ורבי אברהם",
                    "ר' אברהם"
                ],
                [
                    " אמר"
                ]
            ]
        },
        {
            "quote": "after",
            "keyword_combinations": [
                [
                    'ו',
                    ''
                ],
                [
                    "אמר ",
                    "כתב "
                ],
                [
                    "רבי אברהם",
                    "ר\"א",
                    "ר\'\'א",
                    "ורבי אברהם",
                    "ר' אברהם"
                ]
            ]
        },
        {
            "quote": "before",
            "keyword_combinations": [
                [
                    "וזה דעת ",
                    "וכן דעת ",
                    "ועל דעת ",
                    "ודעת ",
                    "פירש ",
                    "דעת ",
                    "לשון ",
                    "כדברי "
                ],
                [
                    "רבי אברהם",
                    "ר\"א",
                    "ר\'\'א",
                    "רבי אברהם",
                    "ר' אברהם"
                ],
            ]
        }
    ]
    onkelos_kw_resolver = KeywordReferenceResolver(onkelos_kws, lambda x: x)
    rashi_kw_resolver = KeywordReferenceResolver(rashi_kws, lambda x: x)
    ibn_kw_resolver = KeywordReferenceResolver(ibn_kws, lambda x: x)
    return onkelos_kw_resolver, rashi_kw_resolver, ibn_kw_resolver

def get_keyword_from_window(window, kw_resolver):
    for kw in kw_resolver.keyword_list:
        if kw['keyword'] in window:
            return kw['keyword']

def get_ramban_tc(ref):
    oref = Ref(ref)
    vtitle_index = books.index(oref.index.base_text_titles[0])
    vtitle = vtitles[vtitle_index]
    return oref.text('he', vtitle=vtitle)

def add_commentary_links(onkelos_kw_resolver, rashi_kw_resolver, ibn_kw_resolver, dry_run=True):
    resolver_map = {
        'Onkelos': onkelos_kw_resolver,
        'Rashi': rashi_kw_resolver,
        'Ibn Ezra': ibn_kw_resolver
    }
    edit_map = defaultdict(list)
    bad_citation_set = set()
    links_to_add = []
    with open('data/Ramban links - Links to Rashi, Ibn Ezra & Onkelos.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            comm_oref = Ref(row['Ref Commentator'])
            resolver = resolver_map[comm_oref.index.collective_title]
            kw = get_keyword_from_window(row['Window Ramban'], resolver)
            if row['Is Correct?'] == 'n':
                bad_citation_set.add((kw, row['Ref Ramban']))
            else:

                edit_map[row['Ref Ramban']] += [(row['Ref Commentator'], kw)]
    issue_count = 0
    fout = open('data/ramban_comm_links.txt', 'w')
    for ref, edit_list in tqdm(edit_map.items(), total=len(edit_map), desc='comm links'):
        tc = get_ramban_tc(ref)
        orig_text = tc.text
        for comm_ref, kw in edit_list:
            count = tc.text.count(kw)
            if count > 1 and (kw, ref) in bad_citation_set:
                print(f'Too many: {count} - {ref} - {kw}')
                issue_count += 1
                continue
            if count == 0:
                kw_words = kw.split()
                kw = f'{kw_words[0]}</b> {" ".join(kw_words[1:])}'
                if kw not in tc.text:
                    print(f'Couldn\'t find - {ref} - {kw}')
                    issue_count += 1
                    continue
            splice_index = tc.text.index(kw) + len(kw)
            comm_oref = Ref(comm_ref)
            if comm_oref.index.collective_title in {'Rashi', 'Ibn Ezra'}:
                links_to_add += [{
                    "refs": [ref, comm_ref],
                    "auto": True,
                    "generated_by": "add_ramban_links"
                }]
                comm_oref = comm_oref.section_ref()
            comm_heref = comm_oref.he_normal()
            tc.text = tc.text[:splice_index] + f' ({comm_heref})' + tc.text[splice_index:]
        if not dry_run:
            if orig_text != tc.text:
                tc.save()
                add_links_from_text(Ref(ref), 'he', tc.text, tc.full_version._id, 5842)
        else:
            fout.write(tc.text + '\n\n')
    fout.close()
    for l in links_to_add:
        try:
            Link(l).save()
        except InputError as e:
            print("Error for link", ", ".join(l['refs']))
            print(e)
    print("Issues", issue_count)


def add_edited_links(dry_run=True):
    # TODO use fixed citations
    edit_map = defaultdict(lambda: defaultdict(list))
    with open("data/Ramban links - Modified Citations.csv", "r") as fin:
        c = csv.DictReader(fin)
        for row in c:
            original = row["Original"]
            modified = row["Modified"]
            if row['Is Correct?'] == 'n':
                try:
                    modified = f"({Ref(row['Correct Citation']).he_normal()})"
                except InputError:
                    print(row['Correct Citation'])
                    continue
                except AttributeError:
                    print(row['Correct Citation'])
                    continue
            edit_map[row['Ref']][original] += [modified]
    
    issue_count = 0
    fout = open('data/ramban_edited_links.txt', 'w')
    for ref, sub_edit_map in tqdm(edit_map.items(), total=len(edit_map), desc='mod cits'):
        tc = get_ramban_tc(ref)
        orig_text = tc.text
        for original, modified_list in sub_edit_map.items():
            count = tc.text.count(original)
            if len(set(modified_list)) > 1:
                print(f'Too many: {count} - {ref} - {original}')
                issue_count += 1
                continue
            if count == 0:
                print(f'Couldn\'t find - {ref} - {original}')
                issue_count += 1
                continue
            modified = modified_list[0]
            tc.text = tc.text.replace(original, modified)
        if not dry_run:
            if orig_text != tc.text:
                # there was a change
                tc.save()
                add_links_from_text(Ref(ref), 'he', tc.text, tc.full_version._id, 5842)
        else:
            fout.write(tc.text + '\n\n')
    fout.close()
    print("Issues", issue_count)

def add_halachic_midrash_links():
    with open("data/Ramban links - Halachic Midrash.csv", "r") as fin:
        c = csv.DictReader(fin)
        for row in c:
            ramban_tref = row['Ramban Ref']
            if len(ramban_tref) == 0: continue
            midrash_uri = urlparse(row['Midrash Ref'])
            midrash_tref = midrash_uri.path[1:].replace('_', ' ').replace('%2C', ',')
            assert Ref.is_ref(midrash_tref), midrash_tref
            try:
                Link({
                    "refs": [ramban_tref, midrash_tref],
                    "auto": True,
                    "generated_by": "add_ramban_links"
                }).save()
            except InputError as e:
                print("Halachic Midrash failed", f"{ramban_tref} <> {midrash_tref}")
                print(e)
            
def delete_section_level_comm_links():
    edit_map = defaultdict(list)
    with open('data/Ramban links - Links to Rashi, Ibn Ezra & Onkelos.csv', 'r') as fin:
        c = csv.DictReader(fin)
        for row in c:
            comm_oref = Ref(row['Ref Commentator'])
            if row['Is Correct?'] == 'n': continue
            edit_map[row['Ref Ramban']] += [row['Ref Commentator']]
    issue_count = 0
    for ref, edit_list in tqdm(edit_map.items(), total=len(edit_map), desc='comm links'):
        for comm_ref in edit_list:
            comm_oref = Ref(comm_ref)
            if comm_oref.index.collective_title in {'Rashi', 'Ibn Ezra'}:
                segment_link = Link().load({
                    "refs": sorted([ref, comm_ref]),
                    "auto": True,
                })
                section_link = Link().load({
                    "refs": sorted([ref, comm_oref.section_ref().normal()]),
                    "auto": True,
                })
                if section_link is not None and segment_link is not None:
                    section_link.delete()
                    print("DELETE", section_link.refs, "because of ", segment_link.refs)
                    issue_count += 1
    print("DELETED", issue_count)

if __name__ == "__main__":
    # onkelos_kw_resolver, rashi_kw_resolver, ibn_kw_resolver = get_keyword_resolvers()
    # add_commentary_links(onkelos_kw_resolver, rashi_kw_resolver, ibn_kw_resolver, dry_run=False)
    # add_edited_links(dry_run=False)
    # add_halachic_midrash_links()
    delete_section_level_comm_links()

"""
POD=devpod-noah-846cdffc8b-8l5wl
kubectl cp "/home/nss/sefaria/project/data/Ramban links - Modified Citations.csv" $POD:/app/data
kubectl cp "/home/nss/sefaria/project/data/Ramban links - Links to Rashi, Ibn Ezra & Onkelos.csv" $POD:/app/data
kubectl cp "/home/nss/sefaria/project/data/Ramban links - Halachic Midrash.csv" $POD:/app/data
kubectl cp /home/nss/sefaria/project/scripts/add_ramban_links.py $POD:/app/scripts
"""
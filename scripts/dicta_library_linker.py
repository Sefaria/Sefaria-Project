import django, os, json
from functools import reduce
django.setup()
from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation
from sefaria.helper.linker import make_html


def get_text(dicta_obj):
    return strip_cantillation(reduce(lambda a, b: a + b['text'], dicta_obj['tokens'], ""), strip_vowels=True)


def run_on_page(path, tref):
    filename = os.path.join(path, f'{tref}__combined_data.json')
    with open(filename, 'r') as fin:
        jin = json.load(fin)
    text = get_text(jin)
    #text = """וכן כתב הרמב"ם ז"ל בהלכות טוען ונטען פ"ב"""
    ref_resolver = library.get_ref_resolver()
    resolved = ref_resolver.bulk_resolve_refs("he", [None], [text], with_failures=True)
    make_html([resolved], [[text]], f"../data/private/linker_results/{tref}.html")


if __name__ == '__main__':
    run_on_page("/Users/nss/Downloads", "toratchesed-009")
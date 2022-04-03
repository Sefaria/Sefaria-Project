import django, os, json
from functools import reduce
django.setup()
from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation
from sefaria.helper.ref_part import make_html


def get_text(dicta_obj):
    return strip_cantillation(reduce(lambda a, b: a + b['text'], dicta_obj['tokens'], ""), strip_vowels=True)


def run_on_page(path, book, page):
    filename = os.path.join(path, f'{book}-{page:03d}__combined_data.json')
    with open(filename, 'r') as fin:
        jin = json.load(fin)
    text = get_text(jin)

    ref_resolver = library.get_ref_resolver()
    resolved = ref_resolver.bulk_resolve_refs("he", [None], [text])
    make_html([resolved], f"../data/linker_results/{book}-{page:03d}.html")


if __name__ == '__main__':
    run_on_page("/Users/nss/Downloads", "toratchesed", 9)
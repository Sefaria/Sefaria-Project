from typing import List, Iterable
import django
django.setup()
import spacy, csv
from spacy import Language
from sefaria.model import *
from sefaria.model.ref_part import ResolvedRawRef
from tqdm import tqdm


def parse_book(title: str, resolver: RefResolver) -> Iterable:
    input_text = []
    input_context_refs = []

    def collect_input(s: str, en_tref: str, he_tref: str, v: Version) -> None:
        nonlocal input_text, input_context_refs
        input_text += [s]
        input_context_refs += [Ref(en_tref)]

    version = VersionSet({"title": title, "language": "he"}).array()[0]
    version.walk_thru_contents(collect_input)
    resolved = resolver.bulk_resolve_refs('he', input_context_refs, input_text, with_failures=True, verbose=True)
    return zip(input_context_refs, resolved)


def save_resolved_refs(resolved):
    total, num_resolved = 0, 0
    with open('../data/gilyon_refs_resolved.csv', 'w') as fout:
        c = csv.DictWriter(fout, ['Input Ref', 'Found Citation', 'Found Ref'])
        c.writeheader()
        for input_ref, resolved_for_seg in resolved:
            for resolved_raw_ref in resolved_for_seg:
                total += 1
                row = {
                    "Input Ref": input_ref.normal(),
                    "Found Citation": resolved_raw_ref.raw_ref.text,
                }
                if resolved_raw_ref.ref is not None:
                    num_resolved += 1
                    row['Found Ref'] = resolved_raw_ref.ref.normal()
                c.writerow(row)
    print(f"Percent Resolved: {num_resolved}/{total} ({round(num_resolved/total*100, 2)}%)")


if __name__ == '__main__':
    resolver = library.get_ref_resolver()
    resolved = parse_book("Gilyon HaShas on Berakhot", resolver)
    save_resolved_refs(resolved)

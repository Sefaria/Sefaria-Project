import django, csv, json, re
from typing import List, Optional, Union, Tuple
django.setup()
from sefaria.model import *
from sefaria.model.ref_part import ResolvedRawRef, RefPartType
from sefaria.helper.normalization import NormalizerComposer


def get_window_around_match(start_char:int, end_char:int, text:str, window:int=10) -> tuple:
    before_window, after_window = '', ''

    before_text = text[:start_char]
    before_window_words = list(filter(lambda x: len(x) > 0, before_text.split()))[-window:]
    before_window = " ".join(before_window_words)

    after_text = text[end_char:]
    after_window_words = list(filter(lambda x: len(x) > 0, after_text.split()))[:window]
    after_window = " ".join(after_window_words)

    return before_window, after_window


class YerushalmiCatcher:

    def __init__(self, lang: str, vtitle: str):
        self.lang = lang
        self.vtitle = vtitle
        self.resolver = library.get_ref_resolver()
        self.normalizer = NormalizerComposer(['unidecode', 'html', 'maqaf', 'cantillation', 'double-space'])
        self.output_file = open('../data/yerushalmi_translation_refs.csv', 'w')
        self.output_csv = csv.DictWriter(self.output_file, ['Context Ref', 'Before', 'Raw Ref', 'After', 'Raw Ref', 'Parsed Ref', 'Ref Parts'])
        self.output_csv.writeheader()

    def catch_refs_in_category(self, cat: str):
        for title in library.get_indexes_in_category(cat):
            self.catch_refs_in_title(title)

    def catch_refs_in_title(self, title: str):
        version = Version().load({"title": title, "language": self.lang, "versionTitle": self.vtitle})
        version.walk_thru_contents(self.catch_refs_in_ref)

    def catch_refs_in_ref(self, st: str, en_tref: str, he_tref: str, version: Version) -> None:
        print(en_tref)
        context_ref = Ref(en_tref)
        norm_st = self.normalizer.normalize(st)
        resolved_refs = self.resolver.resolve_refs_in_string(self.lang, context_ref, norm_st, with_failures=True)
        resolved_refs = self.post_process_resolved_refs(resolved_refs, context_ref)
        norm_indices = [r.raw_ref.char_indices for r in resolved_refs]
        mapping = self.normalizer.get_mapping_after_normalization(st)
        orig_indices = self.normalizer.convert_normalized_indices_to_unnormalized_indices(norm_indices, mapping)

        for resolved_ref, (start_char, end_char) in zip(resolved_refs, orig_indices):
            before_context, after_context = get_window_around_match(start_char, end_char, st)
            self.output_csv.writerow({
                "Context Ref": en_tref,
                "Before": before_context,
                "After": after_context,
                "Raw Ref": resolved_ref.raw_ref.text,
                "Parsed Ref": resolved_ref.ref.normal() if resolved_ref.ref is not None else "",
                "Ref Parts": "|".join(part.text for part in resolved_ref.raw_ref.raw_ref_parts),
            })

    def finish(self):
        self.output_file.close()

    @staticmethod
    def post_process_resolved_refs(resolved_refs: List[ResolvedRawRef], context_ref: Ref) -> List[ResolvedRawRef]:
        prev_resolved_ref = None
        for resolved_ref in resolved_refs:
            parts = resolved_ref.raw_ref.raw_ref_parts
            if resolved_ref.ref is not None:
                if resolved_ref.ref.is_book_level():
                    resolved_ref.ref = None
                elif len(parts) == 2 and parts[0].text in {"Mishnah", "Mishnaiot"} and parts[1].type in {RefPartType.NUMBERED, RefPartType.RANGE}:
                    mishnah_sec = resolved_ref.ref.sections[0]
                    mishnah_toSec = resolved_ref.ref.toSections[0]
                    if mishnah_sec != mishnah_toSec:
                        end_secs = f"{mishnah_sec}:1-{mishnah_toSec}:1"
                    else:
                        end_secs = mishnah_sec
                    perek = context_ref.sections[0]
                    resolved_ref.ref = Ref(f"{context_ref.index.title} {perek}:{end_secs}")  # super hacky, but what can ya do?
            if resolved_ref.ref is None:
                if len(parts) == 1 and re.search(r"^[vV]\. \d+", parts[0].text) is not None and prev_resolved_ref is not None and prev_resolved_ref.ref is not None and prev_resolved_ref.ref.primary_category == "Tanakh":
                    pasuk = re.search(r"^[vV]\. (\d+)", parts[0].text).group(1)
                    perek = prev_resolved_ref.ref.sections[0]
                    resolved_ref.ref = Ref(f"{prev_resolved_ref.ref.index.title} {perek}:{pasuk}")
            prev_resolved_ref = resolved_ref


        return resolved_refs

if __name__ == '__main__':
    catcher = YerushalmiCatcher('en', 'Guggenheimer Translation 2.1')
    catcher.catch_refs_in_title('Jerusalem Talmud Taanit')
    catcher.finish()

"""
post processing
- if both vilna and lieberman tosefta match, choose lieberman
- if "Note" or "Notes" is in raw_ref, look up in note map
if "Mishnah" and one number in raw_ref, add perek from context

TODO
- why are "Halacha" and "Mishna" not being marked as ref parts?
- figure out how to throw out bad matches
- how to deal with "Mishnah 2"? Maybe a context swap?
- non-cts type (test: Babli 30b,31a)

Alt titles to deal with
- Ex. rabba 15(17
- Mekhilta dR. Ismael Bo Chap. 14
- Sifry Num. 84, 161
- Midrash Ps.
- Tanhuma Mas`e 6
- Thr. rabba

Examples to train on
Jerusalem Talmud Taanit 1:1:18
Jerusalem Talmud Taanit 2:4:1
Jerusalem Talmud Taanit 2:2:3
Jerusalem Talmud Taanit 4:7:2
"""

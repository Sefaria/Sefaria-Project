import django, csv, json, re
from typing import List, Optional, Union, Tuple
django.setup()
from tqdm import tqdm
from collections import defaultdict
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.model.ref_part import ResolvedRawRef, RefPartType
from sefaria.helper.normalization import NormalizerComposer

VTITLE = 'Guggenheimer Translation 2.1'

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

    def __init__(self, lang: str, vtitle: str, vilna_zm_map_file):
        self.footnote_map = self.create_footnote_mapping()
        self.lang = lang
        self.vtitle = vtitle
        self.create_zm_vilna_map(vilna_zm_map_file)
        self.resolver = library.get_ref_resolver()
        self.normalizer = NormalizerComposer(['unidecode', 'html', 'maqaf', 'cantillation', 'double-space'])

    def create_zm_vilna_map(self, vilna_zm_map_file):
        with open(vilna_zm_map_file, 'r') as fin:
            # need to flip mapping to be in direction that we need
            self.zm_vilna_map = {}
            vilna_zm_map = json.load(fin)
            for vilna_ref, zm_ref in vilna_zm_map.items():
                vilna_oref = Ref(vilna_ref)
                title = vilna_oref.index.title
                sec, seg, toSec, toSeg = re.split(r'[\-:]', zm_ref)
                if sec != toSec:
                    print(zm_ref, vilna_ref)
                    # this seems like an error. Yishai is looking into it
                    continue
                for temp_seg in range(int(seg), int(toSeg) + 1):
                    zm_ref = f'{title} {sec}:{temp_seg}'
                    if zm_ref in self.zm_vilna_map:
                        curr_vilna_oref = self.zm_vilna_map[zm_ref]
                        assert curr_vilna_oref.precedes(vilna_oref)
                        self.zm_vilna_map[zm_ref] = curr_vilna_oref.to(vilna_oref)
                    else:
                        self.zm_vilna_map[zm_ref] = vilna_oref

    @staticmethod
    def create_footnote_mapping():
        from bs4 import BeautifulSoup
        footnote_map = {}

        def footnote_mapper(s: str, en_tref: str, he_tref: str, version: Version) -> None:
            nonlocal footnote_map
            chapter_ref = Ref(en_tref.split(':')[0])
            soup = BeautifulSoup("<root>{}</root>".format(s), 'lxml')
            itag_list = soup.find_all(TextChunk._find_itags)
            for itag in itag_list:
                if itag.name != 'sup': continue  # technically possible but dont think this happens
                try:
                    footnote_text = itag.text.replace(',', '')
                    footnote_num = int(footnote_text)
                except ValueError:
                    # print(f"non-numeric footnote {itag.text}")
                    continue
                if footnote_num in footnote_map: continue  # only map to the first occurrence of footnote_num
                footnote_map[(chapter_ref.normal(), footnote_num)] = en_tref

        for title in tqdm(library.get_indexes_in_category("Yerushalmi")):
            version = Version().load({"title": title, "versionTitle": VTITLE, "language": "en"})
            if version is None: print("None version", title); continue
            version.walk_thru_contents(footnote_mapper)

        return footnote_map

    def catch_refs_in_category(self, cat: str):
        for title in library.get_indexes_in_category(cat):
            self.catch_refs_in_title(title)

    def catch_refs_in_title(self, title: str):
        output_file = open(f'../data/yerushalmi refs/{title}.csv', 'w')
        self.output_csv = csv.DictWriter(output_file, ['Context Ref', 'Before', 'Raw Ref', 'After', 'Raw Ref', 'Parsed Ref', 'Ref Parts', 'Start Char', 'End Char'])
        self.output_csv.writeheader()

        self.resolver_input = []
        version = Version().load({"title": title, "language": self.lang, "versionTitle": self.vtitle})
        version.walk_thru_contents(self.collect_resolver_input)
        context_refs, input_text = zip(*self.resolver_input)
        all_resolved_refs = self.resolver.bulk_resolve_refs(self.lang, context_refs, input_text, with_failures=True, verbose=True)
        self.resolved_refs_by_context = {}
        for context_ref, resolved_refs in zip(context_refs, all_resolved_refs):
            self.resolved_refs_by_context[context_ref.normal()] = resolved_refs
        version.walk_thru_contents(self.catch_refs_in_ref)
        output_file.close()

    def collect_resolver_input(self, st: str, en_tref: str, he_tref: str, version: Version) -> None:
        context_ref = Ref(en_tref)
        norm_st = self.normalizer.normalize(st)
        self.resolver_input += [(context_ref, norm_st)]

    def catch_refs_in_ref(self, st: str, en_tref: str, he_tref: str, version: Version) -> None:
        context_ref = Ref(en_tref)
        resolved_refs = self.resolved_refs_by_context[en_tref]
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
                "Start Char": start_char,
                "End Char": end_char,
            })

    def get_note_ref(self, raw_ref_text, context_ref: Ref) -> Optional[Ref]:
        m = re.search(r"Notes? (\d+)(?:[\-–](\d+))?", raw_ref_text)
        sec_fn = int(m.group(1))
        try:
            toSec_fn = int(m.group(2))
        except (IndexError, TypeError):
            toSec_fn = None
        chap_ref = context_ref.normal().split(':')[0]
        sec = self.footnote_map.get((chap_ref, sec_fn), None)
        toSec = self.footnote_map.get((chap_ref, toSec_fn), None)
        if sec is not None:
            new_ref = Ref(sec)
            if toSec is not None:
                try:
                    new_ref = new_ref.to(Ref(toSec))
                except InputError:
                    pass
            return new_ref

    def post_process_resolved_refs(self, resolved_refs: List[ResolvedRawRef], context_ref: Ref) -> List[ResolvedRawRef]:
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
                        end_secs = str(mishnah_sec) + ":1"
                    perek = context_ref.sections[0]
                    resolved_ref.ref = Ref(f"{context_ref.index.title} {perek}:{end_secs}")  # super hacky, but what can ya do?
                elif len(parts) == 2 and parts[0].text in {'Halakhah', 'Halacha', 'Halachah', 'Halakhot'} and parts[1].type in {RefPartType.NUMBERED, RefPartType.RANGE}:
                    mishnah_sec = resolved_ref.ref.sections[0]
                    mishnah_toSec = resolved_ref.ref.toSections[0]
                    if mishnah_sec != mishnah_toSec:
                        end_secs = f"{mishnah_sec}-{mishnah_toSec}"
                    else:
                        end_secs = mishnah_sec
                    perek = context_ref.sections[0]
                    resolved_ref.ref = Ref(f"{context_ref.index.title} {perek}:{end_secs}")  # super hacky, but what can ya do?
                elif resolved_ref.ref.index.title.startswith('Jerusalem Talmud ') and re.search(r"Notes? \d+", resolved_ref.raw_ref.text) is not None:
                    note_ref = self.get_note_ref(resolved_ref.raw_ref.text, resolved_ref.ref)
                    if note_ref is not None:
                        resolved_ref.ref = note_ref
                elif resolved_ref.ambiguous and '/'.join(resolved_ref.ref.index.categories).startswith('Tosefta/Vilna Edition/'):
                    # delete vilan tosefta when liberman exists
                    resolved_ref.ref = None
                elif resolved_ref.ambiguous and '/'.join(resolved_ref.ref.index.categories).startswith('Tosefta/Lieberman Edition/'):
                    # mark as non-ambiguous
                    resolved_ref.ambiguous = False
                elif not resolved_ref.ambiguous and '/'.join(resolved_ref.ref.index.categories).startswith('Tosefta/Vilna Edition/'):
                    # actually zm. map to vilna
                    zm_oref = resolved_ref.ref
                    if len(zm_oref.all_segment_refs()) > 1:
                        try:
                            vilna_orefs = [self.zm_vilna_map[r.normal()] for r in zm_oref.all_segment_refs()]
                            vilna_orefs.sort(key=lambda x: x.order_id())
                            vilna_oref = vilna_orefs[0].to(vilna_orefs[-1])
                        except KeyError:
                            vilna_oref = None
                    else:
                        vilna_oref = self.zm_vilna_map.get(resolved_ref.ref.normal(), None)
                    if vilna_oref is None:
                        print("FAILED to map", resolved_ref.ref.normal())
                    resolved_ref.ref = vilna_oref
            if resolved_ref.ref is None:
                if 1 <= len(parts) <= 2 and re.search(r"^[vV] ?\. \d+", parts[0].text) is not None and prev_resolved_ref is not None and prev_resolved_ref.ref is not None and prev_resolved_ref.ref.primary_category == "Tanakh":
                    if len(parts) == 1:
                        pasuk = re.search(r"^[vV] ?\. (\d+)", parts[0].text).group(1)
                        perek = prev_resolved_ref.ref.sections[0]
                        sections = f"{perek}:{pasuk}"
                    else:
                        sections = re.sub(r"^[vV] ?\. ", "", resolved_ref.raw_ref.text)
                    resolved_ref.ref = Ref(f"{prev_resolved_ref.ref.index.title} {sections}")
                elif len(parts) == 1 and re.search(r"^vv ?\. \d+", parts[0].text) is not None and prev_resolved_ref is not None and prev_resolved_ref.ref is not None and prev_resolved_ref.ref.primary_category == "Tanakh":
                    sections = re.sub(r"^vv ?\. ", "", parts[0].text)
                    if ':' not in sections:
                        # need to pull perek from prev ref
                        sections = f"{prev_resolved_ref.ref.sections[0]}:{sections}"
                    title = prev_resolved_ref.ref.index.title
                    resolved_ref.ref = Ref(f"{title} {sections}")
                elif re.search(r"^Notes? \d+", resolved_ref.raw_ref.text) is not None:
                    note_ref = self.get_note_ref(resolved_ref.raw_ref.text, context_ref)
                    if note_ref is not None:
                        resolved_ref.ref = note_ref
                elif re.search(r"^Chapter \d+ ?.+ Notes? \d+", resolved_ref.raw_ref.text) is not None:
                    chapter_num = re.search(r"^Chapter (\d+)", resolved_ref.raw_ref.text).group(1)
                    temp_context_ref = Ref(f"{context_ref.index.title} {chapter_num}")
                    note_ref = self.get_note_ref(resolved_ref.raw_ref.text, temp_context_ref)
                    if note_ref is not None:
                        resolved_ref.ref = note_ref
            prev_resolved_ref = resolved_ref
            # remove empty refs
            if resolved_ref.ref is not None and resolved_ref.ref.is_empty():
                resolved_ref.ref = None
            if resolved_ref.ambiguous:
                # remove ambiguous refs
                resolved_ref.ref = None
        return resolved_refs

    def get_wrapped_ref_link_string(self, links, s, context_ref):
        """
        Shamelessly copy-pasted
        Parallel to library.get_wrapped_refs_string
        Returns `s` with every link in `links` wrapped in an a-tag
        """
        if len(links) == 0:
            return s
        links.sort(key=lambda x: x['startChar'])

        # replace all mentions with `dummy_char` so they can later be easily replaced using re.sub()
        # this ensures char locations are preserved
        dummy_char = "█"
        char_list = list(s)
        start_char_to_slug = {}
        for link in links:
            start = link['startChar']
            end = link['endChar']
            mention = s[start:end]
            if self.normalizer.normalize(mention) != link['text']:
                # dont link if current text at startChar:endChar doesn't match text on link
                print(context_ref, self.normalizer.normalize(mention), 'not equal', link['text'])
                continue
            start_char_to_slug[start] = (mention, link['refURL'], link['ref'])
            char_list[start:end] = list(dummy_char*(end-start))
        dummy_text = "".join(char_list)

        def repl(match):
            try:
                mention, ref_url, ref = start_char_to_slug[match.start()]
            except KeyError:
                return match.group()
            return f"""<a href="/{ref_url}" class="refLink" data-ref="{ref}">{mention}</a>"""
        return re.sub(fr"{dummy_char}+", repl, dummy_text)

    def wrap_refs_in_title(self, title):
        from sefaria.tracker import modify_bulk_text

        link_obj_by_ref = defaultdict(list)
        text_map = {}

        def create_text_map(s, en_tref, he_tref, v):
            nonlocal link_obj_by_ref, text_map
            # remove previous wrapped links
            s = re.sub(r'<a href[^>]+?>', '', s)
            s = s.replace('</a>', '')
            links = link_obj_by_ref.get(en_tref, [])
            new_text = self.get_wrapped_ref_link_string(links, s, en_tref)
            text_map[en_tref] = new_text

        with open(f'../data/yerushalmi refs/{title}.csv', 'r') as fin:
            cin = csv.DictReader(fin)
            for row in cin:
                if len(row['Parsed Ref']) == 0: continue
                oref = Ref(row['Parsed Ref'])
                if oref.is_empty(): continue
                link_obj_by_ref[row['Context Ref']] += [{
                    "text": row['Raw Ref'],
                    "startChar": int(row['Start Char']),
                    "endChar": int(row["End Char"]),
                    "ref": oref.normal(),
                    "refURL": oref.url()
                }]
        version = Version().load({"title": title, "versionTitle": self.vtitle, "language": self.lang})
        version.walk_thru_contents(create_text_map)
        modify_bulk_text(5842, version, text_map, skip_links=True)


if __name__ == '__main__':
    catcher = YerushalmiCatcher('en', VTITLE, "../data/vilna_to_zukermandel_tosefta_map.json")
    catcher.catch_refs_in_title('Jerusalem Talmud Moed Katan')
    catcher.wrap_refs_in_title('Jerusalem Talmud Moed Katan')

"""
post processing


TODO
- Chapter 1, Notes 34, 143 non-cts notes (row 209 of Pesachim)
- Midrash refs
- Find missing alt titles

Alt titles to deal with
- Ex. rabba 15(17
- Deut. rabba Eqeb 1 (some

- Mekhilta dR. Ismael Bo Chap. 14
- Sifra Qedošim Pereq 11(8
- Sifra Wayyiqra II (Hovah) Pereq 11(3
- Sifra, Introduction 5
- Sifra Mesora‘ Parašah 4(4
Sifra Ahare Parašah 2(1
Mesora

- Sifry Num. 84, 161
- Sifry Deut . #288
- Sifry zuta Behaˋalotekha 9(2
- Midrash Ps.
- Tanhuma Mas`e 6
- Tanhuma Buber Šemini 10
- Tanhuma Qorah 2 (Buber 4
- Derekh Eres Rabba 1
- Šulhan Arukh Yoreh Deˋa 89(4
- Hošen Mišpat §95 Note 67
- Or Zaruaˋ II §229
- Midrash Samuel 7(5


- Rashba, Novellae ad 78b
- Maimonides ( Hilkhot Hovel umazziq 2:2
- Rosh (Chapter 8, §1
- Śemahot 1:13
- Megillat Ta ˋ anit 6
- Yalqut Šimˋony 736
- Seder Olam Chap. 2

Examples to train on
Jerusalem Talmud Yevamot 2:4:8

"""

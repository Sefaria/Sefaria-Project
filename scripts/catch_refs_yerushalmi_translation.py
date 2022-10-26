import django, csv, json, re
from typing import List, Optional, Union, Tuple
from lxml import etree
from io import StringIO
from lxml.etree import XMLSyntaxError
from tqdm import tqdm
from collections import defaultdict
from sefaria.model import *
from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.model.linker import ResolvedRef, RefPartType
from sefaria.helper.normalization import NormalizerComposer
from bs4 import BeautifulSoup
from sefaria.tracker import modify_bulk_text

django.setup()

VTITLE = 'The Jerusalem Talmud, translation and commentary by Heinrich W. Guggenheimer. Berlin, De Gruyter, 1999-2015'


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

    def __init__(self, lang: str, vtitle: str, vilna_zm_map_file, gug_vilna_map_file):
        self.create_gug_vilna_map(gug_vilna_map_file)
        self.mishna_not_in_yerushalmi = self.get_mishna_not_in_yerushalmi()
        self.footnote_map = self.create_footnote_mapping()
        self.lang = lang
        self.vtitle = vtitle
        self.create_zm_vilna_map(vilna_zm_map_file)
        self.resolver = library.get_ref_resolver()
        self.normalizer = NormalizerComposer(['unidecode', 'html', 'maqaf', 'cantillation', 'double-space'])


    def get_mishna_not_in_yerushalmi(self):
        mishna = library.get_indexes_in_category("Mishnah")
        yerush = library.get_indexes_in_category("Yerushalmi")
        mtits = [m.replace('Mishnah ', '') for m in mishna]
        ytits = [y.replace('Jerusalem Talmud ', '') for y in yerush]
        return set(mtits).difference(set(ytits))

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
                        if curr_vilna_oref.contains(vilna_oref):
                            continue
                        curr_vilna_oref, vilna_oref = (curr_vilna_oref, vilna_oref) if curr_vilna_oref.precedes(vilna_oref) else (vilna_oref, curr_vilna_oref)
                        self.zm_vilna_map[zm_ref] = curr_vilna_oref.to(vilna_oref)
                    else:
                        self.zm_vilna_map[zm_ref] = vilna_oref

    def create_gug_vilna_map(self, gug_vilna_map_file):
        """
        sample gug key: "sabbat-chapter11-mishna1-p1"
        "kilaim-chapter9-mishna4-halacha4-p17"
        """
        self.gug_vilna_map = {}
        with open(gug_vilna_map_file, 'r') as fin:
            gug_vilna_map_raw = json.load(fin)
            for gug_raw, vilna in gug_vilna_map_raw.items():
                vilna_oref = Ref(vilna)
                gug_match = re.search(r"chapter(\d+)-mishnau?(\d+)-p\d+$", gug_raw)
                if gug_match is not None:
                    gug_tref = f"{vilna_oref.index.title} {gug_match.group(1)}:{gug_match.group(2)}:1"
                else:
                    # halacha
                    gug_match = re.search(r"chapter(\d+)-mishnau?\d+-halachau?(\d+)-p\d+a?$", gug_raw)
                    gug_tref = f"{vilna_oref.index.title} {gug_match.group(1)}:{gug_match.group(2)}"

                if gug_tref in self.gug_vilna_map:
                    curr_vilna_oref = self.gug_vilna_map[gug_tref]
                    if curr_vilna_oref.contains(vilna_oref):
                        continue
                    curr_vilna_oref, vilna_oref = (curr_vilna_oref, vilna_oref) if curr_vilna_oref.precedes(vilna_oref) else (vilna_oref, curr_vilna_oref)
                    self.gug_vilna_map[gug_tref] = curr_vilna_oref.to(vilna_oref)
                else:
                    self.gug_vilna_map[gug_tref] = vilna_oref

    @staticmethod
    def create_footnote_mapping():
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
            print(title)
            self.catch_refs_in_title(title)

    def wrap_refs_in_category(self, cat: str, output_html=False):
        total = 0
        for title in library.get_indexes_in_category(cat):
            print('wrap', title)
            total += self.wrap_refs_in_title(title, output_html=output_html)
        return total

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
        if m is None:
            return None
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

    def post_process_resolved_refs(self, resolved_refs: List[ResolvedRef], context_ref: Ref) -> List[ResolvedRef]:
        prev_resolved_ref = None
        verses_reg = r"^[vV](?:erses?| ?\.)"
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
                if 1 <= len(parts) <= 2 and re.search(fr"{verses_reg} \d+", parts[0].text) is not None and prev_resolved_ref is not None and prev_resolved_ref.ref is not None and prev_resolved_ref.ref.primary_category == "Tanakh":
                    if len(parts) == 1:
                        pasuk = re.search(fr"{verses_reg} (\d+)", parts[0].text).group(1)
                        perek = prev_resolved_ref.ref.sections[0]
                        sections = f"{perek}:{pasuk}"
                    else:
                        sections = re.sub(fr"^{verses_reg} ", "", resolved_ref.raw_ref.text)
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
                elif "Note" in resolved_ref.raw_ref.text:
                    # note ref to another masechet
                    span_end = None
                    raw_ref = resolved_ref.raw_ref
                    for i, part in enumerate(raw_ref.raw_ref_parts):
                        if "Note" in part.text:
                            span_end = i
                            break
                    if span_end is not None:
                        subspan_slice = slice(0, span_end)
                        subspan = raw_ref.subspan(subspan_slice)
                        new_raw_ref = RawRef('en', raw_ref.raw_ref_parts[subspan_slice], subspan)
                        temp_resolved_refs = self.resolver.resolve_raw_ref('en', context_ref, new_raw_ref)
                        for temp_resolved_ref in temp_resolved_refs:
                            temp_ref = temp_resolved_ref.ref
                            if temp_ref is not None and temp_ref.index.title.startswith("Jerusalem Talmud"):
                                note_ref = self.get_note_ref(resolved_ref.raw_ref.text, temp_ref)
                                if note_ref is not None:
                                    resolved_ref.ref = note_ref

            # map gug to vilna. this is dirty...
            if resolved_ref.ref is not None and re.match(r'(Mishnah|Jerusalem Talmud) ', resolved_ref.ref.index.title) is not None and "Note" not in resolved_ref.raw_ref.text:
                oref = resolved_ref.ref
                skip = False
                ref_prob_ok = False
                gug_keys = []
                if oref.index.title.startswith('Jerusalem Talmud '):
                    is_mishna_level = len(oref.sections) == 3
                    if is_mishna_level:
                        section_refs = set()
                        for seg_ref in oref.all_segment_refs():
                            section_refs.add(seg_ref.section_ref().normal())
                    else:
                        section_refs = [r.normal() for r in oref.split_spanning_ref()]
                    for sec_ref in section_refs:
                        if is_mishna_level:
                            sec_ref += ':1'
                        gug_keys += [sec_ref]
                else:
                    # mishnah
                    shas_match = re.match('Mishnah (.+?) \d+(?::\d+)?$', oref.normal())
                    shas_title = None
                    if shas_match is not None:
                        shas_title = shas_match.group(1)
                    if shas_title is None or shas_title in self.mishna_not_in_yerushalmi:
                        # not mappable. still possible the mishna is incorrect though
                        if shas_title in self.mishna_not_in_yerushalmi:
                            ref_prob_ok = True
                        print("SKIPPING mishna", oref.normal(), "CONTEXT", context_ref.normal())
                        skip = True
                    for seg_ref in oref.all_segment_refs():
                        gug_keys += [f'Jerusalem Talmud {shas_title} {seg_ref.sections[0]}:{seg_ref.sections[1]}:1']
                curr_vilna_oref = None
                try:
                    for gug_key in gug_keys:
                        vilna_oref = self.gug_vilna_map[gug_key]
                        if curr_vilna_oref is not None:
                            if curr_vilna_oref.contains(vilna_oref):
                                continue
                            curr_vilna_oref, vilna_oref = (curr_vilna_oref, vilna_oref) if curr_vilna_oref.precedes(
                                vilna_oref) else (vilna_oref, curr_vilna_oref)
                            curr_vilna_oref = curr_vilna_oref.to(vilna_oref)
                        else:
                            curr_vilna_oref = vilna_oref
                    if not skip or ref_prob_ok:
                        resolved_ref.ref = curr_vilna_oref
                    # print("SUCCESSFUL gug=>vilna map", oref.normal(), '=>', resolved_ref.ref.normal(), "CONTEXT:", context_ref.normal())
                except (KeyError, AttributeError):
                    if not ref_prob_ok:
                        if not skip:
                            print("FAILED gug=>vilna map", oref.normal(), "CONTEXT:", context_ref.normal())
                        resolved_ref.ref = None


            prev_resolved_ref = resolved_ref
            # remove empty refs
            if resolved_ref.ref is not None and resolved_ref.ref.is_empty():
                resolved_ref.ref = None
            if resolved_ref.ambiguous:
                # remove ambiguous refs
                resolved_ref.ref = None
        return resolved_refs

    def valid_html_indices(self, start, end, s):
        for s_offset, e_offset in ((0, 0), (-1, 0), (-2, 0), (-3, 0), (-4, 0)):
            temp_start = max(0, start+s_offset)
            temp_end = min(len(s)-1, end+e_offset)
            temp_mention = s[temp_start:temp_end]
            try:
                etree.parse(StringIO(temp_mention), etree.HTMLParser(recover=False))
                return temp_start, temp_end
            except XMLSyntaxError:
                pass
        return -1, -1

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
            start, end = self.valid_html_indices(start, end, s)
            mention = s[start:end]  # update
            if start == -1:
                print("NO VALID HTML", mention, context_ref)
                continue
            start_char_to_slug[start] = (mention, link['refURL'], link['ref'])
            char_list[start:end] = list(dummy_char*(end-start))
        dummy_text = "".join(char_list)

        def repl(match):
            try:
                mention, ref_url, ref = start_char_to_slug[match.start()]
            except KeyError:
                return match.group()
            if ref == "N/A":
                classes = f'class="refLink na"'
            else:
                classes = f'class="refLink"'
            return f"""<a {classes} data-ref="{ref}" href="/{ref_url}">{mention}</a>"""
        return re.sub(fr"{dummy_char}+", repl, dummy_text)

    def wrap_refs_in_title(self, title, output_html=False, skip_empty=True):
        total = 0
        link_obj_by_ref = defaultdict(list)
        text_map = {}

        def create_text_map(s, en_tref, he_tref, v):
            nonlocal link_obj_by_ref, text_map
            # remove previous wrapped links
            s = re.sub(r'<a class[^>]+?>', '', s)
            s = re.sub(r'<a href[^>]+?>', '', s)
            s = s.replace('</a>', '')
            links = link_obj_by_ref.get(en_tref, [])
            new_text = self.get_wrapped_ref_link_string(links, s, en_tref)
            text_map[en_tref] = new_text

        def make_html_row(tref, s):
            oref = Ref(tref)
            s = s.replace('href="/', 'href="https://jt4.cauldron.sefaria.org/')
            return f"""
            <p><a href="https://jt4.cauldron.sefaria.org/{oref.url()}">{tref}</a></p>
            <p>{s}</p>
            """

        with open(f'../data/yerushalmi refs/{title}.csv', 'r') as fin:
            cin = csv.DictReader(fin)
            for row in cin:
                oref = None if len(row['Parsed Ref']) == 0 else Ref(row['Parsed Ref'])
                if oref is None or oref.is_empty():
                    if skip_empty:
                       continue
                    ref = "N/A"
                    ref_url = "N/A"
                else:
                    ref = oref.normal()
                    ref_url = oref.url()
                total += 1
                link_obj_by_ref[row['Context Ref']] += [{
                    "text": row['Raw Ref'],
                    "startChar": int(row['Start Char']),
                    "endChar": int(row["End Char"]),
                    "ref": ref,
                    "refURL": ref_url
                }]
        version = Version().load({"title": title, "versionTitle": self.vtitle, "language": self.lang})
        version.walk_thru_contents(create_text_map)
        if output_html:
            html = f"""
            <html>
                <head>
                    <style>
                        body {{
                            width: 600px;
                            margin-right: auto;
                            margin-left: auto;
                        }}
                        .na {{
                            color: red;
                        }}
                    </style>
                </head>
                <body>
                {" ".join(make_html_row(x[0], x[1]) for x in sorted(text_map.items(), key=lambda x: Ref(x[0]).order_id()))}
                </body
            </html>
            """
            with open(f'../data/yerushalmi refs/html/{title}.html', 'w') as fout:
                fout.write(html)
        else:
            modify_bulk_text(5842, version, text_map, skip_links=True)
        return total

    def create_link_objects_in_title(self, title):
        CHAR_DIST = 6  # maximum distance of start of citation from end of footnote i-tag to be considered a link object

        footnote_end_char_map = defaultdict(list)
        footnote_span_map = defaultdict(set)
        footnote_reg = re.compile(r'<i class="footnote">')
        normalizer = NormalizerComposer(['br-tag', 'itag'])
        def footnote_mapper(s, en_tref, he_tref, v):
            nonlocal footnote_end_char_map, footnote_reg, normalizer, footnote_span_map
            for m in footnote_reg.finditer(s):
                footnote_end_char_map[en_tref] += [m.end()]
            itags = normalizer.find_text_to_remove(s, lenient=False)
            for (start, end), _ in itags:
                footnote_span_map[en_tref] |= set(range(start , end))

        version = Version().load({"title": title, "versionTitle": VTITLE, "language": "en"})
        if version is None: print("None version", title); return
        version.walk_thru_contents(footnote_mapper)

        links = []
        with open(f'../data/yerushalmi refs/{title}.csv', 'r') as fin:
            cin = csv.DictReader(fin)
            for row in cin:
                if len(row['Parsed Ref']) == 0: continue
                start_char = int(row['Start Char'])
                context_ref = row['Context Ref']
                potential_link = {
                    "refs": [context_ref, row['Parsed Ref']],
                    "generated_by": "yerushalmi_refs_inline",
                    "inline_citation": True
                }
                fn_end_chars = footnote_end_char_map[context_ref]
                fn_indexes = footnote_span_map[context_ref]
                if start_char in fn_indexes:
                    # citation in a footnote. make sure it's close the beginning
                    for end_char in fn_end_chars:
                        dist = (start_char - end_char)
                        if dist >= 0 and dist <= CHAR_DIST:
                            links += [potential_link]
                            footnote_end_char_map[context_ref] += [int(row['End Char'])]  # for a string of refs in a row
                            break
                else:
                    # outside footnote
                    links += [potential_link]

        for l in tqdm(links, desc='save links'):
            try:
                Link(l).save()
            except (KeyError, DuplicateRecordError):
                pass

    def create_link_objects_in_category(self, category):
        """
        only citations next to footnote i-tags will be made into link objects
        """

        for title in library.get_indexes_in_category(category):
            self.create_link_objects_in_title(title)


if __name__ == '__main__':
    catcher = YerushalmiCatcher('en', VTITLE, "../data/vilna_to_zukermandel_tosefta_map.json", "../data/gug_to_vilna_mishna_and_halacha_map.json")
    catcher.catch_refs_in_category('Yerushalmi')
    total = catcher.wrap_refs_in_category('Yerushalmi')
    print('Total wrapped refs', total)
    # LinkSet({"generated_by": "yerushalmi_refs_inline"}).delete()
    # catcher.create_link_objects_in_category('Yerushalmi')

    # catcher.catch_refs_in_title(f'Jerusalem Talmud Yoma')
    # catcher.create_link_objects_in_title('Jerusalem Talmud Berakhot')
    # catcher.wrap_refs_in_title(f'Jerusalem Talmud Yoma')

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
Jerusalem Talmud Chagigah 2:5:2
Jerusalem Talmud Chagigah 3:2:5
Jerusalem Talmud Horayot 1:1:2
Jerusalem Talmud Horayot 1:1:4
Jerusalem Talmud Horayot 3:2:14
Jerusalem Talmud Horayot 1:8:3
Jerusalem Talmud Horayot 1:8:5
Jerusalem Talmud Horayot 2:1:2
Jerusalem Talmud Horayot 2:5:3
Jerusalem Talmud Shabbat 7:2:8
Jerusalem Talmud Shabbat 1:8:6
Jerusalem Talmud Shabbat 12:1:6
Jerusalem Talmud Shabbat 16:5:2
Jerusalem Talmud Shabbat 16:7:2
Jerusalem Talmud Shabbat 17:6:2
Jerusalem Talmud Shabbat 21:3:1
Jerusalem Talmud Shabbat 19:5:2
Jerusalem Talmud Shabbat 1:8:3
Jerusalem Talmud Shabbat 7:2:36
Jerusalem Talmud Shabbat 17:1:3
Jerusalem Talmud Berakhot 1:1:1
Jerusalem Talmud Berakhot 9:1:4
Jerusalem Talmud Berakhot 2:8:3
Jerusalem Talmud Berakhot 2:4:16
Jerusalem Talmud Berakhot 2:4:5
Jerusalem Talmud Berakhot 2:3:16

Jerusalem Talmud Shabbat 1:7:2 check dh is parsed correctly

If ref is to JT
or to Mishnah look up in map
"""

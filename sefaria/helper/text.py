# coding=utf-8
import re
import sefaria.summaries as summaries
from sefaria.model import *
from sefaria.system import cache as scache
from sefaria.system.database import db
from sefaria.datatype.jagged_array import JaggedTextArray


def add_spelling(category, old, new, lang="en"):
    """
    For a given category, on every index in that title that matches 'old' create a new title with 'new' replacing 'old'
    :param category:
    :param old:
    :param new:
    :return:
    """
    indxs = library.get_indexes_in_category(category)
    for ind in indxs:
        i = get_index(ind)
        print
        assert isinstance(i, Index)
        schema = i.nodes
        assert isinstance(schema, JaggedArrayNode)
        for title in schema.all_node_titles(lang):
            if old in title:
                new_title = title.replace(old, new)
                print new_title
                schema.add_title(new_title, lang)
                i.save()


def create_commentator_and_commentary_version(commentator_name, existing_book, lang, vtitle, vsource):
    existing_index = Index().load({'title':existing_book})
    if existing_index is None:
        raise ValueError('{} is not a name of an existing text!'.format(existing_book))

    commentator_index = Index().load({'title':commentator_name})
    if commentator_index is None:
        index_json = {
            "title":commentator_name,
            "titleVariants":[],
            "heTitleVariants":[],
            "categories":["Commentary"],
            "sectionNames":["",""],
            "maps":[]
        }
        commentator_index = Index(index_json)
        commentator_index.save()

    new_version = Version(
                {
                    "chapter": existing_index.nodes.create_skeleton(),
                    "versionTitle": vtitle,
                    "versionSource": vsource,
                    "language": lang,
                    "title": "{} on {}".format(commentator_name, existing_book)
                }
    ).save()


def rename_category(old, new):
    """
    Walk through all index records, replacing every category instance
    called 'old' with 'new'.
    """
    indices = IndexSet({"categories": old})

    assert indices.count(), "No categories named {}".format(old)

    for i in indices:
        i.categories = [new if cat == old else cat for cat in i.categories]
        i.save()

    summaries.update_summaries()


def resize_text(title, new_structure, upsize_in_place=False):
    # todo: Needs to be converted to objects, but no usages seen in the wild.
    """
    Change text structure for text named 'title'
    to 'new_structure' (a list of strings naming section names)

    Changes index record as well as restructuring any text that is currently saved.

    When increasing size, any existing text will become the first segment of the new level
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]

    If upsize_in_place==True, existing text will stay in tact, but be wrapped in new depth:
    ["One", "Two", "Three"] -> [["One", "Two", "Three"]]

    When decreasing size, information is lost as any existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]

    """
    index = db.index.find_one({"title": title})
    if not index:
        return False

    old_structure = index["sectionNames"]
    index["sectionNames"] = new_structure
    db.index.save(index)

    delta = len(new_structure) - len(old_structure)
    if delta == 0:
        return True

    texts = db.texts.find({"title": title})
    for text in texts:
        if delta > 0 and upsize_in_place:
            resized = text["chapter"]
            for i in range(delta):
                resized = [resized]
        else:
            resized = JaggedTextArray(text["chapter"]).resize(delta).array()

        text["chapter"] = resized
        db.texts.save(text)

    # TODO Rewrite any existing Links
    # TODO Rewrite any exisitng History items

    summaries.update_summaries_on_change(title)
    scache.reset_texts_cache()

    return True

def merge_indices(title1, title2):
    """
    Merges two similar index records
    """
    #merge the index,
    #merge history refsscript to compare mishnah vers
    #TODO: needs more error checking that the indices and versions are of the same shape. Look nto comparing two (new format) index records
    idx1 = Index().load({"title":title1})
    if not idx1:
        return {"error": "Index not found: %s" % title1 }
    idx2 = Index().load({"title":title2})
    if not idx2:
        return {"error": "Index not found: %s" % title2 }
    #we're just going to trash idx2, but make sure all it's related objects move to idx1
    text.process_index_title_change_in_versions(idx1, old=title2, new=title1)
    link.process_index_title_change_in_links(idx1, old=title2, new=title1)
    history.process_index_title_change_in_history(idx1, old=title2, new=title1)
    idx2.delete()


def merge_text_versions(version1, version2, text_title, language, warn=False):
    """
    Merges the contents of two distinct text versions.
    version2 is merged into version1 then deleted.
    Preference is giving to version1 - if both versions contain content for a given segment,
    only the content of version1 will be retained.


    History entries are rewritten for version2.
    NOTE: the history of that results will be incorrect for any case where the content of
    version2 is overwritten - the history of those overwritten edits will remain.
    To end with a perfectly accurate history, history items for segments which have been overwritten
    would need to be identified and deleted.
    """
    v1 = Version().load({"title": text_title, "versionTitle": version1, "language": language})
    if not v1:
        return {"error": "Version not found: %s" % version1 }
    v2 = Version().load({"title": text_title, "versionTitle": version2, "language": language})
    if not v2:
        return {"error": "Version not found: %s" % version2 }

    if isinstance(v1.chapter, dict) or isinstance(v2.chapter, dict):
        raise Exception("merge_text_versions doesn't yet handle complex records")

    if warn and v1.ja().overlaps(v2.ja()):
        print "WARNING - %s & %s have overlapping content. Aborting." % (version1, version2)


    merged_text, sources = merge_texts([v1.chapter, v2.chapter], [version1, version2])

    v1.chapter = merged_text
    v1.save()
    history.process_version_title_change_in_history(v1, old=version2, new=version1)

    v2.delete()

    return {"status": "ok"}


def merge_multiple_text_versions(versions, text_title, language, warn=False):
    """
    Merges contents of multiple text versions listed in 'versions'
    Versions listed first in 'versions' will receive priority if there is overlap.
    """
    count = 0

    v1 = versions.pop(0)
    for v2 in versions:
        r = merge_text_versions(v1, v2, text_title, language)
        if r["status"] == "ok":
            count += 1
    return {"status": "ok", "merged": count + 1}

def merge_text_versions_by_source(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge that share the same value for versionSource.
    """
    v = VersionSet({"title": text_title, "language": language})

    for s in v.distinct("versionSource"):
        versions = VersionSet({"title": text_title, "versionSource": s, "language": language}).distinct("versionTitle")
        merge_multiple_text_versions(versions, text_title, language)


def merge_text_versions_by_language(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge.
    """
    versions = VersionSet({"title": text_title, "language": language}).distinct("versionTitle")
    merge_multiple_text_versions(versions, text_title, language)


# No usages found
def merge_text(a, b):
    """
    Merge two lists representing texts, giving preference to a, but keeping
    values froms b when a position in a is empty or non existant.

    e.g merge_text(["", "Two", "Three"], ["One", "Nope", "Nope", "Four]) ->
        ["One", "Two" "Three", "Four"]
    """
    length = max(len(a), len(b))
    out = [a[n] if n < len(a) and (a[n] or not n < len(b)) else b[n] for n in range(length)]
    return out


def modify_text_by_function(title, vtitle, lang, func, uid, **kwargs):
    """
    Walks ever segment contained in title, calls func on the text and saves the result.
    """
    from sefaria.tracker import modify_text
    section_refs = VersionStateSet({"title": title}).all_refs()
    for section_ref in section_refs:
        section = section_ref.text(vtitle=vtitle, lang=lang)
        segment_refs = section_ref.subrefs(len(section.text) if section.text else 0)
        if segment_refs:
            for i in range(len(section.text)):
                if section.text[i] and len(section.text[i]):
                    text = func(section.text[i])
                    modify_text(uid, segment_refs[i], vtitle, lang, text, **kwargs)


def replace_roman_numerals(text):
    """
    Replaces any roman numerals in 'text' with digits.
    Currently only looks for a roman numeral followed by a comma or period, then a space, then a digit.
    e.g. (Isa. Iv. 10) --> (Isa. 4:10)
    """
    import roman
    regex = re.compile(" (M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))([.,] )(\d)", re.I)
    def replace_roman_numerals_in_match(m):
        s = m.group(1)
        s = s.upper()
        try:
            if s:
                return " %s:%s" % (roman.fromRoman(s), m.group(6))
        except:
            return m.group(0)

    return re.sub(regex, replace_roman_numerals_in_match, text)


def make_versions_csv():
    """
    Returns a CSV of all version in the DB.
    """
    import csv
    import io
    output = io.BytesIO()
    writer = csv.writer(output)
    fields = [
        "title",
        "versionTitle",
        "language",
        "versionSource",
        "status",
        "priority",
        "license",
        "licenseVetted",
        "versionNotes",
        "digitizedBySefaria",
        "method",
    ]
    writer.writerow(fields)
    vs = VersionSet()
    for v in vs:
        writer.writerow([unicode(getattr(v, f, "")).encode("utf-8") for f in fields])

    return output.getvalue()



def add_blank_segment_after(ref):
    assert ref.is_segment_level()
    assert not ref.is_range()


class NextIntoThisSegmentSplicer(object):
    def __init__(self, ref):
        self.joiner = u" "
        self.ref = ref
        assert ref.is_segment_level()
        assert not ref.is_range()
        self.next_ref = ref.next_segment_ref()
        self.section_ref = ref.section_ref()
        self.book_ref = ref.context_ref(ref.index_node.depth)
        assert self.section_ref == self.next_ref.section_ref(), "Not sure if this works across sections"
        self.segment_number = ref.sections[-1]
        self.next_segment_number = self.segment_number + 1
        self.comment_section_lengths = self._get_comment_section_lengths()

    def execute(self):
        self.mergeBaseTextVersionSegments()
        self.mergeCommentaryVersionSections()
        self.removeBaseTextVersionSegments(self.next_ref)
        self.removeCommentaryVersionsSections(self.next_ref)
        self.rebuildVersionStates()
        
        # Rewrite links to base text (including links from own commentary)
        # It takes longer, but we start at the base text, so as not to miss any ranged refs
        self.rewrite_linkset(LinkSet(self.book_ref))

        # Rewrite links to commentary (including to base text)
        for commentary_title in library.get_commentary_version_titles_on_book(self.ref.index.title):
            self.rewrite_linkset(LinkSet(commentary_title), commentary=True)

        # Source sheet refs
        # Note refs
        # Tranlation requests?
        # History?
        # alt structs?
        # ES - delete last segment that hangs off the edge of commentaries after a merge

    def _get_comment_section_lengths(self):
        ret = {}
        for v in library.get_commentary_version_titles_on_book(self.ref.index.title):
            commentator_book_ref = Ref(v.title)
            commentator_segment_ref = commentator_book_ref.subref(self.ref.sections)
            ret[v.title] = len(commentator_segment_ref.get_state_ja().subarray_with_ref(commentator_segment_ref))
        return ret

    def rebuildVersionStates(self):
        # Refresh the version state of main text and commentary
        VersionState(self.ref.index).refresh()
        if not self.ref.is_commentary():
            for vt in library.get_commentary_version_titles_on_book(self.ref.index.title):
                VersionState(vt).refresh()

    def mergeBaseTextVersionSegments(self):
        # for each version, merge the text
        vs = VersionSet({"title": self.ref.index.title})
        for v in vs:
            assert isinstance(v, Version)
            current_tc = TextChunk(self.ref, lang=v.language, vtitle=v.versionTitle)
            next_tc = TextChunk(self.next_ref, lang=v.language, vtitle=v.versionTitle)
            if not current_tc.is_empty() or not self.next_ref.is_empty():
                current_tc.text = current_tc.text + self.joiner + next_tc.text
                current_tc.save()

    def mergeCommentaryVersionSections(self):
        # Merge comments for all commentary on this text
        if not self.ref.is_commentary():
            for v in library.get_commentary_versions_on_book(self.ref.index.title):
                assert isinstance(v, Version)
                commentator_book_ref = Ref(v.title)
                commentator_section_ref = commentator_book_ref.subref(self.section_ref.sections)
                tc = TextChunk(commentator_section_ref, lang=v.language, vtitle=v.versionTitle)
                if len(tc.text) < self.next_segment_number:
                    continue

                # Pad first section to uniform length, as derived from state, then add the next section on to the end
                comment_section_length = self.comment_section_lengths.get(v.title)
                assert len(tc.text[self.segment_number - 1]) <= comment_section_length
                tc.text[self.segment_number - 1] = tc.text[self.segment_number - 1] + [list() for _ in range(len(tc.text[self.segment_number - 1]), comment_section_length)] + tc.text[self.next_segment_number - 1]

                tc.save()

    @staticmethod
    def removeBaseTextVersionSegments(local_ref):
        assert local_ref.is_segment_level()
        local_section_ref = local_ref.section_ref()
        local_segment_number = local_ref.sections[-1]

        # Remove segment from all versions that have it
        for v in local_section_ref.versionset():
            tc = TextChunk(local_section_ref, lang=v.language, vtitle=v.versionTitle)
            if len(tc.text) < local_segment_number:
                continue
            tc.text = tc.text[:local_segment_number - 1] + tc.text[local_segment_number:]
            tc.save()

    @staticmethod
    def removeCommentaryVersionsSections(local_ref):
        assert local_ref.is_segment_level()
        local_section_ref = local_ref.section_ref()
        local_segment_number = local_ref.sections[-1]

        # Remove segment from all commentary on this text
        if not local_ref.is_commentary():
            for v in library.get_commentary_versions_on_book(local_ref.index.title):
                assert isinstance(v, Version)
                commentator_section_ref = Ref(v.title).subref(local_section_ref.sections)
                tc = TextChunk(commentator_section_ref, lang=v.language, vtitle=v.versionTitle)
                if len(tc.text) < local_segment_number:
                    continue
                tc.text = tc.text[:local_segment_number - 1] + tc.text[local_segment_number:]
                tc.save()

    def needs_rewrite(self, old_ref):
        assert isinstance(old_ref, Ref)

        def simple_needs_rewrite(old_simple_ref):
            assert isinstance(old_simple_ref, Ref)
            if (len(old_simple_ref.sections) >= self.ref.index.depth
                and old_simple_ref.sections[self.ref.index.depth - 2] == self.section_ref.sections[-1]
                and old_simple_ref.sections[self.ref.index.depth - 1] > self.segment_number
               ):
                return True
            return False

        if old_ref.is_range():
            return simple_needs_rewrite(old_ref.starting_ref()) or simple_needs_rewrite(old_ref.ending_ref())
        return simple_needs_rewrite(old_ref)

    def rewrite(self, old_ref, commentary=False):
        assert isinstance(old_ref, Ref)

        def simple_rewrite(old_simple_ref):
            if commentary and old_simple_ref.is_segment_level() and old_simple_ref.sections[self.ref.index.depth - 1] == self.next_segment_number:
                # Position of comment has changed
                d = old_simple_ref._core_dict()
                d["sections"][-2] -= - 1
                d["sections"][-1] += self.comment_section_lengths.get(old_simple_ref.index.title)
                d["toSections"] = d["sections"]
                return Ref(_obj=d)
            elif old_simple_ref.sections[self.ref.index.depth - 1] > self.segment_number:
                if not commentary:
                    return old_simple_ref.prev_segment_ref()
                else:
                    d = old_simple_ref._core_dict()
                    d["sections"][-2] -= 1
                    d["toSections"] = d["sections"]
                    return Ref(_obj=d)
            return old_simple_ref

        if old_ref.is_range():
            return simple_rewrite(old_ref.starting_ref()).to(simple_rewrite(old_ref.ending_ref()))
        return simple_rewrite(old_ref)

    def rewrite_linkset(self, lset, commentary=False):
        for link in lset:
            needs_save = False
            old_refs = []
            if self.needs_rewrite(Ref(link.refs[0])):
                needs_save = True
                old_refs = old_refs or link.refs[:]
                link.refs[0] = self.rewrite(Ref(link.refs[0]), commentary=commentary).normal()
            if self.needs_rewrite(Ref(link.refs[1])):
                needs_save = True
                old_refs = old_refs or link.refs[:]
                link.refs[1] = self.rewrite(Ref(link.refs[1]), commentary=commentary).normal()
            if needs_save:
                print "Links - converting {} to {}".format(old_refs, link.refs)
                link.save()


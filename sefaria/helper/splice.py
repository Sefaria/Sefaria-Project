from sefaria.model import *
from sefaria.system.exceptions import InputError


class Splicer(object):
    """
    Simple usage:
    splicer = Splicer()
    splicer.spliceThisIntoNext("Shabbat 7b:11")
    splicer.report()  # optional, to check what it will do
    splicer.execute()

    This is built from the perspective of merging the second ref into the first, but it's all equivalent.
    """
    def __init__(self):
        self.joiner = u" "
        self.first_ref = None
        self.second_ref = None
        self.section_ref = None
        self.book_ref = None
        self.first_segment_number = None
        self.second_segment_number = None
        self.comment_section_lengths = None
        self._base_links_to_rewrite = []
        self._commentary_links_to_rewrite = []
        self._report = False
        self._save = False
        self._executed = False

    def _setup_refs(self):
        # Derive other refs and variables from from self.first_ref and self.second_ref
        self.section_ref = self.first_ref.section_ref()
        assert self.section_ref == self.second_ref.section_ref(), "Not sure if this works across sections"
        self.book_ref = self.first_ref.context_ref(self.first_ref.index_node.depth)
        self.first_segment_number = self.first_ref.sections[-1]
        self.second_segment_number = self.second_ref.sections[-1]
        self.comment_section_lengths = self._get_comment_section_lengths(self.first_ref)

    @staticmethod
    def _get_comment_section_lengths(ref):
        ret = {}
        for vtitle in library.get_commentary_version_titles_on_book(ref.index.title):
            commentator_book_ref = Ref(vtitle)
            commentator_segment_ref = commentator_book_ref.subref(ref.sections)
            ret[vtitle] = len(commentator_segment_ref.get_state_ja().subarray_with_ref(commentator_segment_ref))
        return ret

    def spliceThisIntoNext(self, ref):
        assert ref.is_segment_level()
        assert not ref.is_range()
        self.first_ref = ref
        self.second_ref = ref.next_segment_ref()
        assert self.second_ref
        self._setup_refs()
        return self

    def splicePrevIntoThis(self, ref):
        assert ref.is_segment_level()
        assert not ref.is_range()
        self.second_ref = ref
        self.first_ref = ref.prev_segment_ref()
        assert self.first_ref
        self._setup_refs()
        return self

    # It's a little counter-intuitive, but these are equivalent to their liguistic converse.
    def spliceNextIntoThis(self, ref):
        return self.spliceThisIntoNext(ref)

    def spliceThisIntoPrev(self, ref):
        return self.splicePrevIntoThis(ref)

    def _run(self):
        self.mergeBaseTextVersionSegments()
        self.mergeCommentaryVersionSections()
        self.removeBaseTextVersionSegments(self.second_ref)
        self.removeCommentaryVersionsSections(self.second_ref)

        # Rewrite links to base text (including links from own commentary)
        # It takes longer, but we start at the base text, so as not to miss any ranged refs
        self.rewrite_linkset(LinkSet(self.book_ref))

        # Rewrite links to commentary (including to base text)
        for commentary_title in library.get_commentary_version_titles_on_book(self.first_ref.index.title):
            self.rewrite_linkset(LinkSet(commentary_title), commentary=True)

        # Source sheet refs
        # Note refs
        # Tranlation requests?
        # History?
        # alt structs?
        # ES - delete last segment that hangs off the edge of commentaries after a merge

    def report(self):
        if self._executed:
            print "Already executed"
            return
        self._report = True
        self._save = False
        self._run()
        self._report = False

    def execute(self):
        if self._executed:
            print "Already executed"
            return
        self._save = True
        self._run()
        self.rebuildVersionStates()
        self._executed = True

    def mergeBaseTextVersionSegments(self):
        # for each version, merge the text
        vs = VersionSet({"title": self.first_ref.index.title})
        for v in vs:
            assert isinstance(v, Version)
            first_tc = TextChunk(self.first_ref, lang=v.language, vtitle=v.versionTitle)
            second_tc = TextChunk(self.second_ref, lang=v.language, vtitle=v.versionTitle)
            if not (first_tc.is_empty() and second_tc.is_empty()):
                first_tc.text = first_tc.text + self.joiner + second_tc.text
                if self._report:
                    print u"{}: {} and {} merging to become {}".format(v.versionTitle, self.first_ref.normal(), self.second_ref.normal(), first_tc.text)
                if self._save:
                    first_tc.save()

    def mergeCommentaryVersionSections(self):
        # Merge comments for all commentary on this text
        if not self.first_ref.is_commentary():
            for v in library.get_commentary_versions_on_book(self.first_ref.index.title):
                assert isinstance(v, Version)
                commentator_book_ref = Ref(v.title)
                commentator_section_ref = commentator_book_ref.subref(self.section_ref.sections)
                commentator_segment_ref = commentator_book_ref.subref(self.first_ref.sections)
                tc = TextChunk(commentator_section_ref, lang=v.language, vtitle=v.versionTitle)
                if len(tc.text) < self.second_segment_number:
                    continue

                # Pad first section to uniform length, as derived from state, then add the next section on to the end
                comment_section_length = self.comment_section_lengths.get(v.title)
                assert len(tc.text[self.first_segment_number - 1]) <= comment_section_length
                tc.text[self.first_segment_number - 1] = tc.text[self.first_segment_number - 1] + [list() for _ in range(len(tc.text[self.first_segment_number - 1]), comment_section_length)] + tc.text[self.second_segment_number - 1]
                if self._report:
                    print u"{}({}) becoming\n{}".format(commentator_segment_ref.normal(), v.versionTitle, tc.text[self.first_segment_number - 1])
                if self._save:
                    tc.save()

    def removeBaseTextVersionSegments(self, local_ref):
        assert local_ref.is_segment_level()
        local_section_ref = local_ref.section_ref()
        local_segment_number = local_ref.sections[-1]

        # Remove segment from all versions that have it
        for v in local_section_ref.versionset():
            tc = TextChunk(local_section_ref, lang=v.language, vtitle=v.versionTitle)
            if len(tc.text) < local_segment_number:
                continue
            tc.text = tc.text[:local_segment_number - 1] + tc.text[local_segment_number:]
            if self._report:
                print u"Removing {}({})".format(local_ref.normal(), v.versionTitle)
            if self._save:
                tc.save()

    def removeCommentaryVersionsSections(self, local_ref):
        assert local_ref.is_segment_level()
        local_section_ref = local_ref.section_ref()
        local_segment_number = local_ref.sections[-1]

        # Remove segment from all commentary on this text
        if not local_ref.is_commentary():
            for v in library.get_commentary_versions_on_book(local_ref.index.title):
                assert isinstance(v, Version)
                commentator_section_ref = Ref(v.title).subref(local_section_ref.sections)
                commentator_segment_ref = Ref(v.title).subref(local_ref.sections)
                tc = TextChunk(commentator_section_ref, lang=v.language, vtitle=v.versionTitle)
                if len(tc.text) < local_segment_number:
                    continue
                tc.text = tc.text[:local_segment_number - 1] + tc.text[local_segment_number:]
                if self._report:
                    print u"Removing {}({})".format(commentator_segment_ref.normal(), v.versionTitle)
                if self._save:
                    tc.save()

    def needs_rewrite(self, old_ref):
        assert isinstance(old_ref, Ref)

        def simple_needs_rewrite(old_simple_ref):
            assert isinstance(old_simple_ref, Ref)
            if (len(old_simple_ref.sections) >= self.first_ref.index_node.depth
                and old_simple_ref.sections[self.first_ref.index_node.depth - 2] == self.section_ref.sections[-1]
                and old_simple_ref.sections[self.first_ref.index_node.depth - 1] > self.first_segment_number
               ):
                return True
            return False

        if old_ref.is_range():
            return simple_needs_rewrite(old_ref.starting_ref()) or simple_needs_rewrite(old_ref.ending_ref())
        return simple_needs_rewrite(old_ref)

    def rewrite(self, old_ref, commentary=False):
        assert isinstance(old_ref, Ref)

        def simple_rewrite(old_simple_ref):
            if commentary and old_simple_ref.is_segment_level() and old_simple_ref.sections[self.first_ref.index_node.depth - 1] == self.second_segment_number:
                # Position of comment has changed
                d = old_simple_ref._core_dict()
                d["sections"][-2] -= 1
                d["sections"][-1] += self.comment_section_lengths.get(old_simple_ref.index.title)
                d["toSections"] = d["sections"]
                return Ref(_obj=d)
            elif old_simple_ref.sections[self.first_ref.index_node.depth - 1] > self.first_segment_number:
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
            try:
                ref0 = Ref(link.refs[0])
                ref1 = Ref(link.refs[1])
            except InputError as e:
                print e
                continue
            if self.needs_rewrite(ref0):
                needs_save = True
                old_refs = old_refs or link.refs[:]
                link.refs[0] = self.rewrite(ref0, commentary=commentary).normal()
            if self.needs_rewrite(ref1):
                needs_save = True
                old_refs = old_refs or link.refs[:]
                link.refs[1] = self.rewrite(ref1, commentary=commentary).normal()
            if needs_save:
                if self._report:
                    print "Links - converting {} to {}".format(old_refs, link.refs)
                if self._save:
                    link.save()

    def rebuildVersionStates(self):
        # Refresh the version state of main text and commentary
        VersionState(self.first_ref.index).refresh()
        if not self.first_ref.is_commentary():
            for vt in library.get_commentary_version_titles_on_book(self.first_ref.index.title):
                VersionState(vt).refresh()

    def __eq__(self, other):
        return self.first_ref == other.first_ref and self.second_ref == other.second_ref

    def __ne__(self, other):
        return not self.__eq__(other)


def add_blank_segment_after(ref):
    assert ref.is_segment_level()
    assert not ref.is_range()


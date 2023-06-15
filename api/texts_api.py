import django
django.setup()
from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedArray

class APITextsHandler():

    def __init__(self, oref, versions_params):
        self.versions_params = versions_params
        self.oref = oref
        self.handled_version_params = []
        self.all_versions = self.oref.version_list()
        self.return_obj = {'versions': []}

    def append_required_versions(self, lang, vtitle=None):
        if lang == 'base':
            lang_condition = lambda v: v['isBaseText']
        elif lang == 'source':
            lang_condition = lambda v: v['isSource']
        else:
            lang_condition = lambda v: v['actualLanguage'] == lang
        if vtitle and vtitle != 'all':
            versions = [v for v in self.all_versions if lang_condition(v) and v['versionTitle'] == vtitle]
        else:
            versions = [v for v in self.all_versions if lang_condition(v)]
            if vtitle != 'all' and versions:
                versions = [max(versions, key=lambda v: v['priority'] or 0)]
        for version in versions:
            if version not in self.return_obj['versions']:
                self.return_obj['versions'].append(version)

    def handle_version_params(self, version_params):
        if version_params in self.handled_version_params:
            return
        if '|' not in version_params:
            lang, vtitle = version_params, ''
        else:
            lang, vtitle = version_params.split('|', 1)
            vtitle = vtitle.replace('_', ' ')
        self.append_required_versions(lang, vtitle)
        self.handled_version_params.append(version_params)

    def add_text_to_versions(self):
        for version in self.return_obj['versions']:
            version.pop('title')
            version['direction'] = 'ltr' if version['language'] == 'en' else 'he'
            version.pop('language')
            version['text'] = TextRange(self.oref, version.actualLanguage, version.versionTitle).text
            #TODO - current api returns text for sections. do we want it?

    def add_ref_data(self):
        oref = self.oref
        self.return_obj.update({
            'ref': oref.normal(),
            #TODO - why do we need all of those?
            'heRef': oref.he_normal(),
            'sections': oref.sections,
            'toSections': oref.toSections,
            'sectionRef': oref.section_ref().normal(),
            'heSectionRef': oref.section_ref().he_normal(),
            'firstAvailableSectionRef': oref.first_available_section_ref().normal(),
            'isSpanning': oref.is_spanning(),
            'spanningRefs': [r.normal() for r in oref.split_spanning_ref()],
           'next': oref.next_section_ref().normal(), #TODO - change names like 'next_section_ref'? the question is how much cilent code use this name
            'prev': oref.prev_section_ref().normal(),
            'title': oref.context_ref().normal(),
            'book': oref.book, #TODO - isnt it the same as title?
            'heTitle': oref.context_ref().he_normal(),
            'primary_category': oref.primary_category,
            'type': oref.primary_category, #same as primary category
        })

    def reduce_alts_to_ref(self): #TODO - copied from TextFamily. if we won't remove it, we should find some place for that
        oref = self.oref
        # Set up empty Array that mirrors text structure
        alts_ja = JaggedArray()
        for key, struct in oref.index.get_alt_structures().items():
            # Assuming these are in order, continue if it is before ours, break if we see one after
            for n in struct.get_leaf_nodes():
                wholeRef = Ref(n.wholeRef).default_child_ref().as_ranged_segment_ref()
                if wholeRef.ending_ref().precedes(oref):
                    continue
                if wholeRef.starting_ref().follows(oref):
                    break

                # It's in our territory
                wholeRefStart = wholeRef.starting_ref()
                if oref.contains(wholeRefStart) and not wholeRefStart.contains(oref):
                    indxs = [k - 1 for k in wholeRefStart.in_terms_of(oref)]
                    val = {"en": [], "he": []}
                    try:
                        val = alts_ja.get_element(indxs) or val
                    except IndexError:
                        pass
                    val["en"] += [n.primary_title("en")]
                    val["he"] += [n.primary_title("he")]
                    val["whole"] = True
                    alts_ja.set_element(indxs, val)

                if getattr(n, "refs", None):
                    for i, r in enumerate(n.refs):
                        # hack to skip Rishon, skip empty refs
                        if i == 0 or not r:
                            continue
                        subRef = Ref(r)
                        subRefStart = subRef.starting_ref()
                        if oref.contains(subRefStart) and not subRefStart.contains(oref):
                            indxs = [k - 1 for k in subRefStart.in_terms_of(oref)]
                            val = {"en": [], "he": []}
                            try:
                                val = alts_ja.get_element(indxs) or val
                            except IndexError:
                                pass
                            val["en"] += [n.sectionString([i + 1], "en", title=False)]
                            val["he"] += [n.sectionString([i + 1], "he", title=False)]
                            alts_ja.set_element(indxs, val)
                        elif subRefStart.follows(oref):
                            break

        return alts_ja.array()

    def add_index_data(self):
        index = self.oref.index
        self.return_obj.update({
            'indexTitle': index.title,
            #TODO - those are attrs of index. it seems client can take them from there
            'categories': index.categories,
            'heIndexTitle': index.get_title('he'),
            'isComplex': index.is_complex(),
            'isDependant': index.is_dependant_text(),
            'order': getattr(index, 'order', ''),
            # TODO - alts are reduced fron the index. I guess here we can't give the client to do the job but have to check
            #TODO - also this did them for sections while this code for now returns the text according to segment refs
            'alts': self.reduce_alts_to_ref(),
        })

    def add_node_data(self):
        inode = self.oref.index_node
        # TODO - all those are attrs of node, so they are available also in the index. can the client take them from there?
        if getattr(inode, "lengths", None):
            self.return_obj["lengths"] = getattr(inode, "lengths")
            if len(self.return_obj["lengths"]):
                self.return_obj["length"]  = self.return_obj["lengths"][0]
        elif getattr(inode, "length", None):
            self.return_obj["length"] = getattr(inode, "length")
        self.return_obj.update({
            'textDepth': getattr(inode, "depth", None),
            'sectionNames': getattr(inode, "sectionNames", None),
            'addressTypes': getattr(inode, "addressTypes", None),
            'heTitle': inode.full_title("he"), #TODO - is there use in this and the nexts?
            'titleVariants': inode.all_tree_titles("en"),
            'heTitleVariants': inode.all_tree_titles("he"),
            # TODO - offsets are reduced fron the node. I guess here we can't give the client to do the job but have to check
            # TODO - also this did them for sections while this code for now returns the text according to segment refs
            'index_offsets_by_depth': inode.trim_index_offsets_by_sections(self.oref.sections, self.oref.toSections),
        })

    def get_versions_for_query(self):
        for version_params in self.versions_params:
            self.handle_version_params(version_params)
        self.add_text_to_versions()
        self.add_ref_data()
        self.add_index_data()
        self.add_node_data()
        return self.return_obj

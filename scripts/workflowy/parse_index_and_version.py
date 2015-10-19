# -*- coding: utf-8 -*-

"""
takes 3 command line arguments
first argument :: filename.opml
-t :: stores all items nodes in opml as shared terms (not including root)
-v :: saves any text stored in opml as notes to a single version
"""

import argparse
import string
import regex as re
import pprint
try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET
from sefaria.model import *


class WorkflowyParser(object):

    title_lang_delim = ur"$"
    alt_title_delim = ur"|"
    comment_delim = ur'#'
    categories_delim = u"%"

    def __init__(self, schema_file, term_scheme=None, c_index=False, c_version=False):
        self._schema_outline_file = schema_file
        self._term_scheme = term_scheme
        self._c_index = c_index
        self._c_version = c_version
        tree = ET.parse(self._schema_outline_file)
        self.outline = tree.getroot().find("./body/outline")
        self.comment_strip_re = re.compile(ur"</b>|<b>|"+self.comment_delim+".*"+self.comment_delim, re.UNICODE)
        self.parsed_schema = None
        self.version_info = None

    def parse(self):
        #tree = tree.getroot()[1][0]
        # for element in tree.iter('outline'):
        #     print parse_titles(element)["enPrim"]
        categories = self.extract_categories_from_title()
        if self._c_version:
            self.version_info = {'info': self.extract_version_info(), 'text':[]}
        schema_root = self.build_index_schema(self.outline)
        self.parsed_schema = schema_root
        schema_root.validate()
        if self._c_index:
            print "Saving Index record"
            self.create_index_from_schema(categories)
        else:
            print pprint.pprint(schema_root.serialize())
        if self._c_version:
            print "Creating Version Record"
            self.create_version_from_outline_notes()


    # object tree of each with jagged array nodes at the lowest level (recursive)
    def build_index_schema(self, element):
        if self._term_scheme and isinstance(self._term_scheme, basestring):
            self.create_term_scheme()
        if len(element) == 0:  # length of child nodes
            n = JaggedArrayNode()
            n.sectionNames = ['Paragraph']
            n.addressTypes = ['Integer']
            n.depth = 1
        else:  # yes child nodes >> schema node
            n = SchemaNode()
            for child in element:
                n.append(self.build_index_schema(child))

        # either type of node:
        titles = self.parse_titles(element)  # an array of titles
        n.key = titles["enPrim"]
        n = self.add_titles_to_node(n, titles)

        if self._term_scheme and element != self.outline: #add the node to a term scheme
            self.create_shared_term_for_scheme(n.title_group)

        if self._c_version and element != self.outline: #get the text in the notes and store it with the proper Ref
            text = self.parse_text(element)
            if text:
                self.version_info['text'].append({'node': n, 'text': text})
        return n

    # en & he titles for each element > dict
    def parse_titles(self, element):
        title = element.get("text")
        # print title
        #title = re.sub(ur"</b>|<b>|#.*#|'", u"", title)
        title = self.comment_strip_re.sub(u"", title)
        title = title.split(self.title_lang_delim)
        titles = {}
        if len(title) == 2:
            he = title[1].split(self.alt_title_delim)
            titles["hePrim"] = he[0].strip()
            titles["heAltList"] = [t.strip() for t in he[1:]]
        en = title[0].split(self.alt_title_delim)
        titles["enPrim"] = en[0].strip()
        titles["enAltList"] = [t.strip() for t in en[1:]]
        # print node.attrib
        return titles

    # appends primary, alternate, hebrew, english titles to node.
    def add_titles_to_node(self, n, titles):
        term = Term()
        # check if the primary title is a "shared term"
        if term.load({"name": titles["enPrim"]}):
            n.add_shared_term(titles["enPrim"])

        else:  # manual add if not a shared term
            n.add_title(titles["enPrim"], 'en', primary=True)
            # print titles["enPrim"]
            if "hePrim" in titles:
                n.add_title(titles["hePrim"], 'he', primary=True)
                # print titles["hePrim"]
            if "enAltList" in titles:
                for title in titles["enAltList"]:
                    n.add_title(title, 'en')
            if "heAltList" in titles:
                for title in titles["heAltList"]:
                    n.add_title(title, 'he')
        return n

    def extract_categories_from_title(self):
        category_pattern = self.categories_delim+ur"(.*)"+self.categories_delim
        title = self.outline.get("text")
        category_str = re.search(category_pattern, title)
        if category_str:
            categories = [s.strip() for s in category_str.group(1).split(",")]
            self.outline.set('text', re.sub(category_pattern, "", title))
            return categories
        return None

    def extract_version_info(self):
        vinfo_str = self.outline.get("_note")
        if vinfo_str:
            vinfo_dict = {elem.split(":",1)[0].strip():elem.split(":",1)[1].strip() for elem in str.split(",")}
        else:
            vinfo_dict = {'language': 'he',
                          'versionSource': '',
                          'versionTitle': 'pending'
                          }
        return vinfo_dict

    def create_index_from_schema(self, categories=None):
        if not categories:
            categories = ["Other"]
        Index({
            "title": self.parsed_schema.primary_title(),
            "categories": categories,
            "schema": self.parsed_schema.serialize()
        }).save()

    def create_term_scheme(self):
        if not TermScheme().load({"name": self._term_scheme}):
            print "Creating Term Scheme object"
            ts = TermScheme()
            ts.name = self._term_scheme
            ts.save()
            self._term_scheme = ts

    def create_shared_term_for_scheme(self, title_group):
        #TODO: This might be a silly method, since for most cases we do not want to blindly create terms from ALL thre nodes of a schema
        if not Term().load({"name": title_group.primary_title()}):
            print "Creating Shared Term for Scheme from outline"
            term = Term()
            term.name = title_group.primary_title()
            term.scheme = self._term_scheme.name
            term.title_group = title_group
            term.save()

    # divides text into paragraphs and sentences > list
    def parse_text(self, element):
        if "_note" in element.attrib:
            n = (element.attrib["_note"])
            n = re.sub(r'[/]', '<br>', n)
            n = re.sub(r'[(]', '<em><small>', n)
            n = re.sub(r'[)]', '</small></em>', n)
            text = n.strip().splitlines()
            return text
        return None


    # builds and posts text to api
    def create_version_from_outline_notes(self):
        from sefaria.tracker import modify_text
        for text_ref in self.version_info['text']:
            node = text_ref['node']
            ref = Ref(node.full_title(force_update=True))
            text = text_ref['text']
            user = 8646
            vtitle =  self.version_info['info']['versionTitle']
            lang = self.version_info['info']['language']
            vsource = self.version_info['info']['versionSource']
            modify_text(user,ref,vtitle, lang, text, vsource)


    """def create_version_from_outline_notes(self):
        j = {"versionTitle": "Siddur A", "versionSource": "daat", "language": "he"}
        parents = {c:p for p in tree.iter() for c in p}
        for e in tree.iter():
            if len(e) == 0 and "_note" in e.attrib.keys():
                j["text"] = parse_text(e)
                layers = []
                while e in parents.keys():
                    layers.append(parse_titles(e)["enPrim"])
                    e = parents[e]
                layers = list(reversed(layers))
                ref = "Siddur A, " + string.join(layers, ", ")
                print ref
                #post_api(ref, j, "text")"""


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("outline_file", help="The file containing the workflowy outline of the text")
    parser.add_argument("-t", "--term_scheme", help="Provide name of term scheme to save the titles as")
    parser.add_argument("-i", "--create_index", action="store_true", help="optional argument to create an Index object with the provided schema")
    parser.add_argument("-v", "--create_version", action="store_true", help="Optional argument to create a version from the notes on the outline. Requires an existing Index or one to be created")
    args = parser.parse_args()
    print args
    wfparser = WorkflowyParser(args.outline_file, args.term_scheme, args.create_index, args.create_version)
    wfparser.parse()


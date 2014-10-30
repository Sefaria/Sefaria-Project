# -*- coding: utf-8 -*-

import re2

from sefaria.model import *
from sefaria.utils.hebrew import is_hebrew


class Library(object):

    def get_refs_in_string(self, st):
        refs = []
        lang = 'he' if is_hebrew(st) else 'en'
        for match in self.all_titles_regex(lang).finditer(st):
            title_re = self.regex_for_title(match.group(), lang)
            ref_match = title_re.match(st[match.start():])
            if ref_match:
                refs.append(ref_match.group())
        return refs

    def all_titles_regex(self, lang):
        escaped = map(re2.escape, self.full_title_list(lang))
        combined = '|'.join(sorted(escaped, key=len, reverse=True)) #Match longer titles first
        return re2.compile(combined)

    def full_title_list(self, lang):
        """ Returns a list of strings of all possible titles, including maps """
        titles = self.get_title_node_dict().keys()
        titles.append(self.get_map_dict().keys())
        return titles

    def get_map_dict(self):
        """ Returns a dictionary of maps - {from: to} """
        maps = {}
        for i in IndexSet():
            for m in i.get_maps():  # both simple maps & those derived from term schemes
                maps[m["from"]] = m["to"]
        return maps

    def get_index_forest(self, titleBased = False):
        """
        Returns a list of nodes.
        :param titleBased: If true, texts with presentation 'alone' are passed as root level nodes
        """
        #todo: handle 'alone' nodes
        return IndexSet()

    def get_title_node_dict(self, lang):
        """
        Returns a dictionary of string titles and the nodes that they point to.
        This does not include any map names.
        """
        title_map = {}
        trees = self.get_index_forest(titleBased=True)
        for tree in trees:
            title_map.update(self._branch_title_node_map(tree, lang))
        return title_map

    def _branch_title_node_map(self, node, lang, baselist=[]):
        """
        Recursive function that generates a map from title to node
        :param node: the node to start from
        :param lang:
        :param baselist: list of starting strings that lead to this node
        :return: map from title to node
        """
        title_map = {}
        thisnode = node

        #this happens on the node
        #if node.hasTitleScheme():
        #        this_node_titles = node.getSchemeTitles(lang)
        #else:

        this_node_titles = [title["text"] for title in node.titles if title["lang"] == lang and title["presentation"] != "alone"]
        node_title_list = [baseName + " " + title for baseName in baselist for title in this_node_titles]

        if node.hasChildren():
            for child in node.children:
                if child.is_default():
                    thisnode = child
                if not child.is_only_alone():
                    title_map.update(self._branch_title_node_map(child, lang, node_title_list))

        for title in node_title_list:
            title_map[title] = thisnode

        return title_map

    def regex_for_title(self, title, lang):
        '''
        Return a beginning-anchored regular expression for a full citation match of this title
        '''
        node = self.get_title_node_dict()[title]
        re_string = '^' + title + node.delimiter_re + node.regex()
        return re2.compile(re_string)
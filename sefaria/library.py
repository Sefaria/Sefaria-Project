# -*- coding: utf-8 -*-

import re2
import regex

from sefaria.model import *
from sefaria.utils.hebrew import is_hebrew


class Library(object):

    def get_refs_in_string(self, st):
        refs = []
        lang = 'he' if is_hebrew(st) else 'en'
        bracket = True if lang == "he" else False
        if bracket:
            unique_titles = {title: 1 for title in self.all_titles_regex(lang).findall(st)}
            for title in unique_titles.iterkeys():
                title_re = self.regex_for_title(title, lang, bracket=bracket)
                for ref_match in title_re.finditer(st):
                    refs.append(ref_match.group())
        else:
            for match in self.all_titles_regex(lang).finditer(st):
                title_re = self.regex_for_title(match.group(), lang)
                ref_match = title_re.match(st[match.start():])
                if ref_match:
                    refs.append(ref_match.group())
        return refs

    def all_titles_regex(self, lang):
        escaped = map(regex.escape, self.full_title_list(lang))  # Re2's escape() bugs out on this
        combined = '|'.join(sorted(escaped, key=len, reverse=True))  # Match longer titles first
        return re2.compile(combined)

    def full_title_list(self, lang):
        """ Returns a list of strings of all possible titles, including maps """
        titles = self.get_title_node_dict(lang).keys()
        titles.append(self.get_map_dict().keys())
        return titles

    #todo: how do we handle language here?
    def get_map_dict(self):
        """ Returns a dictionary of maps - {from: to} """
        maps = {}
        for i in IndexSet():
            if i.is_commentary():
                continue
            for m in i.get_maps():  # both simple maps & those derived from term schemes
                maps[m["from"]] = m["to"]
        return maps

    def get_index_forest(self, titleBased = False):
        """
        Returns a list of nodes.
        :param titleBased: If true, texts with presentation 'alone' are passed as root level nodes
        """
        root_nodes = []
        for i in IndexSet():
            if i.is_commentary():
                continue
            root_nodes.append(i.nodes)

        if titleBased:
            #todo: handle 'alone' nodes
            pass

        return root_nodes

    def get_title_node_dict(self, lang):
        """
        Returns a dictionary of string titles and the nodes that they point to.
        This does not include any map names.
        """
        title_dict = {}
        trees = self.get_index_forest(titleBased=True)
        for tree in trees:
            title_dict.update(self._branch_title_node_dict(tree, lang))
        return title_dict

    def _branch_title_node_dict(self, node, lang, baselist=[]):
        """
        Recursive function that generates a map from title to node
        :param node: the node to start from
        :param lang:
        :param baselist: list of starting strings that lead to this node
        :return: map from title to node
        """
        title_dict = {}
        thisnode = node

        #this happens on the node
        #if node.hasTitleScheme():
        #        this_node_titles = node.getSchemeTitles(lang)
        #else:

        this_node_titles = [title["text"] for title in node.titles if title["lang"] == lang and title.get("presentation") != "alone"]
        if baselist:
            node_title_list = [baseName + " " + title for baseName in baselist for title in this_node_titles]
        else:
            node_title_list = this_node_titles

        if node.has_children():
            for child in node.children:
                if child.is_default():
                    thisnode = child
                if not child.is_only_alone():
                    title_dict.update(self._branch_title_node_dict(child, lang, node_title_list))

        for title in node_title_list:
            title_dict[title] = thisnode

        return title_dict

    def get_title_node(self, title, lang=None):
        if not lang:
            lang = "he" if is_hebrew(title) else "en"
        return self.get_title_node_dict(lang)[title]

    def regex_for_title(self, title, lang, bracket=False):
        '''
        Return a beginning-anchored regular expression for a full citation match of this title
        '''

        node = self.get_title_node(title, lang)
        if bracket:
            #look behind for opening brace ({, and ahead for closing brace })
            re_string = ur"""(?<=							# look behind for opening brace
				[({]										# literal '(', brace,
				[^})]*										# anything but a closing ) or brace
			)
            """ + title + node.delimiter_re + node.regex(lang) + ur"""
            (?=												# look ahead for closing brace
				[^({]*										# match of anything but an opening '(' or brace
				[)}]										# zero-width: literal ')' or brace
			)"""
        else:
            re_string = '^' + title + node.delimiter_re + node.regex(lang)
        return regex.compile(re_string, regex.VERBOSE)  # Uses regex instead of re2 for the more intricate regexes at this stage.

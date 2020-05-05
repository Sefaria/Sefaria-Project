# -*- coding: utf-8 -*-

import argparse
import re
from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray
from sefaria.system.exceptions import BookNameError


all_versions = VersionSet()
#all_library_nodes = library.get_content_nodes(with_commentary=True)
for version in all_versions:
    print("{}: {}".format(version.title.encode('utf-8'), version.versionTitle.encode('utf-8')))
    version_altered = False
    try:
        idx = version.get_index()
        content_nodes = idx.nodes.get_leaf_nodes()
        for node in content_nodes:
            print(node)
            ja_text = JaggedTextArray(version.content_node(node))
            normalized = ja_text.normalize(terminal_depth=node.depth)
            if normalized: #only set things that were changed.
                version.sub_content(key_list=node.version_address(), value=ja_text.array())
                version_altered = True
        if version_altered: #only go through save if something actually changed
            version.save()
    except BookNameError as e:
        print("no index for {}".format(version.title.encode('utf-8')))



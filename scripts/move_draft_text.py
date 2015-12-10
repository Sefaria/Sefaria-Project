# -*- coding: utf-8 -*-

import argparse
import json
import urllib
import urllib2

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray

try:
    from sefaria.local_settings import SEFARIA_BOT_API_KEY
except ImportError:
    SEFARIA_BOT_API_KEY = None

class ServerTextCopier(object):

    def __init__(self, dest_server, apikey, title, post_index=True, versions=None):
        self._dest_server = dest_server
        self._apikey = apikey
        self._title_to_retrieve = title
        self._versions_to_retrieve = versions
        self._post_index = post_index

    def load_objects(self):
        self._index_obj = get_index(self._title_to_retrieve)
        if not self._index_obj:
            raise AttributeError("No record found for {}".format(self._title_to_retrieve))
        self._version_objs = []
        if self._versions_to_retrieve:
            if self._versions_to_retrieve == 'all':
                self._version_objs = VersionSet({'title': self._title_to_retrieve}).array()
            else:
                for version in self._versions_to_retrieve:
                    version['title'] = self._title_to_retrieve
                    vs = Version().load(version)
                    if not vs:
                        print "Warning: No version object found for  lang: {} version title: {}. Skipping.".format(version['language'], version['versionTitle'])
                    else:
                        self._version_objs.append(vs)

    def do_copy(self):
        self.load_objects()
        if self._post_index:
            if isinstance(self._index_obj, CommentaryIndex):
                idx_contents = self._index_obj.c_index.contents(raw=True)
                idx_title = self._index_obj.c_index.title
            elif isinstance(self._index_obj, Index):
                idx_contents = self._index_obj.contents(raw=True)
                idx_title = self._index_obj.title
            self._make_post_request_to_server(self._prepare_index_api_call(idx_title), idx_contents)
        content_nodes = self._index_obj.nodes.get_leaf_nodes()
        for ver in self._version_objs:
            print ver.versionTitle.encode('utf-8')
            flags = {}
            for flag in ver.optional_attrs:
                if hasattr(ver, flag):
                    flags[flag] = getattr(ver, flag, None)
            for node in content_nodes:
                #print node.full_title(force_update=True)
                text = JaggedTextArray(ver.content_node(node)).array()
                version_payload = {
                    "versionTitle": ver.versionTitle,
                    "versionSource": ver.versionSource,
                    "language": ver.language,
                    "text": text
                }
                self._make_post_request_to_server(self._prepare_text_api_call(node.full_title(force_update=True)), version_payload)
            if flags:
                self._make_post_request_to_server(self._prepare_version_attrs_api_call(ver.title, ver.language, ver.versionTitle), flags)

    def _prepare_index_api_call(self, index_title):
        return 'api/v2/raw/index/{}'.format(index_title.replace(" ", "_"))

    def _prepare_text_api_call(self, terminal_ref):
        return 'api/texts/{}?count_after=0&index_after=0'.format(terminal_ref.replace(" ", "_"))

    def _prepare_version_attrs_api_call(self, title, lang, vtitle):
        return "api/version/flags/{}/{}/{}".format(urllib.quote(title), urllib.quote(lang), urllib.quote(vtitle))

    def _make_post_request_to_server(self, url, payload):
        full_url = "{}/{}".format(self._dest_server, url)
        payload = json.dumps(payload)
        values = {'json': payload, 'apikey': self._apikey}
        data = urllib.urlencode(values)
        req = urllib2.Request(full_url, data)
        try:
            response = urllib2.urlopen(req)
            print response.read()
        except urllib2.HTTPError, e:
            print 'Error code: ', e.code
            print e.read()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("title", help="title argument")
    parser.add_argument("--noindex", action="store_false", help="Specify this flag when you do not wish to create a new Index record at the destination")
    parser.add_argument("-v", "--versionlist", help="comma separated version list: lang:versionTitle. To copy all versions, simply input 'all'")
    parser.add_argument("-k", "--apikey", help="non default api key", default=SEFARIA_BOT_API_KEY)
    parser.add_argument("-d", "--destination_server", help="override destination server", default='http://eph.sefaria.org')

    args = parser.parse_args()
    print args
    if not args.apikey:
        raise argparse.ArgumentTypeError( 'The API key must be supplied or be present by default on the server' )
    if args.versionlist:
        if args.versionlist != 'all':
            version_arr = []
            for versionstr in args.versionlist.split(","):
                lang_vtitle = versionstr.split(":")
                version_arr.append({'language': lang_vtitle[0], "versionTitle": lang_vtitle[1]})
            args.versionlist = version_arr
    copier = ServerTextCopier(args.destination_server, args.apikey, args.title, args.noindex, args.versionlist)
    copier.do_copy()
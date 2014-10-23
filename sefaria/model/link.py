"""
link.py
Writes to MongoDB Collection: links
"""

import regex as re
from bson.objectid import ObjectId

from sefaria.system.exceptions import DuplicateRecordError
from . import abstract as abst
from . import text


class Link(abst.AbstractMongoRecord):
    """
    A link between two texts (or more specifically, two references)
    """
    collection = 'links'
    history_noun = 'link'

    required_attrs = [
        "type",
        "refs"
    ]
    optional_attrs = [
        "anchorText",
        "auto",
        "generated_by",
        "source_text_oid"
    ]

    def _normalize(self):
        self.auto = getattr(self, 'auto', False)
        self.generated_by = getattr(self, "generated_by", None)
        self.source_text_oid = getattr(self, "source_text_oid", None)
        self.refs = [text.Ref(self.refs[0]).normal(), text.Ref(self.refs[1]).normal()]

        if getattr(self, "_id", None):
            self._id = ObjectId(self._id)

    def _validate(self):
        assert super(Link, self)._validate()

        if False in self.refs:
            return False

        return True

    def _pre_save(self):
        if getattr(self, "_id", None) is None:
            # Don't bother saving a connection that already exists, or that has a more precise link already
            samelink = Link().load({"refs": self.refs})

            if samelink and not self.auto and self.type and not samelink.type:
                samelink.type = self.type
                samelink.save()
                raise DuplicateRecordError(u"Updated existing link with new type: {}".format(self.type))

            elif samelink:
                #logger.debug("save_link: Same link exists: " + samelink["refs"][1])
                raise DuplicateRecordError("This connection already exists. Try editing instead.")

            else:
                preciselink = Link().load(
                    {'$and':
                        [
                            {'refs': self.refs[0]},
                            {'refs':
                                {'$regex': text.Ref(self.refs[1]).regex()}
                            }
                        ]
                    }
                )

                if preciselink:
                    # logger.debug("save_link: More specific link exists: " + link["refs"][1] + " and " + preciselink["refs"][1])
                    raise DuplicateRecordError(u"A more precise link already exists: {}".format(preciselink.refs[1]))
                # else: # this is a good new link


class LinkSet(abst.AbstractMongoSet):
    recordClass = Link

    def __init__(self, query_or_ref={}, page=0, limit=0):
        '''
        LinkSet can be initialized with a query dictionary, as any other MongoSet.
        It can also be initialized with a :py:class: `sefaria.text.Ref` object, and will use the :py:meth: `sefaria.text.Ref.regex()` method to return the set of Links that refer to that Ref or below.
        :param query_or_ref: A query dict, or a :py:class: `sefaria.text.Ref` object
        '''
        try:
            super(LinkSet, self).__init__({"refs": {"$regex": query_or_ref.regex()}}, page, limit)
        except AttributeError:
            super(LinkSet, self).__init__(query_or_ref, page, limit)


def process_index_title_change_in_links(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(kwargs["old"]))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = r"(^{} \d)|(^({}) on {} \d)".format(re.escape(kwargs["old"]), "|".join(commentators), re.escape(kwargs["old"]))
        #pattern = r'(^{} \d)|( on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [r.replace(kwargs["old"], kwargs["new"], 1) if re.search(pattern, r) else r for r in l.refs]
        l.save()


def process_index_delete_in_links(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(indx.title))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = r"(^{} \d)|^({}) on {} \d".format(re.escape(indx.title), "|".join(commentators), re.escape(indx.title))
    LinkSet({"refs": {"$regex": pattern}}).delete()
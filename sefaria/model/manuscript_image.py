# encoding=utf-8

from collections import OrderedDict
from sefaria.system.exceptions import DuplicateRecordError, InputError
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model import *


class ManuscriptImage(AbstractMongoRecord):
    """
    Data for manuscript images. The images themselves are hosted remotely. This class stores the content of images
    as well as how to retrieve the remote images.
    """

    collection = "manuscript_image"
    required_attrs = [
        "image_url",
        "expanded_refs",
        "thumbnail_url",
        "image_id",
        "manuscript_title",
        "page_num"
    ]
    optional_attrs = [
        "he_manuscript_title",
        "en_desc"  # manuscript description - English
        "he_desc"  # manuscript description - Hebrew
    ]
    pkeys = ["manuscript_title", "page_num"]

    def add_segment_ref(self, tref):
        self.expanded_refs.append(tref)

    def add_normalized_refs(self, oref):
        """
        Splits refs into segments and normalizes them before adding. Does not save.
        :param Ref oref: caller is responsible for creating the Ref object, as well as handling any Ref parsing errors
        that arise
        :return:
        """
        for seg_ref in oref.all_segment_refs():
            self.add_segment_ref(seg_ref.normal())

    def remove_segment_ref(self, tref):
        try:
            self.expanded_refs.remove(tref)
        except ValueError:
            raise ValueError(u"Ref {} does not appear on this image".format(tref))

    def _normalize(self):
        self.image_id = self.manuscript_title + str(self.page_num)
        self.expanded_refs = OrderedDict.fromkeys(self.expanded_refs).keys()  # remove duplicates

    def _validate(self):
        # raise error on duplicates. _normalize should prevent this from happening
        expanded_refs = set()
        for seg_ref in expanded_refs:
            if seg_ref in expanded_refs:
                raise InputError
            else:
                expanded_refs.add(seg_ref)

        return super(ManuscriptImage, self)._validate()

    def _pre_save(self):
        """
        check for duplicate when saving a new record
        """
        duplicate = ManuscriptImage().load({'manuscript_title': self.manuscript_title, "page_num": self.page_num})
        if duplicate:
            if not self.same_record(duplicate):
                raise DuplicateRecordError(u"Image already exists")


class ManuscriptImageSet(AbstractMongoSet):
    recordClass = ManuscriptImage

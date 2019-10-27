# encoding=utf-8

import re
from sefaria.system.exceptions import DuplicateRecordError
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet


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

    def _normalize(self):
        self.image_id = self.manuscript_title + str(self.page_num)

    def _pre_save(self):
        """
        check for duplicate when saving a new record
        """
        duplicate = ManuscriptImage().load({'manuscript_title': self.manuscript_title, "page_num": self.page_num})
        if duplicate:
            if not self.same_record(duplicate):
                raise DuplicateRecordError(u"Image already exists")


class ManuscriptImageSet(AbstractMongoSet):
    pass

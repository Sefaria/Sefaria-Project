# encoding=utf-8

from sefaria.system.exceptions import InputError
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model import *


class ManuscriptError(Exception):
    pass


class Manuscript(AbstractMongoRecord):

    collection = 'manuscript'
    required_attrs = [
        'id',  # unique
        'title',
        'he_title',
        'source',
        'description',
        'he_description'
    ]


class ManuscriptSet(AbstractMongoSet):
    pass


class ManuscriptPage(AbstractMongoRecord):

    collection = 'manuscript_page'
    required_attrs = [
        'manuscript_id',
        'page_id',  # manuscript_id & page_id must be unique
        'image_url',
        'thumbnail_url',
        'contained_refs'  # list of section level (possibly ranged) refs
        'expanded_refs'  # list of segment level refs
    ]

    def __init__(self, attrs=None):
        self.contained_refs = []  # this field is referenced in nearly every method, we want to ensure it is defined
        super(ManuscriptPage, self).__init__(attrs)

    def _pre_save(self):
        self.expanded_refs = list(set(self.expanded_refs))  # clear out duplicates

    def _validate(self):
        super(ManuscriptPage, self)._validate()
        for tref in self.contained_refs:
            if not Ref.is_ref(tref):
                raise ManuscriptError(f'{tref} is not a valid Ref')

        test_refs = self.get_ref_objects()
        while True:
            current_ref = test_refs.pop()
            for tr in test_refs:
                if current_ref.overlaps(tr):
                    raise ManuscriptError(f'Overlap between contained refs {tr} and {current_ref}')

            if not len(test_refs):
                break

    def validate(self, verbose=False) -> bool:
        """
        helper method, useful for seeing if the underlying data is valid without raising any errors
        :param verbose:
        :return: bool
        """
        try:
            self._validate()
        except ManuscriptError as e:
            if verbose:
                print(f'Validation failed with the following error: {e}')
            return False
        return True

    def get_ref_objects(self):
        try:
            return [Ref(tref) for tref in self.contained_refs]
        except InputError:
            raise ManuscriptError('bad ref associated with this Manuscript Page')

    @staticmethod
    def get_expanded_refs_for_source(oref: Ref):
        return [r.normal() for r in oref.all_segment_refs()]

    def set_expanded_refs(self):
        expanded_refs = []
        for oref in self.get_ref_objects():
            expanded_refs.extend(self.get_expanded_refs_for_source(oref))
        self.expanded_refs = expanded_refs

    def add_ref(self, tref):
        try:
            new_oref = Ref(tref)
        except InputError as e:
            raise ManuscriptError(e)
        for oref in self.get_ref_objects():
            if oref.overlaps(new_oref):
                raise ManuscriptError(f'Overlap between contained refs {oref} and {new_oref}')
        self.contained_refs.append(tref)
        self.expanded_refs.extend(self.get_expanded_refs_for_source(new_oref))


class ManuscriptPageSet(AbstractMongoSet):
    pass

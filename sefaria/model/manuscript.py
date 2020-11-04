# encoding=utf-8

from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.system.database import db
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model import *


class ManuscriptError(Exception):
    pass


class Manuscript(AbstractMongoRecord):
    pkeys = ['slug']
    track_pkeys = True

    collection = 'manuscripts'
    required_attrs = [
        'slug',  # unique, derived from title.
        'title',
        'he_title',
        'source',
        'description',
        'he_description'
    ]

    def normalize_slug_field(self, slug_field: str) -> str:
        """
        Duplicates are forbidden for Manuscript slugs. Character normalization only, duplicates raise
        a DuplicateRecordError
        :param slug_field: not an attribute, this should just be a string that will be normalized.
        :return: normalized string
        """
        slug = self.normalize_slug(slug_field)
        mongo_id = getattr(self, '_id', None)
        duplicate = getattr(db, self.collection).find_one({'slug': slug, "_id": {"$ne": mongo_id}})
        if duplicate:
            raise DuplicateRecordError(f"Record with the title {slug_field} already exists")

        return slug

    def _normalize(self):
        title = getattr(self, 'title', None)
        if not title:
            raise InputError('title not set')
        self.slug = self.normalize_slug_field(title)


class ManuscriptSet(AbstractMongoSet):
    recordClass = Manuscript


class ManuscriptPage(AbstractMongoRecord):

    collection = 'manuscript_pages'
    required_attrs = [
        'manuscript_slug',
        'page_id',  # manuscript_id & page_id must be unique
        'image_url',
        'thumbnail_url',
        'contained_refs',  # list of section level (possibly ranged) refs
        'expanded_refs',   # list of segment level refs
    ]

    def __init__(self, attrs=None):
        self.contained_refs = []  # an empty list is a valid value
        self.expanded_refs = []
        super(ManuscriptPage, self).__init__(attrs)

    def _pre_save(self):
        self.expanded_refs = list(set(self.expanded_refs))  # clear out duplicates

        # make sure we're not adding duplicates
        manuscript_id, page_id = getattr(self, 'manuscript_slug', None), getattr(self, 'page_id', None)
        if manuscript_id is None or page_id is None:  # important to check for None explicitly, page_id=0 is valid
            raise ManuscriptError('No manuscript_id or page_id')
        if self.is_new():
            duplicate = ManuscriptPage().load({
                'manuscript_id': manuscript_id,
                'page_id': page_id
            })
            if duplicate:
                raise DuplicateRecordError("Record already exists. Please update existing instead of adding new.")

    def _validate(self):
        super(ManuscriptPage, self)._validate()

        # check that the manuscript this page is part of exists in the database
        if self.get_manuscript() is None:
            raise ManuscriptError("Manuscript missing in database")

        for tref in self.contained_refs:
            if not Ref.is_ref(tref):
                raise ManuscriptError(f'{tref} is not a valid Ref')

        test_refs = self.get_ref_objects()
        while test_refs:
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

    def remove_ref(self, tref):
        try:
            tref_index = self.contained_refs.index(tref)
        except ValueError:
            raise ValueError(f'Cannot remove {tref}: it is not contained on this image')

        self.contained_refs.pop(tref_index)
        self.set_expanded_refs()

    def get_manuscript(self):
        return Manuscript().load({'slug': self.manuscript_slug})

    @staticmethod
    def get_slug_for_title(title):
        return Manuscript.normalize_slug(title)


class ManuscriptPageSet(AbstractMongoSet):
    recordClass = ManuscriptPage

    @classmethod
    def load_by_ref(cls, oref):
        ref_clauses = [{'expanded_refs': {'$regex': r}} for r in oref.regex(as_list=True)]
        return cls({'$or': ref_clauses})


def process_slug_change_in_manuscript(man, **kwargs):
    ManuscriptPageSet({"manuscript_slug": kwargs["old"]}).update({"manuscript_slug": kwargs["new"]})


def process_manucript_deletion(man, **kwargs):
    ManuscriptPageSet({"manuscript_slug": man.slug}).delete()

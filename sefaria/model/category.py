# -*- coding: utf-8 -*-

from . import abstract as abstract
from . import schema as schema


class Category(schema.AbstractTitledRecord):
    collection = 'category'

    required_attrs = ["titles", "path"]
    optional_attrs = ["enDesc", "heDesc"]


class CategorySet(abstract.AbstractMongoSet):
    recordClass = Category

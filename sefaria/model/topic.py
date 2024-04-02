from typing import Union, Optional
from . import abstract as abst
from .schema import AbstractTitledObject, TitleGroup
from .text import Ref, IndexSet, AbstractTextRecord
from .category import Category
from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.model.timeperiod import TimePeriod, LifePeriod
from sefaria.system.validators import validate_url
from sefaria.model.portal import Portal
from sefaria.system.database import db
import structlog, bleach
from sefaria.model.place import Place
import regex as re
from typing import Type
logger = structlog.get_logger(__name__)


class Topic(abst.SluggedAbstractMongoRecord, AbstractTitledObject):
    collection = 'topics'
    history_noun = 'topic'
    slug_fields = ['slug']
    title_group = None
    subclass_map = {
        'person': 'PersonTopic',
        'author': 'AuthorTopic',
    }
    pkeys = ["description"]
    track_pkeys = True
    reverse_subclass_map = {v: k for k, v in subclass_map.items()}
    required_attrs = [
        'slug',
        'titles',
    ]
    optional_attrs = [
        'subclass',  # str which indicates which subclass of `Topic` this instance is
        'alt_ids',
        'properties',
        'description',  # dictionary, keys are 2-letter language codes
        'categoryDescription',  # dictionary, keys are 2-letter language codes
        'isTopLevelDisplay',
        'displayOrder',
        'numSources',
        'shouldDisplay',
        'parasha',  # name of parsha as it appears in `parshiot` collection
        'ref',  # dictionary for topics with refs associated with them (e.g. parashah) containing strings `en`, `he`, and `url`.
        'good_to_promote',
        'description_published',  # bool to keep track of which descriptions we've vetted
        'isAmbiguous',  # True if topic primary title can refer to multiple other topics
        "data_source",  #any topic edited manually should display automatically in the TOC and this flag ensures this
        'image',
        "portal_slug",  # slug to relevant Portal object
    ]

    attr_schemas = {
        "image": {
                "image_uri": {
                    "type": "string",
                    "required": True,
                    "regex": "^https://storage\.googleapis\.com/pecha\-topic\-pictures/topics/.*?"
                },
                "image_caption": {
                    "type": "dict",
                    "required": True,
                    "schema": {
                        "en": {
                            "type": "string",
                            "required": True
                        },
                        "he": {
                            "type": "string",
                            "required": True
                        }
                    }
                }
            }
        }

    ROOT = "Main Menu"  # the root of topic TOC is not a topic, so this is a fake slug.  we know it's fake because it's not in normal form
                        # this constant is helpful in the topic editor tool functions in this file

    def load(self, query, proj=None):
        if self.__class__ != Topic:
            subclass_names = [self.__class__.__name__] + [klass.__name__ for klass in self.all_subclasses()]
            query['subclass'] = {"$in": [self.reverse_subclass_map[name] for name in subclass_names]}
        topic = super().load(query, proj)
        if getattr(topic, 'subclass', False):
            Subclass = globals()[self.subclass_map[topic.subclass]]
            topic = Subclass(topic._saveable_attrs())
        return topic

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))
        if self.__class__ != Topic and not getattr(self, "subclass", False):
            # in a subclass. set appropriate "subclass" attribute
            setattr(self, "subclass", self.reverse_subclass_map[self.__class__.__name__])

    def _validate(self):
        super(Topic, self)._validate()
        if getattr(self, 'subclass', False):
            assert self.subclass in self.subclass_map, f"Field `subclass` set to {self.subclass} which is not one of the valid subclass keys in `Topic.subclass_map`. Valid keys are {', '.join(self.subclass_map.keys())}"
        if getattr(self, 'portal_slug', None):
            Portal.validate_slug_exists(self.portal_slug)
        if getattr(self, "image", False):
            img_url = self.image.get("image_uri")
            if img_url: validate_url(img_url)

    def _normalize(self):
        super()._normalize()
        for title in self.title_group.titles:
            title['text'] = title['text'].strip()
        self.titles = self.title_group.titles
        slug_field = self.slug_fields[0]
        slug = getattr(self, slug_field)
        displays_under_link = IntraTopicLink().load({"fromTopic": slug, "linkType": "displays-under"})
        if getattr(displays_under_link, "toTopic", "") == "authors":
            self.subclass = "author"

    def _sanitize(self):
        super()._sanitize()
        for attr in ['description', 'categoryDescription']:
            p = getattr(self, attr, {})
            for k, v in p.items():
                p[k] = bleach.clean(v, tags=[], strip=True)
            setattr(self, attr, p)

    def set_titles(self, titles):
        self.title_group = TitleGroup(titles)

    def add_title(self, text, lang, primary=False, replace_primary=False):
        super(Topic, self).add_title(text, lang, primary=primary, replace_primary=replace_primary)
        if lang == 'en' and primary:
            self.set_slug_to_primary_title()

    def title_is_transliteration(self, title, lang):
        return self.title_group.get_title_attr(title, lang, 'transliteration') is not None

    def get_types(self, types=None, curr_path=None, search_slug_set=None):
        """
        WARNING: Expensive, lots of database calls
        Gets all `is-a` ancestors of self. Returns early if `search_slug_set` is passed and it reaches any element in `search_slug_set`
        :param types: set(str), current known types, for recursive calls
        :param curr_path: current path of this recursive call
        :param search_slug_set: if passed, will return early once/if any element of `search_slug_set` is found
        :return: set(str)
        """
        types = types or {self.slug}
        curr_path = curr_path or [self.slug]
        isa_set = {l.toTopic for l in IntraTopicLinkSet({"fromTopic": self.slug, "linkType": TopicLinkType.isa_type})}
        types |= isa_set
        if search_slug_set is not None and len(search_slug_set.intersection(types)) > 0:
            return types
        for isa_slug in isa_set:
            new_path = [p for p in curr_path]
            if isa_slug in new_path:
                logger.warning("Circular path starting from {} and ending at {} detected".format(new_path[0], isa_slug))
                continue
            new_path += [isa_slug]
            new_topic = Topic.init(isa_slug)
            if new_topic is None:
                logger.warning("{} is None. Current path is {}".format(isa_slug, ', '.join(new_path)))
                continue
            new_topic.get_types(types, new_path, search_slug_set)
        return types


    def change_description(self, desc, cat_desc=None):
        """
        Sets description in all cases and sets categoryDescription if this is a top level topic

        :param desc: Dictionary of descriptions, with keys being two letter language codes
        :param cat_desc: Optional. Dictionary of category descriptions, with keys being two letter language codes
        :return:
        """
        if cat_desc is None:
            cat_desc = {"en": "", "he": ""}
        if desc is None:
            desc = {"en": "", "he": ""}
        self.description = desc
        if getattr(self, "isTopLevelDisplay", False):
            self.categoryDescription = cat_desc
        elif getattr(self, "categoryDescription", False):
            delattr(self, "categoryDescription")

    def topics_by_link_type_recursively(self, **kwargs):
        topics, _ = self.topics_and_links_by_link_type_recursively(**kwargs)
        return topics
    
    def topics_and_links_by_link_type_recursively(self, linkType='is-a', only_leaves=False, reverse=False, max_depth=None, min_sources=None):
        """
        Gets all topics linked to `self` by `linkType`. The query is recursive so it's most useful for 'is-a' and 'displays-under' linkTypes
        :param linkType: str, the linkType to recursively traverse.
        :param only_leaves: bool, if True only return last level traversed
        :param reverse: bool, if True traverse the inverse direction of `linkType`. E.g. if linkType == 'is-a' and reverse == True, you will traverse 'is-category-of' links
        :param max_depth: How many levels below this one to traverse. 1 returns only this node's children, 0 returns only this node and None means unlimited.
        :return: list(Topic)
        """
        topics, links, below_min_sources = self._topics_and_links_by_link_type_recursively_helper(linkType, only_leaves, reverse, max_depth, min_sources)
        links = list(filter(lambda x: x.fromTopic not in below_min_sources and x.toTopic not in below_min_sources, links))
        return topics, links

    def _topics_and_links_by_link_type_recursively_helper(self, linkType, only_leaves, reverse, max_depth, min_sources, explored_set=None, below_min_sources_set=None):
        """
        Helper function for `topics_and_links_by_link_type_recursively()` to carry out recursive calls
        :param explored_set: set(str), set of slugs already explored. To be used in recursive calls.
        """
        explored_set = explored_set or set()
        below_min_sources_set = below_min_sources_set or set()
        topics = []
        dir1 = "to" if reverse else "from"
        dir2 = "from" if reverse else "to"
        links = IntraTopicLinkSet({f"{dir2}Topic": self.slug, "linkType": linkType}).array()
        children = [getattr(l, f"{dir1}Topic") for l in links]
        if len(children) == 0:
            if min_sources is not None and self.numSources < min_sources:
                return [], [], {self.slug}
            return [self], [], set()
        else:
            if not only_leaves:
                topics += [self]
            for slug in children:
                if slug in explored_set:
                    continue
                child_topic = Topic.init(slug)
                explored_set.add(slug)
                if child_topic is None:
                    logger.warning(f"{slug} is None")
                    continue
                if max_depth is None or max_depth > 0:
                    next_depth = max_depth if max_depth is None else max_depth - 1
                    temp_topics, temp_links, temp_below_min_sources = child_topic._topics_and_links_by_link_type_recursively_helper(linkType, only_leaves, reverse, next_depth, min_sources, explored_set, below_min_sources_set)
                    topics += temp_topics
                    links += temp_links
                    below_min_sources_set |= temp_below_min_sources
        return topics, links, below_min_sources_set

    def has_types(self, search_slug_set) -> bool:
        """
        WARNING: Expensive, lots of database calls
        Checks if `self` has any slug in `search_slug_set` as an ancestor when traversing `is-a` links
        :param search_slug_set: set(str), slugs to search for. returns True if any slug is found
        :return: bool
        """
        types = self.get_types(search_slug_set=search_slug_set)
        return len(search_slug_set.intersection(types)) > 0

    def should_display(self) -> bool:
        return getattr(self, 'shouldDisplay', True) and (getattr(self, 'numSources', 0) > 0 or self.has_description() or getattr(self, "data_source", "") == "sefaria")

    def has_description(self) -> bool:
        """
        returns True if self has description in at least on language
        """
        has_desc = False
        for temp_desc in getattr(self, 'description', {}).values():
            has_desc = has_desc or (isinstance(temp_desc, str) and len(temp_desc) > 0)
        for temp_desc in getattr(self, 'categoryDescription', {}).values():
            has_desc = has_desc or (isinstance(temp_desc, str) and len(temp_desc) > 0)
        return has_desc

    def set_slug_to_primary_title(self) -> None:
        new_slug = self.get_primary_title('en')
        if len(new_slug) == 0:
            new_slug = self.get_primary_title('he')
        new_slug = self.normalize_slug(new_slug)
        if new_slug != self.slug:
            self.set_slug(new_slug)

    def set_slug(self, new_slug) -> None:
        slug_field = self.slug_fields[0]
        old_slug = getattr(self, slug_field)
        setattr(self, slug_field, new_slug)
        setattr(self, slug_field, self.normalize_slug_field(slug_field))
        self.save()  # so that topic with this slug exists when saving links to it
        self.merge(old_slug)


    def merge(self, other: Union['Topic', str]) -> None:
        """
        Merge `other` into `self`. This means that all data from `other` will be merged into self.
        Data from self takes precedence in the event of conflict.
        Links to `other` will be changed to point to `self` and `other` will be deleted.
        :param other: Topic or old slug to migrate from
        :return: None
        """
        from sefaria.system.database import db
        if other is None:
            return
        other_slug = other if isinstance(other, str) else other.slug
        if other_slug == self.slug:
            logger.warning(f'Cant merge slug into itself. Slug == {self.slug}')
            return

        # links
        for link in TopicLinkSetHelper.find({"$or": [{"toTopic": other_slug}, {"fromTopic": other_slug}]}):
            if link.toTopic == getattr(link, 'fromTopic', None):  # self-link where fromTopic and toTopic were equal before slug was changed
                link.fromTopic = self.slug
                link.toTopic = self.slug
            else:
                attr = 'toTopic' if link.toTopic == other_slug else 'fromTopic'
                setattr(link, attr, self.slug)
                if getattr(link, 'fromTopic', None) == link.toTopic:  # self-link where fromTopic and toTopic are equal AFTER slug was changed
                    link.delete()
                    continue
            try:
                link.save()
            except (InputError, DuplicateRecordError) as e:
                link.delete()
            except AssertionError as e:
                link.delete()
                logger.warning('While merging {} into {}, link assertion failed with message "{}"'.format(other_slug, self.slug, str(e)))

        # source sheets
        db.sheets.update_many({'topics.slug': other_slug}, {"$set": {'topics.$[element].slug': self.slug}}, array_filters=[{"element.slug": other_slug}])

        # indexes
        for index in IndexSet({"authors": other_slug}):
            index.authors = [self.slug if author_slug == other_slug else author_slug for author_slug in index.authors]
            props = index._saveable_attrs()
            db.index.replace_one({"title":index.title}, props)

        if isinstance(other, Topic):
            # titles
            for title in other.titles:
                if title.get('primary', False) and self.get_primary_title(title['lang']):
                    # delete primary flag if self already has primary in this language
                    del title['primary']
            self.titles += other.titles

            # dictionary attributes
            for dict_attr in ['alt_ids', 'properties']:
                temp_dict = getattr(self, dict_attr, {})
                for k, v in getattr(other, dict_attr, {}).items():
                    if k in temp_dict:
                        logger.warning('Key {} with value {} already exists in {} for topic {}. Current value is {}'.format(k, v, dict_attr, self.slug, temp_dict[k]))
                        continue
                    temp_dict[k] = v
                if len(temp_dict) > 0:
                    setattr(self, dict_attr, temp_dict)
            setattr(self, 'numSources', getattr(self, 'numSources', 0) + getattr(other, 'numSources', 0))

            # everything else
            already_merged = ['slug', 'titles', 'alt_ids', 'properties', 'numSources']
            for attr in filter(lambda x: x not in already_merged, self.required_attrs + self.optional_attrs):
                if not getattr(self, attr, False) and getattr(other, attr, False):
                    setattr(self, attr, getattr(other, attr))
            self.save()
            other.delete()

    def link_set(self, _class='intraTopic', query_kwargs: dict = None, **kwargs):
        """
        :param str _class: could be 'intraTopic' or 'refTopic' or `None` (see `TopicLinkHelper`)
        :param query_kwargs: dict of extra query keyword arguments
        :return: link set of topic links to `self`
        """
        intra_link_query = {"$or": [{"fromTopic": self.slug}, {"toTopic": self.slug}]}
        if query_kwargs is not None:
            intra_link_query.update(query_kwargs)
        if _class == 'intraTopic':
            kwargs['record_kwargs'] = {'context_slug': self.slug}
            return IntraTopicLinkSet(intra_link_query, **kwargs)
        elif _class == 'refTopic':
            ref_link_query = {'toTopic': self.slug}
            if query_kwargs is not None:
                ref_link_query.update(query_kwargs)
            return RefTopicLinkSet(ref_link_query, **kwargs)
        elif _class is None:
            kwargs['record_kwargs'] = {'context_slug': self.slug}
            return TopicLinkSetHelper.find(intra_link_query, **kwargs)

    def contents(self, **kwargs):
        mini = kwargs.get('minify', False)
        d = {'slug': self.slug} if mini else super(Topic, self).contents(**kwargs)
        d['primaryTitle'] = {}
        for lang in ('en', 'he'):
            d['primaryTitle'][lang] = self.get_primary_title(lang=lang, with_disambiguation=kwargs.get('with_disambiguation', True))
        if not kwargs.get("with_html"):
            for k, v in d.get("description", {}).items():
                d["description"][k] = re.sub("<[^>]+>", "", v or "")
        return d

    def get_primary_title(self, lang='en', with_disambiguation=True):
        title = super(Topic, self).get_primary_title(lang=lang)
        if with_disambiguation:
            disambig_text = self.title_group.get_title_attr(title, lang, 'disambiguation')
            if disambig_text:
                title += f' ({disambig_text})'
            elif getattr(self, 'isAmbiguous', False) and len(title) > 0:
                title += ' (Ambiguous)'
        return title

    def get_titles(self, lang=None, with_disambiguation=True):
        if with_disambiguation:
            titles = []
            for title in self.get_titles_object():
                if not (lang is None or lang == title['lang']):
                    continue
                text = title['text']
                disambig_text = title.get('disambiguation', None)
                if disambig_text:
                    text += f' ({disambig_text})'
                titles += [text]
            return titles
        return super(Topic, self).get_titles(lang)

    def get_property(self, property, default=None, value_only=True):
        properties = getattr(self, 'properties', {})
        value = properties.get(property, {}).get('value', default)
        data_source = properties.get(property, {}).get('dataSource', default)
        if value_only:
            return value
        return value, data_source

    def set_property(self, property, value, data_source):
        if getattr(self, 'properties', None) is None:
            self.properties = {}
        self.properties[property] = {
            'value': value,
            'dataSource': data_source
        }

    @staticmethod
    def get_uncategorized_slug_set() -> set:
        categorized_topics = IntraTopicLinkSet({"linkType": TopicLinkType.isa_type}).distinct("fromTopic")
        all_topics = TopicSet().distinct("slug")
        return set(all_topics) - set(categorized_topics)

    def __str__(self):
        return self.get_primary_title("en")

    def __repr__(self):
        return "{}.init('{}')".format(self.__class__.__name__, self.slug)


class PersonTopic(Topic):
    """
    Represents a topic which is a person. Not necessarily an author of a book.
    """
    @staticmethod
    def get_person_by_key(key: str):
        """
        Find topic corresponding to deprecated Person key
        """
        return PersonTopic().load({"alt_ids.old-person-key": key})

    def annotate_place(self, d):
        properties = d.get('properties', {})
        for k in ['birthPlace', 'deathPlace']:
            place = properties.get(k)
            heKey = 'he' + k[0].upper() + k[1:]  # birthPlace => heBirthPlace
            if place and heKey not in properties:
                value, dataSource = place['value'], place['dataSource']
                place_obj = Place().load({"key": value})
                if place_obj:   
                    name = place_obj.primary_name('he')
                    d['properties'][heKey] = {'value': name, 'dataSource': dataSource}
        return d

    def contents(self, **kwargs):
        annotate_time_period = kwargs.get('annotate_time_period', False)
        d = super(PersonTopic, self).contents(**kwargs)
        if annotate_time_period:
            d = self.annotate_place(d)
            tp = self.most_accurate_life_period()
            if tp is not None:
                d['timePeriod'] = {
                    "name": {
                        "en": tp.primary_name("en"),
                        "he": tp.primary_name("he")
                    },
                    "yearRange": {
                        "en": re.sub(r'[()]', '', tp.period_string("en")),
                        "he": re.sub(r'[()]', '', tp.period_string("he")),
                    }
                }
        return d
    
    # A person may have an era, a generation, or a specific birth and death years, which each may be approximate.
    # They may also have none of these...
    def _most_accurate_period(self, time_period_class: Type[TimePeriod]) -> Optional[LifePeriod]:
        if self.get_property("birthYear") and self.get_property("deathYear"):
            return time_period_class({
                "start": self.get_property("birthYear"),
                "startIsApprox": self.get_property("birthYearIsApprox", False),
                "end": self.get_property("deathYear"),
                "endIsApprox": self.get_property("deathYearIsApprox", False)
            })
        elif self.get_property("birthYear") and self.get_property("era", "CO"):
            return time_period_class({
                "start": self.get_property("birthYear"),
                "startIsApprox": self.get_property("birthYearIsApprox", False),
            })
        elif self.get_property("deathYear"):
            return time_period_class({
                "end": self.get_property("deathYear"),
                "endIsApprox": self.get_property("deathYearIsApprox", False)
            })
        elif self.get_property("generation"):
            return time_period_class().load({"symbol": self.get_property("generation")})
        elif self.get_property("era"):
            return time_period_class().load({"symbol": self.get_property("era")})
        else:
            return None

    def most_accurate_time_period(self):
        '''
        :return: most accurate period as TimePeriod (used when a person's LifePeriod should be formatted like a general TimePeriod)
        '''
        return self._most_accurate_period(TimePeriod)

    def most_accurate_life_period(self):
        '''
        :return: most accurate period as LifePeriod. currently the only difference from TimePeriod is the way the time period is formatted as a string.
        '''
        return self._most_accurate_period(LifePeriod)

class AuthorTopic(PersonTopic):
    """
    Represents a topic which is an author of a book. Can be used on the `authors` field of `Index`
    """

    def get_authored_indexes(self):
        ins = IndexSet({"authors": self.slug})
        return sorted(ins, key=lambda i: Ref(i.title).order_id())

    def _authors_indexes_fill_category(self, indexes, path, include_dependant):
        from .text import library

        temp_index_title_set = {i.title for i in indexes}
        indexes_in_path = library.get_indexes_in_category_path(path, include_dependant, full_records=True)
        if indexes_in_path.count() == 0:
            # could be these are dependent texts without a collective title for some reason
            indexes_in_path = library.get_indexes_in_category_path(path, True, full_records=True)
            if indexes_in_path.count() == 0:
                return False
        path_end_set = {tuple(i.categories[len(path):]) for i in indexes}
        for index_in_path in indexes_in_path:
            if tuple(index_in_path.categories[len(path):]) in path_end_set:
                if index_in_path.title not in temp_index_title_set and self.slug not in set(getattr(index_in_path, 'authors', [])):
                    return False
        return True

    def _category_matches_author(self, category: Category) -> bool:
        from .schema import Term

        cat_term = Term().load({"name": category.sharedTitle})
        return len(set(cat_term.get_titles()) & set(self.get_titles())) > 0

    def aggregate_authors_indexes_by_category(self):
        from .text import library
        from .schema import Term
        from collections import defaultdict

        def index_is_commentary(index):
            return getattr(index, 'base_text_titles', None) is not None and len(index.base_text_titles) > 0 and getattr(index, 'collective_title', None) is not None

        indexes = self.get_authored_indexes()
        
        index_or_cat_list = [] # [(index_or_cat, collective_title_term, base_category)]
        cat_aggregator = defaultdict(lambda: defaultdict(list))  # of shape {(collective_title, top_cat): {(icat, category): [index_object]}}
        MAX_ICAT_FROM_END_TO_CONSIDER = 2
        for index in indexes:
            is_comm = index_is_commentary(index)
            base = library.get_index(index.base_text_titles[0]) if is_comm else index
            collective_title = index.collective_title if is_comm else None
            base_cat_path = tuple(base.categories[:-MAX_ICAT_FROM_END_TO_CONSIDER+1])
            for icat in range(len(base.categories) - MAX_ICAT_FROM_END_TO_CONSIDER, len(base.categories)):
                cat_aggregator[(collective_title, base_cat_path)][(icat, tuple(base.categories[:icat+1]))] += [index]
        for (collective_title, _), cat_choice_dict in cat_aggregator.items():
            cat_choices_sorted = sorted(cat_choice_dict.items(), key=lambda x: (len(x[1]), x[0][0]), reverse=True)
            (_, best_base_cat_path), temp_indexes = cat_choices_sorted[0]
            if len(temp_indexes) == 1:
                index_or_cat_list += [(temp_indexes[0], None, None)]
                continue
            if best_base_cat_path == ('Talmud', 'Bavli'):
                best_base_cat_path = ('Talmud',)  # hard-coded to get 'Rashi on Talmud' instead of 'Rashi on Bavli'
            
            base_category = Category().load({"path": list(best_base_cat_path)})
            if collective_title is None:
                index_category = base_category
                collective_title_term = None
            else:
                index_category = Category.get_shared_category(temp_indexes)
                collective_title_term = Term().load({"name": collective_title})
            if index_category is None or not self._authors_indexes_fill_category(temp_indexes, index_category.path, collective_title is not None) or (collective_title is None and self._category_matches_author(index_category)):
                for temp_index in temp_indexes:
                    index_or_cat_list += [(temp_index, None, None)]
                continue
            index_or_cat_list += [(index_category, collective_title_term, base_category)]
        return index_or_cat_list

    def get_aggregated_urls_for_authors_indexes(self) -> list:
        """
        Aggregates author's works by category when possible and
        returns a dictionary. Each dictionary is of shape {"url": str, "title": {"en": str, "he": str}, "description": {"en": str, "he": str}}
        corresponding to an index or category of indexes of this author's works.
        """
        from .schema import Term
        from .text import Index

        index_or_cat_list = self.aggregate_authors_indexes_by_category()
        unique_urls = []
        for index_or_cat, collective_title_term, base_category in index_or_cat_list:
            en_desc = getattr(index_or_cat, 'enShortDesc', None)
            he_desc = getattr(index_or_cat, 'heShortDesc', None)
            if isinstance(index_or_cat, Index):
                unique_urls.append({"url":f'/{index_or_cat.title.replace(" ", "_")}',
                    "title": {"en": index_or_cat.get_title('en'), "he": index_or_cat.get_title('he')},
                    "description":{"en": en_desc, "he": he_desc}})
            else:
                if collective_title_term is None:
                    cat_term = Term().load({"name": index_or_cat.sharedTitle})
                    en_text = cat_term.get_primary_title('en')
                    he_text = cat_term.get_primary_title('he')
                else:
                    base_category_term = Term().load({"name": base_category.sharedTitle})
                    en_text = f'{collective_title_term.get_primary_title("en")} on {base_category_term.get_primary_title("en")}'
                    he_text = f'{collective_title_term.get_primary_title("he")} על {base_category_term.get_primary_title("he")}'
                unique_urls.append({"url": f'/texts/{"/".join(index_or_cat.path)}',
                                    "title": {"en": en_text, "he": he_text},
                                    "description":{"en": en_desc, "he": he_desc}})
        return unique_urls

    @staticmethod
    def is_author(slug):
        t = Topic.init(slug)
        return t and isinstance(t, AuthorTopic)


class TopicSet(abst.AbstractMongoSet):
    recordClass = Topic

    def __init__(self, query=None, *args, **kwargs):
        if self.recordClass != Topic:
            # include class name of recordClass + any class names of subclasses
            query = query or {}
            subclass_names = [self.recordClass.__name__] + [klass.__name__ for klass in self.recordClass.all_subclasses()]
            query['subclass'] = {"$in": [self.recordClass.reverse_subclass_map[name] for name in subclass_names]}
        
        super().__init__(query=query, *args, **kwargs)

    @staticmethod
    def load_by_title(title):
        query = {'titles.text': title}
        return TopicSet(query=query)

    def _read_records(self):
        super()._read_records()
        for rec in self.records:
            if getattr(rec, 'subclass', False):
                Subclass = globals()[self.recordClass.subclass_map[rec.subclass]]
                rec.__class__ = Subclass  # cast to relevant subclass


class PersonTopicSet(TopicSet):
    recordClass = PersonTopic


class AuthorTopicSet(PersonTopicSet):
    recordClass = AuthorTopic


class TopicLinkHelper(object):
    """
    Used to collect attributes and functions that are useful for both IntraTopicLink and RefTopicLink
    Decided against superclass arch b/c instantiated objects will be of type super class.
    This is inconvenient when validating the attributes of object before saving (since subclasses have different required attributes)
    """
    collection = 'topic_links'
    required_attrs = [
        'toTopic',
        'linkType',
        'class',  # can be 'intraTopic' or 'refTopic'
        'dataSource',

    ]
    optional_attrs = [
        'generatedBy',
        'order',  # dict with some data on how to sort this link. can have key 'custom_order' which should trump other data
        'isJudgementCall',
    ]
    generated_by_sheets = "sheet-topic-aggregator"

    @staticmethod
    def init_by_class(topic_link, context_slug=None):
        """
        :param topic_link: dict from `topic_links` collection
        :return: either instance of IntraTopicLink or RefTopicLink based on 'class' field of `topic_link`
        """
        if topic_link['class'] == 'intraTopic':
            return IntraTopicLink(topic_link, context_slug=context_slug)
        if topic_link['class'] == 'refTopic':
            return RefTopicLink(topic_link)


class IntraTopicLink(abst.AbstractMongoRecord):
    collection = TopicLinkHelper.collection
    required_attrs = TopicLinkHelper.required_attrs + ['fromTopic']
    optional_attrs = TopicLinkHelper.optional_attrs
    valid_links = []

    def __init__(self, attrs=None, context_slug=None):
        """

        :param attrs:
        :param str context_slug: if this link is being used in a specific context, give the topic slug which represents the context. used to set if the link should be considered inverted
        """
        super(IntraTopicLink, self).__init__(attrs=attrs)
        self.context_slug = context_slug

    def load(self, query, proj=None):
        query = TopicLinkSetHelper.init_query(query, 'intraTopic')
        return super().load(query, proj)

    def _normalize(self):
        setattr(self, "class", "intraTopic")

    def _pre_save(self):
        pass

    def _validate(self):
        super(IntraTopicLink, self)._validate()

        # check everything exists
        TopicLinkType.validate_slug_exists(self.linkType, 0)
        Topic.validate_slug_exists(self.fromTopic)
        Topic.validate_slug_exists(self.toTopic)
        TopicDataSource.validate_slug_exists(self.dataSource)

        # check for duplicates
        duplicate = IntraTopicLink().load({"linkType": self.linkType, "fromTopic": self.fromTopic, "toTopic": self.toTopic,
                 "class": getattr(self, 'class'), "_id": {"$ne": getattr(self, "_id", None)}})
        if duplicate is not None:
            raise DuplicateRecordError(
                "Duplicate intra topic link for linkType '{}', fromTopic '{}', toTopic '{}'".format(
                    self.linkType, self.fromTopic, self.toTopic))

        link_type = TopicLinkType.init(self.linkType, 0)
        if link_type.slug == link_type.inverseSlug:
            duplicate_inverse = IntraTopicLink().load({"linkType": self.linkType, "toTopic": self.fromTopic, "fromTopic": self.toTopic,
             "class": getattr(self, 'class'), "_id": {"$ne": getattr(self, "_id", None)}})
            if duplicate_inverse is not None:
                raise DuplicateRecordError(
                    "Duplicate intra topic link in the inverse direction of the symmetric linkType '{}', fromTopic '{}', toTopic '{}' exists".format(
                        duplicate_inverse.linkType, duplicate_inverse.fromTopic, duplicate_inverse.toTopic))

        # check types of topics are valid according to validFrom/To
        from_topic = Topic.init(self.fromTopic)
        to_topic = Topic.init(self.toTopic)
        if getattr(link_type, 'validFrom', False):
            assert from_topic.has_types(set(link_type.validFrom)), "from topic '{}' does not have valid types '{}' for link type '{}'. Instead, types are '{}'".format(self.fromTopic, ', '.join(link_type.validFrom), self.linkType, ', '.join(from_topic.get_types()))
        if getattr(link_type, 'validTo', False):
            assert to_topic.has_types(set(link_type.validTo)), "to topic '{}' does not have valid types '{}' for link type '{}'. Instead, types are '{}'".format(self.toTopic, ', '.join(link_type.validTo), self.linkType, ', '.join(to_topic.get_types()))

        # assert this link doesn't create circular paths (in is_a link type)
        # should consider this test also for other non-symmetric link types such as child-of
        if self.linkType == TopicLinkType.isa_type:
            to_topic = Topic.init(self.toTopic)
            ancestors = to_topic.get_types()
            assert self.fromTopic not in ancestors, "{} is an is-a ancestor of {} creating an illogical circle in the topics graph, here are {} ancestors: {}".format(self.fromTopic, self.toTopic, self.toTopic, ancestors)

    def contents(self, **kwargs):
        d = super(IntraTopicLink, self).contents(**kwargs)
        if not (self.context_slug is None or kwargs.get('for_db', False)):
            d['isInverse'] = self.is_inverse
            d['topic'] = self.topic
            del d['toTopic']
            del d['fromTopic']
            if d.get('order', None) is not None:
                d['order']['tfidf'] = self.tfidf
                d['order'].pop('toTfidf', None)
                d['order'].pop('fromTfidf', None)
        return d

    # PROPERTIES

    def get_is_inverse(self):
        return self.context_slug == self.toTopic

    def get_topic(self):
        return self.fromTopic if self.is_inverse else self.toTopic

    def get_tfidf(self):
        order = getattr(self, 'order', {})
        return order.get('fromTfidf' if self.is_inverse else 'toTfidf', 0)

    topic = property(get_topic)
    tfidf = property(get_tfidf)
    is_inverse = property(get_is_inverse)


class RefTopicLink(abst.AbstractMongoRecord):
    collection = TopicLinkHelper.collection

    # is_sheet and expandedRef: defaulted automatically in normalize
    required_attrs = TopicLinkHelper.required_attrs + ['ref', 'expandedRefs', 'is_sheet']

    # unambiguousToTopic: used when linking to an ambiguous topic. There are some instance when you need to decide on one of the options (e.g. linking to an ambiguous rabbi in frontend). this can be used as a proxy for toTopic in those cases.
    # descriptions: Titles and learning prompts for this Ref in this Topic context.  Structured as follows:
    # descriptions: {
    #     en: {
    #         title: Str,
    #         prompt: Str,
    #         primacy: Int
    #     },
    #     he: {
    #         title: Str,
    #         prompt: Str,
    #         primacy: Int
    #     }
    # }
    optional_attrs = TopicLinkHelper.optional_attrs + ['charLevelData', 'unambiguousToTopic', 'descriptions']

    def set_description(self, lang, title, prompt):
        d = getattr(self, "descriptions", {})
        d[lang] = {
            "title": title,
            "prompt": prompt,
        }
        self.descriptions = d
        return self

    def _sanitize(self):
        super()._sanitize()
        for lang, d in getattr(self, "descriptions", {}).items():
            for k, v in d.items():
                if isinstance(v, str):
                    self.descriptions[lang][k] = bleach.clean(v, tags=self.ALLOWED_TAGS, attributes=self.ALLOWED_ATTRS)

    def load(self, query, proj=None):
        query = TopicLinkSetHelper.init_query(query, 'refTopic')
        return super().load(query, proj)

    def _normalize(self):
        super(RefTopicLink, self)._normalize()
        self.is_sheet = bool(re.search(r"Sheet \d+$", self.ref))
        setattr(self, "class", "refTopic")
        if self.is_sheet:
            self.expandedRefs = [self.ref]
        else:  # Ref is a regular Sefaria Ref
            self.ref = Ref(self.ref).normal()
            self.expandedRefs = [r.normal() for r in Ref(self.ref).all_segment_refs()]

    def _validate(self):
        Topic.validate_slug_exists(self.toTopic)
        TopicLinkType.validate_slug_exists(self.linkType, 0)
        to_topic = Topic.init(self.toTopic)
        link_type = TopicLinkType.init(self.linkType, 0)
        if getattr(link_type, 'validTo', False):
            assert to_topic.has_types(set(link_type.validTo)), "to topic '{}' does not have valid types '{}' for link type '{}'. Instead, types are '{}'".format(self.toTopic, ', '.join(link_type.validTo), self.linkType, ', '.join(to_topic.get_types()))
    
    def _pre_save(self):
        if getattr(self, "_id", None) is None:
            # check for duplicates
            query = {"linkType": self.linkType, "ref": self.ref, "toTopic": self.toTopic, "dataSource": getattr(self, 'dataSource', {"$exists": False}), "class": getattr(self, 'class')}
            if getattr(self, "charLevelData", None):
                query["charLevelData.startChar"] = self.charLevelData['startChar']
                query["charLevelData.endChar"] = self.charLevelData['endChar']
                query["charLevelData.versionTitle"] = self.charLevelData['versionTitle']
                query["charLevelData.language"] = self.charLevelData['language']

            duplicate = RefTopicLink().load(query)
            if duplicate is not None:
                raise DuplicateRecordError("Duplicate ref topic link for linkType '{}', ref '{}', toTopic '{}', dataSource '{}'".format(
                self.linkType, self.ref, self.toTopic, getattr(self, 'dataSource', 'N/A')))

    def contents(self, **kwargs):
        d = super(RefTopicLink, self).contents(**kwargs)
        if not kwargs.get('for_db', False):
            d['topic'] = d['toTopic']
            d.pop('toTopic')
        return d

class TopicLinkSetHelper(object):
    @staticmethod
    def init_query(query, link_class):
        query = query or {}
        query['class'] = link_class
        return query

    @staticmethod
    def find(query=None, page=0, limit=0, sort=[("_id", 1)], proj=None, record_kwargs=None):
        from sefaria.system.database import db
        record_kwargs = record_kwargs or {}
        raw_records = getattr(db, TopicLinkHelper.collection).find(query, proj).sort(sort).skip(page * limit).limit(limit)
        return [TopicLinkHelper.init_by_class(r, **record_kwargs) for r in raw_records]


class IntraTopicLinkSet(abst.AbstractMongoSet):
    recordClass = IntraTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = TopicLinkSetHelper.init_query(query, 'intraTopic')
        super().__init__(query=query, *args, **kwargs)


class RefTopicLinkSet(abst.AbstractMongoSet):
    recordClass = RefTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = TopicLinkSetHelper.init_query(query, 'refTopic')
        super().__init__(query=query, *args, **kwargs)


class TopicLinkType(abst.SluggedAbstractMongoRecord):
    collection = 'topic_link_types'
    slug_fields = ['slug', 'inverseSlug']
    required_attrs = [
        'slug',
        'inverseSlug',
        'displayName',
        'inverseDisplayName'
    ]
    optional_attrs = [
        'pluralDisplayName',
        'inversePluralDisplayName',
        'alt_ids',
        'inverse_alt_ids',
        'shouldDisplay',
        'inverseShouldDisplay',
        'groupRelated',
        'inverseGroupRelated',
        'devDescription',
        'validFrom',
        'validTo'
    ]
    related_type = 'related-to'
    isa_type = 'is-a'
    possibility_type = 'possibility-for'

    def _validate(self):
        super(TopicLinkType, self)._validate()
        # Check that validFrom and validTo contain valid topic slugs if exist

        for validToTopic in getattr(self, 'validTo', []):
            Topic.validate_slug_exists(validToTopic)

        for validFromTopic in getattr(self, 'validFrom', []):
            Topic.validate_slug_exists(validFromTopic)

    def get(self, attr, is_inverse, default=None):
        attr = 'inverse{}{}'.format(attr[0].upper(), attr[1:]) if is_inverse else attr
        return getattr(self, attr, default)


class TopicLinkTypeSet(abst.AbstractMongoSet):
    recordClass = TopicLinkType


class TopicDataSource(abst.SluggedAbstractMongoRecord):
    collection = 'topic_data_sources'
    slug_fields = ['slug']
    required_attrs = [
        'slug',
        'displayName',
    ]
    optional_attrs = [
        'url',
        'description',
    ]


class TopicDataSourceSet(abst.AbstractMongoSet):
    recordClass = TopicDataSource


def process_index_title_change_in_topic_links(indx, **kwargs):
    from sefaria.system.exceptions import InputError

    print("Cascading Topic Links from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    objs = RefTopicLinkSet({"$or": queries})
    for o in objs:
        o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
        try:
            o.save()
        except InputError:
            logger.warning("Failed to convert ref data from: {} to {}".format(kwargs['old'], kwargs['new']))

def process_index_delete_in_topic_links(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    RefTopicLinkSet({"ref": {"$regex": pattern}}).delete()

def process_topic_delete(topic):
    RefTopicLinkSet({"toTopic": topic.slug}).delete()
    IntraTopicLinkSet({"$or": [{"toTopic": topic.slug}, {"fromTopic": topic.slug}]}).delete()
    for sheet in db.sheets.find({"topics.slug": topic.slug}):
        sheet["topics"] = [t for t in sheet["topics"] if t["slug"] != topic.slug]
        db.sheets.save(sheet)

def process_topic_description_change(topic, **kwargs):
    """
    Upon topic description change, get rid of old markdown links and save any new ones
    """
    # need to delete currently existing links but dont want to delete link if its still in the description
    # so load up a dictionary of relevant data -> link
    IntraTopicLinkSet({"toTopic": topic.slug, "linkType": "related-to", "dataSource": "learning-team-editing-tool"}).delete()
    refLinkType = 'popular-writing-of' if getattr(topic, 'subclass', '') == 'author' else 'about'
    RefTopicLinkSet({"toTopic": topic.slug, "linkType": refLinkType, "dataSource": "learning-team-editing-tool"}).delete()

    markdown_links = set()
    for lang, val in kwargs['new'].items():   # put each link in a set so we dont try to create duplicate of same link
        for m in re.findall('\[.*?\]\((.*?)\)', val):
            markdown_links.add(m)

    for markdown_link in markdown_links:
        if markdown_link.startswith("/topics"):
            other_slug = markdown_link.split("/")[-1]
            intra_topic_dict = {"toTopic": topic.slug, "linkType": "related-to",
                                "dataSource": "learning-team-editing-tool", 'fromTopic': other_slug}
            try:
                IntraTopicLink(intra_topic_dict).save()
            except DuplicateRecordError as e:  # there may be identical IntraTopicLinks with a different dataSource or inverted fromTopic and toTopic
                pass
        else:
            if markdown_link.startswith("/"):
                markdown_link = markdown_link[1:]  # assume link starts with a '/'
            try:
                ref = Ref(markdown_link).normal()
            except InputError as e:
                continue
            ref_topic_dict = {"toTopic": topic.slug, "dataSource": "learning-team-editing-tool", "linkType": refLinkType,
                              'ref': ref}
            RefTopicLink(ref_topic_dict).save()







# coding=utf-8
from . import abstract as abst
from . import schema
from . import timeperiod
import geojson
import logging
logger = logging.getLogger(__name__)


class Person(abst.AbstractMongoRecord):
    """
    Homo Sapiens
    """
    collection = 'person'
    track_pkeys = True
    pkeys = ["key"]

    required_attrs = [
        "key",
        "names"
    ]
    optional_attrs = [
        "era",  # A key to a TimePeriod of type Era
        "generation",  # A key to a TimePeriod of type Generation
        "birthYear",
        "birthYearIsApprox",
        "birthPlace",
        "deathYear",
        "deathYearIsApprox",
        "deathPlace",
        "enBio",
        "heBio",
        "enWikiLink",
        "heWikiLink",
        "jeLink",
        "sex",  # M or F (or ...)
    ]

    def _normalize(self):
        super(Person, self)._normalize()
        self.names = self.name_group.titles
        if not self.key and self.primary_name("en"):
            self.key = self.primary_name("en")

    def _validate(self):
        super(Person, self)._validate()
        assert self.key

    # Names
    # This is the same as on TimePeriod, and very similar to Terms & Place - abstract out
    def _init_defaults(self):
        self.name_group = None

    def _set_derived_attributes(self):
        self.name_group = schema.TitleGroup(getattr(self, "names", None))

    def all_names(self, lang=None):
        return self.name_group.all_titles(lang)

    def primary_name(self, lang=None):
        return self.name_group.primary_title(lang)

    def secondary_names(self, lang=None):
        return self.name_group.secondary_titles(lang)

    # Dates
    # A person may have an era, a generation, or a specific birth and death years, which each may be approximate.
    # They may also have none of these...
    def mostAccurateTimePeriod(self):
        if getattr(self, "birthYear", None) and getattr(self, "deathYear", None):
            return timeperiod.TimePeriod({
                "start": self.birthYear,
                "startIsApprox": getattr(self, "birthYearIsApprox", False),
                "end": self.deathYear,
                "endIsApprox": getattr(self, "deathYearIsApprox", False)
            })
        elif getattr(self, "birthYear", None) and getattr(self, "era", "CO"):
            return timeperiod.TimePeriod({
                "start": self.birthYear,
                "startIsApprox": getattr(self, "birthYearIsApprox", False),
            })
        elif getattr(self, "generation", None):
            return timeperiod.TimePeriod().load({"symbol": self.generation})
        elif getattr(self, "era", None):
            return timeperiod.TimePeriod().load({"symbol": self.era})
        else:
            return None

    def is_post_talmudic(self):
        eras = ["GN", "RI", "AH", "CO"]
        return getattr(self, "era", None) in eras

    def get_relationship_set(self):
        return PersonRelationshipSet.load_by_key(self.key)

    def get_grouped_relationships(self):
        return PersonRelationshipSet.load_by_key(self.key).grouped(self.key)

    # todo: store results of this IndexSet on the object, so that the query isn't repeated between has_indexes and get_indexes
    def has_indexes(self):
        from . import text
        return text.IndexSet({"authors": self.key}).count() > 0

    def get_indexes(self):
        from . import text
        ins = text.IndexSet({"authors": self.key})
        return sorted(ins, key=lambda i: text.Ref(i.title).order_id())

    def get_era(self):
        if getattr(self, "era", False):
            return timeperiod.TimePeriod().load({"symbol": self.era})
        else:
            g = self.get_generation()
            if g:
                return g.get_era()
        return None

    def get_generation(self):
        if not getattr(self, "generation", False):
            return None
        return timeperiod.TimePeriod().load({"symbol": self.generation})

    def get_places(self, asGeoJsonString=True):
        from . import place

        places = {}

        def updatePlace(key, eventype, en_event, he_event):
            if not places.get(key):
                places[key] = {"type": eventype,
                               "en_events": [en_event],
                               "he_events": [he_event]}
            else:
                places[key]["en_events"] += [en_event]
                places[key]["he_events"] += [he_event]
                if places[key]["type"] != eventype:
                    places[key]["type"] = "mixed"

        # get set of all places, birth, death, composition, publication
        if getattr(self, "birthPlace", None):
            updatePlace(self.birthPlace, "birth", "Born", "נולד")

        for i in self.get_indexes():  # todo: Commentaries
            if getattr(i, "compPlace", None):
                tp = i.composition_time_period()
                if tp:
                    en_string = "{} composed {}".format(i.get_title("en"), tp.period_string("en"))
                    he_string = i.get_title("he") + " נתחבר " + tp.period_string("he")
                else:
                    en_string = "{} composed".format(i.get_title("en"))
                    he_string = i.get_title("he") + " " + "נתחבר"
                updatePlace(i.compPlace, "composed", en_string, he_string)

            if getattr(i, "pubPlace", None):
                tp = i.publication_time_period()
                if tp:
                    en_string = "{} first published {}".format(i.get_title("en"), tp.period_string("en"))
                    he_string = i.get_title("he") + " נדפס לראשונה " + tp.period_string("he")
                else:
                    en_string = "{} first published".format(i.get_title("en"))
                    he_string = i.get_title("he") + " " + "נדפס לראשונה"
                updatePlace(i.pubPlace, "published", en_string, he_string)

        if getattr(self, "deathPlace", None):
            updatePlace(self.deathPlace, "death", "Died", "נפטר")

        if not places:
            return None

        for key, data in list(places.items()):
            p = place.Place().load({"key": key})
            if not p:
                logger.warning("Found a bad {} place key '{}' for {}".format(data["type"], key, self.primary_name("en")))
                del places[key]
                continue
            data["en_name"] = p.primary_name("en")
            data["he_name"] = p.primary_name("he")
            data["point"] = p.point_location()

        if not asGeoJsonString:
            return places

        features = []
        for key, data in places.items():
            if data.get("point"):
                loc = data.pop("point")
                features.append(geojson.Feature(geometry=loc, id=key, properties=data))
        return geojson.dumps(geojson.FeatureCollection(features))


class PersonSet(abst.AbstractMongoSet):
    recordClass = Person


class PersonRelationship(abst.AbstractMongoRecord):
    collection = 'person_rel'

    required_attrs = [
        "from_key",
        "to_key",
        "type"
    ]
    optional_attrs = []

    def get_type(self):
        return PersonRelationshipType().load({"key": self.type})

    #todo: handle reversable functions (what is that called again?) like 'opposed'


class PersonRelationshipSet(abst.AbstractMongoSet):
    recordClass = PersonRelationship

    @staticmethod
    def load_by_key(key):
        return PersonRelationshipSet({"$or": [{"from_key": key}, {"to_key": key}]})

    def grouped(self, origin_key):
        """
        Return the relationships to the Person identified by origin_key, grouped by relationship type
        """
        types = {}
        for rel in self:
            #todo: refactor duplicate code
            if rel.from_key == origin_key:
                target = Person().load({"key": rel.to_key})
                if not target:
                    raise Exception("Can not find person {}".format(rel.to_key))
                type = rel.get_type()
                group_key = (rel.get_type().key, "forward")
                if not types.get(group_key):
                    types[group_key] = {
                        "en": type.get_forward_name("en"),
                        "he": type.get_forward_name("he"),
                        "people": []
                    }
                types[group_key]["people"].append(target)
            elif rel.to_key == origin_key:
                target = Person().load({"key": rel.from_key})
                if not target:
                    raise Exception("Can not find person {}".format(rel.from_key))
                type = rel.get_type()
                group_key = (rel.get_type().key, "reverse")
                if not types.get(group_key):
                    types[group_key] = {
                        "en": type.get_reverse_name("en"),
                        "he": type.get_reverse_name("he"),
                        "people": []
                    }
                types[group_key]["people"].append(target)
        return types


class PersonRelationshipType(abst.AbstractMongoRecord):
    collection = 'person_rel_type'
    track_pkeys = True
    pkeys = ["key"]

    required_attrs = [
        "key",
        "forward_names",
        "reverse_names"
    ]

    def _init_defaults(self):
        self.forward_group = None
        self.reverse_group = None

    def _set_derived_attributes(self):
        self.forward_group = schema.TitleGroup(getattr(self, "forward_names", None))
        self.reverse_group = schema.TitleGroup(getattr(self, "reverse_names", None))

    def _normalize(self):
        super(PersonRelationshipType, self)._normalize()
        self.forward_names = self.forward_group.titles
        self.reverse_names = self.reverse_group.titles

    def set_forward_name(self, text, lang):
        self.forward_group.add_title(text, lang, primary=True, replace_primary=True)

    def set_reverse_name(self, text, lang):
        self.reverse_group.add_title(text, lang, primary=True, replace_primary=True)

    def get_forward_name(self, lang):
        return self.forward_group.primary_title(lang)

    def get_reverse_name(self, lang):
        return self.reverse_group.primary_title(lang)


class PersonRelationshipTypeSet(abst.AbstractMongoSet):
    recordClass = PersonRelationshipType


"""
def process_index_title_change_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(kwargs["old"]))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|(^({}) on {} \d)".format(re.escape(kwargs["old"]), "|".join(commentators), re.escape(kwargs["old"]))
        #pattern = r'(^{} \d)|( on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [r.replace(kwargs["old"], kwargs["new"], 1) if re.search(pattern, r) else r for r in l.refs]
        try:
            l.save()
        except InputError: #todo: this belongs in a better place - perhaps in abstract
            logger.warning(u"Deleting link that failed to save: {} {}".format(l.refs[0], l.refs[1]))
            l.delete()


def process_index_delete_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = ur'^{} on '.format(re.escape(indx.title))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|^({}) on {} \d".format(re.escape(indx.title), "|".join(commentators), re.escape(indx.title))
    LinkSet({"refs": {"$regex": pattern}}).delete()
"""

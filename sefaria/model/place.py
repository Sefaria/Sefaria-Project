
import geojson
from . import abstract as abst
from . import schema
from sefaria.system.exceptions import InputError

import logging
logger = logging.getLogger(__name__)

class Place(abst.AbstractMongoRecord):
    """
    Homo Sapiens
    """
    collection = 'place'
    track_pkeys = True
    pkeys = ["key"]

    required_attrs = [
        "key",
        "names",
        "point"
    ]
    optional_attrs = [
        "area"
    ]

    # Names
    # This is the same as on TimePeriod, and very similar to Terms & Person - abstract out
    def _init_defaults(self):
        self.name_group = None

    def _set_derived_attributes(self):
        self.name_group = schema.TitleGroup(getattr(self, "names", None))

    def _normalize(self):
        super(Place, self)._normalize()
        self.names = self.name_group.titles
        #if not self.key and self.primary_name("en"):
        #    self.key = self.primary_name("en")

    def all_names(self, lang=None):
        return self.name_group.all_titles(lang)

    def primary_name(self, lang=None):
        return self.name_group.primary_title(lang)

    def secondary_names(self, lang=None):
        return self.name_group.secondary_titles(lang)

    ###

    def point_location(self, lon=None, lat=None):
        if lat is None and lon is None:
            return getattr(self, "point", None)
        if lat is None or lon is None:
            raise InputError("Bad coordinates passed to Place.point_location: {}, {}".format(lon, lat))
        self.point = geojson.Point((lon, lat))

    def area_location(self, geoj=None):
        if geoj is None:
            return self.area
        self.area = geoj



class PlaceSet(abst.AbstractMongoSet):
    recordClass = Place

    def asGeoJson(self, with_polygons=False, as_string=False):
        features = []
        for place in self:
            point = place.point_location()
            area = None
            if with_polygons:
                area = place.area_location()
            feature = area or point
            if feature:
                features.append(geojson.Feature(geometry=feature, id=place.key, properties={"name": place.key}))
        if as_string:
            return geojson.dumps(geojson.FeatureCollection(features))
        else:
            return geojson.FeatureCollection(features)

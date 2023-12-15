
import geojson
from . import abstract as abst
from . import schema
from sefaria.system.exceptions import InputError
import structlog
from geopy.geocoders import Nominatim
from sefaria.utils.hebrew import get_he_key
logger = structlog.get_logger(__name__)

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
    
    @classmethod 
    def create_new_place(cls, en, he=None):
        p = cls().load({'key': en})
        if p:
            return p
        p = cls({'key': en})
        p.name_group.add_title(en, 'en', True, True)
        if he:
            p.name_group.add_title(he, 'he', True, True)
        p.city_to_coordinates(en)
        p.save()
        return p

    def city_to_coordinates(self, city):
        geolocator = Nominatim(user_agent='hello@sefaria.org')
        location = geolocator.geocode(city)
        if location and location.raw['type'] in ['administrative', 'city', 'town', 'municipality', 'neighbourhood', 'village']:
            self.point_location(lon=location.longitude, lat=location.latitude)
        else:
            raise InputError(f"{city} is not a real city.")


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

def process_index_place_change(indx, **kwargs):
    key = kwargs['attr']
    he_key = get_he_key(key)
    he_new_val = getattr(indx, he_key, '')
    if kwargs['new'] != '':
        Place.create_new_place(en=kwargs['new'], he=he_new_val)

def process_topic_place_change(topic_obj, **kwargs):
    keys = ["birthPlace", "deathPlace"]
    for key in keys:
        if key in kwargs.keys():  # only change property value if key is in data, otherwise it indicates no change
            new_val = kwargs[key]
            if new_val != '':
                he_key = get_he_key(key)
                he_new_val = kwargs.get(he_key, '')
                place = Place.create_new_place(en=new_val, he=he_new_val)
                topic_obj.properties[key] = {"value": place.primary_name('en'), 'dataSource': 'learning-team-editing-tool'}
            else:
                topic_obj.properties.pop(key, None)


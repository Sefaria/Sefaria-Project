# -*- coding: utf-8 -*-
"""

"""

from . import abstract as abst
from . import schema

import structlog
logger = structlog.get_logger(__name__)


""" This data, from Joshua Parker - http://www.joshua-parker.net/sages/
Loaded from MySQL DB with Sefaria-Data/sources/Sages_DB/parse_eras_from_sages.py
+---------------+------------+-----------------+-------------------------------+-----------------------+
| period_symbol | period_seq | period_era      | period_generation             | period_dates          |
+---------------+------------+-----------------+-------------------------------+-----------------------+
| AV            |        1.0 | Avot            |                               | before 13th c. BCE    |
| MS            |        2.0 | Moshe Rabbeinu  |                               | 13th c. BCE           |
| NR            |        3.0 | Former Prophets |                               | 13th c. - 6th c. BCE  |
| NA            |        4.0 | Latter Prophets |                               | 6th c. - 3rd c. BCE   |
| KG            |        5.0 | Great Assembly  |                               | 3rd c. BCE            |
| PT            |        6.0 | pre-Tannaic     |                               | 3rd c. – 1st c. BCE   |
| Z1            |        7.0 | Zugot           | first generation              | 2nd c. BCE            |
| Z2            |        8.0 | Zugot           | second generation             | 2nd c. BCE            |
| Z3            |        9.0 | Zugot           | third generation              | 1st c. BCE            |
| Z4            |       10.0 | Zugot           | fourth generation             | 1st c. BCE            |
| Z5            |       11.0 | Zugot           | fifth generation              | 30 BCE – 20 CE        |
| T1            |       12.0 | Tannaim         | first generation              | 20 – 40 CE            |
| T             |       12.1 | Tannaim         | unknown generation            | 20 -200 CE            |
| T2            |       13.0 | Tannaim         | second generation             | 40 – 80 CE            |
| T3            |       14.0 | Tannaim         | third generation              | 80 – 110 CE           |
| T4            |       15.0 | Tannaim         | fourth generation             | 110 – 135 CE          |
| T4/T5         |       15.5 | Tannaim         | fourth and fifth generations  | 110 - 170 CE          |
| T5            |       16.0 | Tannaim         | fifth generation              | 135 – 170 CE          |
| T6            |       17.0 | Tannaim         | sixth generation              | 170 – 200 CE          |
| TA            |       18.0 | Tannaim/Amoraim | transition                    | 200 – 220 CE          |
| A1            |       19.0 | Amoraim         | first generation              | 220 – 250 CE          |
| A1/A2         |       19.5 | Amoraim         | first and second generations  | 220 - 290 CE          |
| A2            |       20.0 | Amoraim         | second generation             | 250 – 290 CE          |
| A2/A3         |       20.5 | Amoraim         | second and third generations  | 250 - 320 CE          |
| A3            |       21.0 | Amoraim         | third generation              | 290 – 320 CE          |
| A3/A4         |       21.5 | Amoraim         | third and fourth generations  | 290 - 350 CE          |
| A4            |       22.0 | Amoraim         | fourth generation             | 320 – 350 CE          |
| A4/A5         |       22.5 | Amoraim         | fourth and fifth generations  | 320 - 375 CE          |
| A5            |       23.0 | Amoraim         | fifth generation              | 350 – 375 CE          |
| A5/A6         |       23.5 | Amoraim         | fifth and sixth generations   | 350 - 425 CE          |
| A6            |       24.0 | Amoraim         | sixth generation              | 375 – 425 CE          |
| A6/A7         |       24.5 | Amoraim         | sixth and seventh generations | 375 - 460 CE          |
| A7            |       25.0 | Amoraim         | seventh generation            | 425 – 460 CE          |
| A8            |       26.0 | Amoraim         | eighth generation             | 460 – 500 CE          |
| SV            |       27.0 | Savoraim        |                               | 500 - 540 CE          |
| GN            |       28.0 | Geonim          |                               | 6th c. - 11th c. CE   |
| RI            |       29.0 | Rishonim        |                               | 11th c. - 15th c. CE  |
| AH            |       30.0 | Acharonim       |                               | 15th c. CE - present  |
+---------------+------------+-----------------+-------------------------------+-----------------------+
"""

DASH = '–'

class TimePeriod(abst.AbstractMongoRecord):
    """
    TimePeriod is used both for the saved time periods - Eras and Generations
    and for the adhoc in memory TimePeriods generated from e.g. the Person model
    """
    collection = 'time_period'
    track_pkeys = True
    pkeys = ["symbol"]

    required_attrs = [
        "symbol",
        "type",  # "Era", "Generation", "Two Generations"
        "names"
    ]
    optional_attrs = [
        "start",
        "startIsApprox",
        "end",
        "endIsApprox",
        "order",
        "range_string"
    ]

    def __str__(self):
        return vars(self).__str__()

    def __repr__(self):
        return self.__str__()

    # Names
    # todo: This is the same as on Person, and very similar to Terms - abstract out
    def _init_defaults(self):
        self.name_group = None

    def _set_derived_attributes(self):
        self.name_group = schema.TitleGroup(getattr(self, "names", None))

    def _normalize(self):
        self.names = self.name_group.titles
        if getattr(self, "start", False):
            self.start = int(self.start)

        if getattr(self, "end", False):
            self.end = int(self.end)

    def all_names(self, lang="en"):
        return self.name_group.all_titles(lang)

    def primary_name(self, lang="en"):
        return self.name_group.primary_title(lang)

    def secondary_names(self, lang="en"):
        return self.name_group.secondary_titles(lang)

    def add_name(self, name, lang, primary=False, replace_primary=False):
        return self.name_group.add_title(name, lang, primary=primary, replace_primary=replace_primary)

    def getYearLabels(self, lang):
        start = getattr(self, "start", None)
        end = getattr(self, "end", None)
        if start is None:
            return "", ""
        if end is None:
            end = start

        if int(start) < 0 < int(end):
            return ("BCE ", "CE") if lang == "en" else ('לפנה"ס' + ' ', "לספירה")
        elif int(end) > 0:
            return ("", "CE") if lang == "en" else ("", "לספירה")
        else:  # self.end <= 0
            return ("", "BCE") if lang == "en" else ("", 'לפנה"ס')

    def getApproximateMarkers(self, lang):
        marker = "c." if lang == "en" else "בקירוב"
        return (
            marker if getattr(self, "startIsApprox", None) else "",
            marker if getattr(self, "endIsApprox", None) else ""
        )

    def period_string(self, lang):
        name = ""

        if getattr(self, "start", None) is not None:  # and getattr(self, "end", None) is not None:
            labels = self.getYearLabels(lang)
            approxMarker = self.getApproximateMarkers(lang)

            if lang == "en":
                if getattr(self, "symbol", "") == "CO" or getattr(self, "end", None) is None:
                    name += " ({}{} {} {} )".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[1],
                        DASH)
                    return name
                elif int(self.start) == int(self.end):
                    name += " ({}{} {})".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[1])
                else:
                    name += " ({}{} {} {} {}{} {})".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[0],
                        DASH,
                        approxMarker[1],
                        abs(int(self.end)),
                        labels[1])
            if lang == "he":
                if getattr(self, "symbol", "") == "CO" or getattr(self, "end", None) is None:
                    name += " ({} {} {} {} )".format(
                        abs(int(self.start)),
                        labels[1],
                        approxMarker[0],
                        DASH)
                    return name
                elif int(self.start) == int(self.end):
                    name += " ({}{}{})".format(
                        abs(int(self.end)),
                        " " + labels[1] if labels[1] else "",
                        " " + approxMarker[1] if approxMarker[1] else "")
                else:
                    both_approx = approxMarker[0] and approxMarker[1]
                    if both_approx:
                        name += " ({}{} {} {}{} {})".format(
                            abs(int(self.start)),
                            " " + labels[0] if labels[0] else "",
                            DASH,
                            abs(int(self.end)),
                            " " + labels[1] if labels[1] else "",
                            approxMarker[1]
                        )
                    else:
                        name += " ({}{}{} {} {}{}{})".format(
                            abs(int(self.start)),
                            " " + labels[0] if labels[0] else "",
                            " " + approxMarker[0] if approxMarker[0] else "",
                            DASH,
                            abs(int(self.end)),
                            " " + labels[1] if labels[1] else "",
                            " " + approxMarker[1] if approxMarker[1] else ""
                        )

        return name

    def get_era(self):
        """
        Given a generation, get the Era for that generation
        :return:
        """
        #This info should be stored on Generations.  It doesn't change.
        if self.type == "Era":
            return self
        t = TimePeriod().load({"type": "Era",
                        "start": {"$lte": self.start},
                        "end": {"$gte": self.end}})

        return t or None

    def get_people_in_generation(self, include_doubles = True):
        from . import topic
        if self.type == "Generation":
            if include_doubles:
                return topic.Topic({"properties.generation.value": {"$regex": self.symbol}})
            else:
                return topic.Topic({"properties.generation.value": self.symbol})

    def determine_year_estimate(self):
        start = getattr(self, 'start', None)
        end = getattr(self, 'end', None)
        if start != None and end != None:
            return round((int(start) + int(end)) / 2)
        elif start != None:
            return int(start)
        elif end != None:
            return int(end)

class TimePeriodSet(abst.AbstractMongoSet):
    recordClass = TimePeriod

    @staticmethod
    def _get_typed_set(type):
        return TimePeriodSet({"type": type}, sort=[["order", 1]])

    @staticmethod
    def get_eras():
        return TimePeriodSet._get_typed_set("Era")

    @staticmethod
    def get_generations(include_doubles = False):
        arg = {"$in": ["Generation", "Two Generations"]} if include_doubles else "Generation"
        return TimePeriodSet._get_typed_set(arg)

class LifePeriod(TimePeriod):

    def period_string(self, lang):

        if getattr(self, "start", None) == None and getattr(self, "end", None) == None:
            return

        labels = self.getYearLabels(lang)
        approxMarker = self.getApproximateMarkers(lang)
        abs_birth = abs(int(getattr(self, "start", 0)))
        abs_death = abs(int(getattr(self, "end", 0)))
        if lang == "en":
            birth = 'b.'
            death = 'd.'
            order_vars_by_lang = lambda year, label, approx: (approx, '', year, label)
        else:
            birth = 'נו׳'
            death = 'נפ׳'
            order_vars_by_lang = lambda year, label, approx: (year, ' ', label, approx)

        if getattr(self, "symbol", "") == "CO" or getattr(self, "end", None) is None:
            name = '{} {}{}{} {}'.format(birth, *order_vars_by_lang(abs_birth, labels[1], approxMarker[0]))
        elif getattr(self, "start", None) is None:
            name = '{} {}{}{} {}'.format(death, *order_vars_by_lang(abs_death, labels[1], approxMarker[0]))
        elif int(self.start) == int(self.end):
            name = '{}{}{} {}'.format(*order_vars_by_lang(abs_birth, labels[1], approxMarker[0]))
        else:
            both_approx = approxMarker[0] and approxMarker[1]
            if lang == 'he' and  both_approx:
                birth_string = '{}{}{}'.format(*order_vars_by_lang(abs_birth, labels[0], approxMarker[0])[:-1])
            else:
                birth_string = '{}{}{} {}'.format(*order_vars_by_lang(abs_birth, labels[0], approxMarker[0]))
            death_string = '{}{}{} {}'.format(*order_vars_by_lang(abs_death, labels[1], approxMarker[0]))
            name = f'{birth_string} {DASH} {death_string}'

        name = f' ({" ".join(name.split())})'
        return name


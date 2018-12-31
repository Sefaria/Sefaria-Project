# -*- coding: utf-8 -*-
"""

"""

from . import abstract as abst
from . import schema

import logging
logger = logging.getLogger(__name__)


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
            return u"", u""
        if end is None:
            end = start

        if start < 0 < end:
            return (u"BCE ", u"CE") if lang == "en" else (u'לפנה"ס' + u' ', u"לספירה")
        elif end > 0:
            return (u"", u"CE") if lang == "en" else (u"", u"לספירה")
        else:  # self.end <= 0
            return (u"", u"BCE") if lang == "en" else (u"", u'לפנה"ס')

    def getApproximateMarkers(self, lang):
        marker = u"c." if lang == "en" else u"בקירוב"
        return (
            marker if getattr(self, "startIsApprox", None) else u"",
            marker if getattr(self, "endIsApprox", None) else u""
        )

    def period_string(self, lang):
        name = u""

        if getattr(self, "start", None) is not None:  # and getattr(self, "end", None) is not None:
            labels = self.getYearLabels(lang)
            approxMarker = self.getApproximateMarkers(lang)

            if lang == "en":
                if getattr(self, "symbol", "") == "CO" or getattr(self, "end", None) is None:
                    name += u" ({}{} {} - )".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[1])
                    return name
                elif int(self.start) == int(self.end):
                    name += u" ({}{} {})".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[1])
                else:
                    name += u" ({}{} {} - {}{} {})".format(
                        approxMarker[0],
                        abs(int(self.start)),
                        labels[0],
                        approxMarker[1],
                        abs(int(self.end)),
                        labels[1])
            if lang == "he":
                if getattr(self, "symbol", "") == "CO" or getattr(self, "end", None) is None:
                    name += u" ({} {} {} - )".format(
                        abs(int(self.start)),
                        labels[1],
                        approxMarker[0])
                    return name
                elif int(self.start) == int(self.end):
                    name += u" ({}{}{})".format(
                        abs(int(self.end)),
                        u" " + labels[1] if labels[1] else u"",
                        u" " + approxMarker[1] if approxMarker[1] else u"")
                else:
                    both_approx = approxMarker[0] and approxMarker[1]
                    if both_approx:
                        name += u" ({}{} - {}{} {})".format(
                            abs(int(self.start)),
                            u" " + labels[0] if labels[0] else u"",
                            abs(int(self.end)),
                            u" " + labels[1] if labels[1] else u"",
                            approxMarker[1]
                        )
                    else:
                        name += u" ({}{}{} - {}{}{})".format(
                            abs(int(self.start)),
                            u" " + labels[0] if labels[0] else u"",
                            u" " + approxMarker[0] if approxMarker[0] else u"",
                            abs(int(self.end)),
                            u" " + labels[1] if labels[1] else u"",
                            u" " + approxMarker[1] if approxMarker[1] else u""
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
        from . import person
        if self.type == "Generation":
            if include_doubles:
                return person.PersonSet({"generation": {"$regex": self.symbol}})
            else:
                return person.PersonSet({"generation": self.symbol})

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


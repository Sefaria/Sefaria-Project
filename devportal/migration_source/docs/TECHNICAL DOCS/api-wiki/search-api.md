---
title: ElasticSearch Proxy API
excerpt: Understand how to use the Sefaria proxy API to query the ElasticSearch API.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: shape-api
      title: Shape API
---
For the simpler version of this API, see [Search API](doc:search-api).

The API endpoint in this article serves as a proxy for the ElasticSearch (ES) API, which can be fairly complicated to use. The search API sends a query to Sefaria's search engine and returns results. Our search engine is built on ElasticSearch, and currently uses version 8.8. You can read the complete documentation of ElasticSearch's API [here](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html).

We expose one endpoint of the ElasticSearch API:`/api/search/:index/\_search`

***

# POST `/api/search/:index/\_search`

The `index` path parameter can be either `text` or `sheet`. Please note that the `index` query parameter is specific to ES. Despite their similar names, the ES `index` parameter is completely unrelated to the Sefaria-specific concept of an `Index`.

**When to Use Specific Query Parameters:**

- `text`: Use this query parameter to query the texts of the Sefaria library. Each document returned represents a segment in our library.

- `sheet`: Use this query parameter to query the user-created Sheets hosted by Sefaria. Each match returns both the `title` and the `content`.  The `title` is the title of the Sheet, while the `content` is a string concatenation of all of the sources and text present on the Sheet.

## Making a POST Request

### The Request's Header

It is important to set the field `Content-Type: application/json` in the header of the POST request when querying the search database.

### The Request's Body

When sending the POST request, the body must be sent in JSON. Below are a few examples of query bodies in JSON:

#### Example 1: Query `text` for Exact Text Results

```
{
   "from":0,  // document offset
   "size":100,  //number of documents to return
   "highlight":{
      "pre_tags":[  // tags to wrap terms that were found
         "<b>"
      ],
      "post_tags":[
         "</b>"
      ],
      "fields":{  // size of the snippet returned, in characters
         "exact":{
            "fragment_size":200
         }
      }
   },
   "sort":[  // fields of the document to use when sorting results. Sorts are applied sequentially.
      {
         "comp_date":{ // Note: comp_date does not exist on source sheets, and should not be used when querying sheet

         }
      },
      {
         "order":{

         }
      }
   ],
   "query":{
      "match_phrase":{
         "exact":{
            "query":"moshe" // The term to query for
         }
      }
   }
}
```

#### Example 2: Query `text` Using Broad Analyzer

Query the text database using the field `sefaria-naive-lemmatizer`. This field parses Hebrew queries using heuristics. Parsing involves converting plural to singular, removing prefixes, and navigating both spellings that include full vocalization (מלא) and those that include partial vocalization (חסר).

```
{
   "size":100,
   "highlight":{
      "pre_tags":[
         "<b>"
      ],
      "post_tags":[
         "</b>"
      ],
      "fields":{
         "naive_lemmatizer":{
            "fragment_size":200
         }
      }
   },
   "sort":[
      {
         "comp_date":{

         }
      },
      {
         "order":{

         }
      }
   ],
   "aggs":{
      "category":{
         "terms":{
            "field":"path",
            "size":10000
         }
      }
   },
   "query":{
      "match_phrase":{
         "naive_lemmatizer":{  //querying the naive_lemmatizer field
            "query":"moshe", // The term to query for
            "slop":10  // maximum distance between terms, in words
         }
      }
   }
}
```

#### Example 3: Query `text` Using Relevance Ranking.

Ranking is based on a variation of the [PageRank](https://en.wikipedia.org/wiki/PageRank) algorithm, which uses our link set along with references cited in Sheets.

```
{
   "size":100,
   "highlight":{
      "pre_tags":[
         "<b>"
      ],
      "post_tags":[
         "</b>"
      ],
      "fields":{
         "naive_lemmatizer":{
            "fragment_size":200
         }
      }
   },
   "query":{
      "function_score":{
         "field_value_factor":{
            "field":"pagesheetrank",  // sort using pre calculated pagesheetrank values
            "missing":0.04
         },
         "query":{
            "match_phrase":{
               "naive_lemmatizer":{
                  "query":"moshe", // The term to query for
                  "slop":10
               }
            }
         }
      }
   }
}
```

#### Example 4: Query `text` for a Specific Book in the Sefaria Library

Using the `filter` field, one can pass an object to `bool` `should` containing a list of regular expressions that should be matched. In the case below, the regular expression was written to filter all results to a path `Mishnah/Seder Zeraim/Mishnah Kilayim`. In this way, the returned documents are limited to segments from `Mishnah Kilayim`.

```
{
   "size":100,
   "highlight":{
      "pre_tags":[
         "<b>"
      ],
      "post_tags":[
         "</b>"
      ],
      "fields":{
         "exact":{
            "fragment_size":200
         }
      }
   },
   "sort":[
      {
         "comp_date":{

         }
      },
      {
         "order":{

         }
      }
   ],
   "query":{
      "bool":{
         "must":{
            "match_phrase":{
               "exact":{
                  "query":"moshe" // The term to query for
               }
            }
         },
         "filter":{
            "bool":{
               "should":[  // include a list of regular expressions that should be matched. In this case, we specify a regex on the `path` field
                  {
                     "regexp":{
                        "path":"Mishnah\\/Seder Zeraim\\/Mishnah Kilayim.*"
                     }
                  }
               ]
            }
         }
      }
   }
}
```

#### Example 5: Query `sheet` for a Specific Term

Unlike the four examples above, all of which query `text`, this type of body is sent when querying `sheet` (i.e. `api/search/sheet/_search`. The primary difference here is that the `sort` field is missing, since those sort parameters don't exist on Sheets.

```
{
   "from":0,  // document offset
   "size":100,  //number of documents to return
   "highlight":{
      "pre_tags":[  // tags to wrap terms that were found
         "<b>"
      ],
      "post_tags":[
         "</b>"
      ],
      "fields":{  // size of the snippet returned, in characters
         "content":{
            "fragment_size":200
         }
      }
   },
   "query":{
      "match_phrase":{
         "content":{
            "query":"moshe" // The term to query for
         }
      }
   }
}
```

## Returned JSON

### Returned JSON for `text` Queries

Below is an example, showing what is returned when querying `text` (i.e., making a POST request to [sefaria.org/api/search/text/\_search](https://www.sefaria.org/api/search/text/_search)).

```
{
    "took": 1,
    "timed_out": false,
    "_shards": {
        "total": 1,
        "successful": 1,
        "skipped": 0,
        "failed": 0
    },
    "hits": {
        "total": {
            "value": 1, // Number of matching results. Any value higher than 10,000 will be represented by 10000
            "relation": "eq" // Either "gte" (great than or equal to)  or "eq" (equal)
        },
        "max_score": 20.01253,
        "hits": [
            {
                "_index": "text-a",
                "_id": "Tribal Lands, Bibliography 25 (Jerusalem, 2019 [en])",
                "_score": 20.01253,
                "_source": {
                    "ref": "Tribal Lands, Bibliography 25",
                    "heRef": "נחלת השבטים, ביבליוגרפיה כ״ה",
                    "version": "Jerusalem, 2019",
                    "lang": "en",
                    "version_priority": 0,
                    "titleVariants": [
                        "Bibliography"
                    ],
                    "categories": [
                        "Tanakh Commentary",
                        "Modern Commentary on Tanakh"
                    ],
                    "order": "A0000060180200025",
                    "path": "Tanakh Commentary/Modern Commentary on Tanakh/Tribal Lands",
                    "pagesheetrank": 1.44,
                    "comp_date": 2013,
                    "exact": ". “Reuben’s Sin with Bilhah in the Testament of Reuben,” David P. Wright, David N. Freedman, and Avi Hurvitz, eds. Pomegranates and Golden Bells .",
                    "naive_lemmatizer": ". “Reuben’s Sin with Bilhah in the Testament of Reuben,” David P. Wright, David N. Freedman, and Avi Hurvitz, eds. Pomegranates and Golden Bells .",
                    "hebrew_version_title": null
                },
                "highlight": {
                    "exact": [
                        "Freedman, and Avi <b>Hurvitz</b>, eds. Pomegranates and Golden Bells ."
                    ]
                }
            }
        ]
    }
}
```

Below is a zoomed-in view of some of the **most critical** fields  within the returned document for a query to `text` or `sheet`. You'll find these fields for each document match, which can be found within the the `hits` field in the `hits` array, under the `_source` field on each returned document:

```
  {
    "path" : "Tanakh/Torah/Genesis",
    "titleVariants" : [ "Genesis", "Beresheet", "Bereshit", "Bereishis", "Gen.", "Ber", "Bereshith", "Breishit", "Bereishit", "Ber.", "Gen" ],
    "exact" : "In the beginning God created the heavens and the earth.",
    "comp_date" : -1400,
    "categories" : [ "Tanakh", "Torah" ],
    "lang" : "en",
    "pagesheetrank" : 190762.7589503033,
    "title" : "Genesis Chapter 1 Verse 1 (Jewish English Torah)",
    "heRef" : "בראשית א׳:א׳",
    "version" : "Jewish English Torah",
    "naive_lemmatizer" : "In the beginning God created the heavens and the earth.",
    "ref" : "Genesis 1:1",
    "version_priority" : 0,
     "order" : "A00000000010001"
   }
```

**The Definitions of the Most Critical Fields:**

- `exact`: This field holds content from a Sefaria segment. It is indexed by the `standard` analyzer. You can read more about analyzers [here](https://www.elastic.co/guide/en/elasticsearch/reference/current/analyzer.html).
- `naive_lemmatizer`: This field holds content from a Sefaria segment. It is indexed by the `sefaria-naive-lemmatizer` analyzer. This analyzer does basic lemmatization for Hebrew inputs.
- `ref`: This field refers to the Sefaria reference
- `lang`: This field refers to the language of the content in question.

### Returned JSON for `sheet` Queries

In the JSON returned for queries to `sheet` (i.e.`api/search/sheet/_search`),  the `content` returned is not a segment of matching text, but rather **the entire contents of the Sheet** concatenated into a single string. See the below example for clarification:

```
{
    "took": 287,
    "timed_out": false,
    "_shards": {
        "total": 1,
        "successful": 1,
        "skipped": 0,
        "failed": 0
    },
    "hits": {
        "total": {
            "value": 1,
            "relation": "eq"
        },
        "max_score": 13.704756,
        "hits": [
            {
                "_index": "sheet-a",
                "_id": "234271",
                "_score": 5.3384743,
                "_source": {
                    "title": "Heal Her Please: Miriam, Illness and Isolation",
                    "content": "Heal Her Please: Miriam, Illness and Isolation\n\nWhy was Miriam stricken with illness in the desert, and why must she stay alone at the edge of the camp? Through close reading, we'll view Miriam's life through the lens of isolation and togetherness, separation and yearning. Is it possible to find God in a time of isolation?\nBy: Jessica Spencer\n Exodus 2:1-4   (1)  A certain man of the house of Levi went and married a Levite woman.   (2)  The woman conceived and bore a son; and when she saw how beautiful he was, she hid him for three months.   (3)  When she could hide him no longer, she got a wicker basket for him and caulked it with bitumen and pitch. She put the child into it and placed it among the reeds by the bank of the Nile.   (4)  And his sister stationed herself at a distance, to learn what would befall him. (א)  וַיֵּ֥לֶךְ אִ֖ישׁ מִבֵּ֣ית לֵוִ֑י וַיִּקַּ֖ח אֶת־בַּת־לֵוִֽי׃   (ב)  וַתַּ֥הַר הָאִשָּׁ֖ה וַתֵּ֣לֶד בֵּ֑ן וַתֵּ֤רֶא אֹתוֹ֙ כִּי־ט֣וֹב ה֔וּא וַֽתִּצְפְּנֵ֖הוּ שְׁלֹשָׁ֥ה יְרָחִֽים׃   (ג)  וְלֹא־יָכְלָ֣ה עוֹד֮ הַצְּפִינוֹ֒ וַתִּֽקַּֽח־לוֹ֙ תֵּ֣בַת גֹּ֔מֶא וַתַּחְמְרָ֥ה בַחֵמָ֖ר וּבַזָּ֑פֶת וַתָּ֤שֶׂם בָּהּ֙ אֶת־הַיֶּ֔לֶד וַתָּ֥שֶׂם בַּסּ֖וּף עַל־שְׂפַ֥ת הַיְאֹֽר׃   (ד)  וַתֵּתַצַּ֥ב אֲחֹת֖וֹ מֵרָחֹ֑ק לְדֵעָ֕ה מַה־יֵּעָשֶׂ֖ה לֽוֹ׃  Sotah 12a:9-12   “And there went a man of the house of Levi ”: t o where did he go? Rav Yehuda bar Zevina says: He went according to the advice of his daughter  Miriam.   A Sage  teaches: Amram,  the father of Moses,  was the great man of his generation. Once he saw that the wicked Pharaoh said: “Every son that is born you shall cast into the river,  and every daughter you shall save alive” (Exodus 1:22),  he said: We are laboring for nothing  by bringing children into the world to be killed. Therefore,  he arose and divorced his wife. All   arose and divorced their wives.   His daughter,  Miriam,  said to him: Father, your decree is more harsh   than that of Pharaoh, as Pharaoh decreed only with regard to the males, but you decreed   on the males and on the females.  And now no children will be born. Additionally,  Pharaoh decreed  to kill them  only in this world, but you  decreed  in this world and in the World-to-Come,  as those not born will not enter the World-to-Come.   Miriam continued: Additionally, concerning  Pharaoh the wicked,  it is  uncertain  whether  his decree  will be  fulfilled,  and it is  uncertain  if his decree will  not  be  fulfilled. You are a righteous person,  and as such,  your decrees  will  certainly  be  fulfilled, as it is stated  with regard to the righteous:  “You shall also decree a thing, and it shall be established unto you”  (Job 22:28). Amram accepted his daughter’s words and  arose and brought back,  i.e., remarried,  his wife,  and  all   arose and brought back their wives. (שמות ב, א) וילך איש מבית לוי  להיכן הלך  אמר רב יהודה בר זבינא  שהלך בעצת בתו    תנא  עמרם גדול הדור היה כיון (שראה שאמר) פרעה הרשע כל הבן הילוד היאורה תשליכוהו אמר  לשוא אנו עמלין עמד וגירש את אשתו  עמדו כולן וגירשו את נשותיהן    אמרה לו בתו  אבא קשה גזירתך יותר משל פרעה  שפרעה לא גזר אלא על הזכרים ואתה גזרת על הזכרים ועל הנקיבות פרעה לא גזר אלא בעוה\"ז ואתה בעוה\"ז ולעוה\"ב   פרעה הרשע ספק מתקיימת גזירתו ספק אינה מתקיימת אתה צדיק בודאי שגזירתך מתקיימת שנאמר (איוב כב, כח) ותגזר אומר ויקם לך  עמד והחזיר את אשתו עמדו כולן והחזירו את נשותיהן  Megillah 14a:14-15   Miriam  was a prophetess,  as it is written :  “And Miriam the prophetess, the sister of Aaron, took  a timbrel in her hand” (Exodus 15:20). Was she the sister only of Aaron,  and not the sister of Moses?  Why does the verse mention only one of her brothers?  Rav Naḥman said  that  Rav said: For she prophesied when she was the sister of Aaron,  i.e., she prophesied since her youth, even before Moses was born,  and she would say: My mother is destined to bear a son who will deliver the Jewish people  to salvation.  And at the time when  Moses  was born the entire house was filled with light,  and  her father stood and kissed her on the head,  and  said to her: My daughter, your prophecy has been fulfilled.   But once  Moses  was cast into the river, her father arose and rapped her on the head, saying to her: My daughter, where is your prophecy  now, as it looked as though the young Moses would soon meet his end.  This is  the meaning of  that  which  is written  with regard to Miriam’s watching Moses in the river:  “And his sister stood at a distance to know  what would be done to him”  ( Exodus 2:4), i.e.,  to know what would be with the end of her prophecy,  as she had prophesied that her brother was destined to be the saviour of the Jewish people. מרים דכתיב (שמות טו, כ) ותקח מרים הנביאה אחות אהרן ולא אחות משה אמר ר\"נ אמר רב שהיתה מתנבאה כשהיא אחות אהרן ואומרת עתידה אמי שתלד בן שיושיע את ישראל ובשעה שנולד נתמלא כל הבית כולו אורה עמד אביה ונשקה על ראשה אמר לה בתי נתקיימה נבואתיך   וכיון שהשליכוהו ליאור עמד אביה וטפחה על ראשה ואמר לה בתי היכן נבואתיך היינו דכתיב (שמות ב, ד) ותתצב אחותו מרחוק לדעה לדעת מה יהא בסוף נבואתה  Sotah 12a:2-6   I Chronicles 2:18 refers to the wife of Caleb by the name  Azubah.  The Sages teach that  this  is  Miriam. And why is she called Azubah? As everyone initially abandoned her [ azavuha ] ...   The same verse refers to Miriam additionally as  Jerioth,   for her face was like  extremely pallid  curtains [ yeriot ] ...   The phrase in the verse  “had two wives”  actually means it is as if  Miriam became like two wives,  because she changed over the course of time. And therefore the two names written in the verse:  “Helah and Naarah,” were not  two separate women,  Helah and Naarah. Rather, initially  Miriam was  sickly [ ḥela ] ,  and ultimately  she was healthy and beautiful like  a young woman [ na’ara ]. עזובה זו מרים ולמה נקרא שמה עזובה שהכל עזבוה מתחילתה...   יריעות שהיו פניה דומין ליריעות    ואלה בניה אל תקרי בניה אלא בוניה ישר שישר את עצמו שובב ששיבב את יצרו וארדון שרדה את יצרו ואיכא דאמרי על שהיו פניה דומין לורד    (דברי הימים א ד, ה)...    היו שתי נשים נעשה מרים כשתי נשים חלאה ונערה לא חלאה ונערה הואי אלא בתחילה חלאה ולבסוף נערה  Numbers 12:1-15   (1)  Miriam and Aaron spoke against Moses because of the Cushite woman he had married: “He married a Cushite woman!”   (2)  They said, “Has God spoken only through Moses? Has God not spoken through us as well?” God heard it.   (3)  Now Moses was a very humble man, more so than any other man on earth.   (4)  Suddenly God called to Moses, Aaron, and Miriam, “Come out, you three, to the Tent of Meeting.” So the three of them went out.   (5)  God came down in a pillar of cloud, stopped at the entrance of the Tent, and called out, “Aaron and Miriam!” The two of them came forward;   (6)  and God said, “Hear these My words: When a prophet of God arises among you, I make Myself known to him in a vision, I speak with him in a dream.   (7)  Not so with My servant Moses; he is trusted throughout My household.   (8)  With him I speak mouth to mouth, plainly and not in riddles, and he beholds the likeness of God. How then did you not shrink from speaking against My servant Moses!”   (9)  Still incensed with them, God departed.   (10)  As the cloud withdrew from the Tent, there was Miriam stricken with snow-white scales! When Aaron turned toward Miriam, he saw that she was stricken with scales.   (11)  And Aaron said to Moses, “O my lord, account not to us the sin which we committed in our folly.   (12)  Let her not be as one dead, who emerges from his mother’s womb with half his flesh eaten away.”   (13)  So Moses cried out to God, saying, “God, please, heal her please!”   (14)  But God said to Moses, “If her father spat in her face, would she not bear her shame for seven days? Let her be shut out of camp for seven days, and then let her be readmitted.”   (15)  So Miriam was shut out of camp seven days; and the people did not march on until Miriam was readmitted. (א)  וַתְּדַבֵּ֨ר מִרְיָ֤ם וְאַהֲרֹן֙ בְּמֹשֶׁ֔ה עַל־אֹד֛וֹת הָאִשָּׁ֥ה הַכֻּשִׁ֖ית אֲשֶׁ֣ר לָקָ֑ח כִּֽי־אִשָּׁ֥ה כֻשִׁ֖ית לָקָֽח׃   (ב)  וַיֹּאמְר֗וּ הֲרַ֤ק אַךְ־בְּמֹשֶׁה֙ דִּבֶּ֣ר ה' הֲלֹ֖א גַּם־בָּ֣נוּ דִבֵּ֑ר וַיִּשְׁמַ֖ע ה'׃   (ג)  וְהָאִ֥ישׁ מֹשֶׁ֖ה ענו [עָנָ֣יו] מְאֹ֑ד מִכֹּל֙ הָֽאָדָ֔ם אֲשֶׁ֖ר עַל־פְּנֵ֥י הָאֲדָמָֽה׃ (ס)   (ד)  וַיֹּ֨אמֶר ה' פִּתְאֹ֗ם אֶל־מֹשֶׁ֤ה וְאֶֽל־אַהֲרֹן֙ וְאֶל־מִרְיָ֔ם צְא֥וּ שְׁלָשְׁתְּכֶ֖ם אֶל־אֹ֣הֶל מוֹעֵ֑ד וַיֵּצְא֖וּ שְׁלָשְׁתָּֽם׃   (ה)  וַיֵּ֤רֶד ה' בְּעַמּ֣וּד עָנָ֔ן וַֽיַּעֲמֹ֖ד פֶּ֣תַח הָאֹ֑הֶל וַיִּקְרָא֙ אַהֲרֹ֣ן וּמִרְיָ֔ם וַיֵּצְא֖וּ שְׁנֵיהֶֽם׃   (ו)  וַיֹּ֖אמֶר שִׁמְעוּ־נָ֣א דְבָרָ֑י אִם־יִֽהְיֶה֙ נְבִ֣יאֲכֶ֔ם ה' בַּמַּרְאָה֙ אֵלָ֣יו אֶתְוַדָּ֔ע בַּחֲל֖וֹם אֲדַבֶּר־בּֽוֹ׃   (ז)  לֹא־כֵ֖ן עַבְדִּ֣י מֹשֶׁ֑ה בְּכָל־בֵּיתִ֖י נֶאֱמָ֥ן הֽוּא׃   (ח)  פֶּ֣ה אֶל־פֶּ֞ה אֲדַבֶּר־בּ֗וֹ וּמַרְאֶה֙ וְלֹ֣א בְחִידֹ֔ת וּתְמֻנַ֥ת ה' יַבִּ֑יט וּמַדּ֙וּעַ֙ לֹ֣א יְרֵאתֶ֔ם לְדַבֵּ֖ר בְּעַבְדִּ֥י בְמֹשֶֽׁה׃   (ט)  וַיִּֽחַר אַ֧ף ה' בָּ֖ם וַיֵּלַֽךְ׃   (י)  וְהֶעָנָ֗ן סָ֚ר מֵעַ֣ל הָאֹ֔הֶל וְהִנֵּ֥ה מִרְיָ֖ם מְצֹרַ֣עַת כַּשָּׁ֑לֶג וַיִּ֧פֶן אַהֲרֹ֛ן אֶל־מִרְיָ֖ם וְהִנֵּ֥ה מְצֹרָֽעַת׃   (יא)  וַיֹּ֥אמֶר אַהֲרֹ֖ן אֶל־מֹשֶׁ֑ה בִּ֣י אֲדֹנִ֔י אַל־נָ֨א תָשֵׁ֤ת עָלֵ֙ינוּ֙ חַטָּ֔את אֲשֶׁ֥ר נוֹאַ֖לְנוּ וַאֲשֶׁ֥ר חָטָֽאנוּ׃   (יב)  אַל־נָ֥א תְהִ֖י כַּמֵּ֑ת אֲשֶׁ֤ר בְּצֵאתוֹ֙ מֵרֶ֣חֶם אִמּ֔וֹ וַיֵּאָכֵ֖ל חֲצִ֥י בְשָׂרֽוֹ׃   (יג)  וַיִּצְעַ֣ק מֹשֶׁ֔ה אֶל־ה' לֵאמֹ֑ר אֵ֕ל נָ֛א רְפָ֥א נָ֖א לָֽהּ׃ (פ)   (יד)  וַיֹּ֨אמֶר ה' אֶל־מֹשֶׁ֗ה וְאָבִ֙יהָ֙ יָרֹ֤ק יָרַק֙ בְּפָנֶ֔יהָ הֲלֹ֥א תִכָּלֵ֖ם שִׁבְעַ֣ת יָמִ֑ים תִּסָּגֵ֞ר שִׁבְעַ֤ת יָמִים֙ מִח֣וּץ לַֽמַּחֲנֶ֔ה וְאַחַ֖ר תֵּאָסֵֽף׃   (טו)  וַתִּסָּגֵ֥ר מִרְיָ֛ם מִח֥וּץ לַֽמַּחֲנֶ֖ה שִׁבְעַ֣ת יָמִ֑ים וְהָעָם֙ לֹ֣א נָסַ֔ע עַד־הֵאָסֵ֖ף מִרְיָֽם׃  Onkelos Numbers 12:10   סְגִירָת:  locked up, isolated וַעֲנָנָא אִסְתַּלַּק מֵעִלָּוֵי מַשְׁכְּנָא וְהָא מִרְיָם חַוְּרָא כְּתַלְגָּא וְאִתְפְּנִי אַהֲרֹן לְוָת מִרְיָם וְהָא  סְגִירָת :  Rashi on Numbers 12:12:3   אשר בצאתו מרחם אמו It ought to have stated “אמנו” “of our mother’s womb”, only that Scripture modified the expression. Similarly חצי בשרו — it ought to have said חצי בשרנו “the half of our flesh is consumed”, only that Scripture modified the expression (Scripture uses these expressions with the suffix of the third person singular instead of the first person plural, because it wishes to avoid an ominous expression referring to Aaron and Moses). — The meaning is: Since she came forth from the womb of our own mother she in her present state is to us as though the half of our flesh were consumed. It is the same idea as is expressed in the words, (Genesis 37:27) “for he is our brother, our own flesh” (Sifrei Bamidbar 105). — And even according to what the text literally implies (without assuming any modification) it appears to have that meaning: \"It is not right for a brother to allow his sister to remain as a dead person\". אשר בצאתו מרחם אמו.  אִמֵּנוּ הָיָה לוֹ לוֹמַר, אֶלָּא שֶׁכִּנָּה הַכָּתוּב, וְכֵן חֲצִי בְשָׂרוֹ, חֲצִי בְשָׂרֵנוּ הָיָה לוֹ לוֹמַר, אֶלָּא שֶׁכִּנָּה הַכָּתוּב, מֵאַחַר שֶׁיָּצְתָה מֵרֶחֶם אִמֵּנוּ, הִיא לָנוּ כְּאִלּוּ נֶאֱכַל חֲצִי בְשָׂרֵנוּ, כָּעִנְיָן שֶׁנֶּאֱמַר \"כִּי אָחִינוּ בְשָׂרֵנוּ הוּא\" (בראשית ל\"ז), וּלְפִי מַשְׁמָעוֹ, אַף הוּא נִרְאֶה כֵן, אֵין רָאוּי לְאָח לְהַנִּיחַ אֶת אֲחוֹתוֹ לִהְיוֹת כַּמֵּת:  Sforno on Numbers 12:13   (1)  א-ל נא רפא נא לה, he was pleading that Miriam should be healed immediately and not be subjected to the shame of having to leave the camp. (א)   אל נא רפא נא לה  בבקשה אני שואל שתרפא עתה לה ולא נצטרך לביישה להוציאה חוץ למחנה:  Sotah 9b:8   The mishna continues:  And the same  is so  with regard to the  reward of  good  deeds; a person is rewarded measure for measure.  Miriam waited for  the baby  Moses  for  one hour  at the shore of the Nile,  as it is stated: “And his sister stood afar off,  to know what would be done to him” (Exodus 2:4).  Therefore the Jewish people delayed  their travels in the desert for  seven days  to wait  for her  when she was smitten with leprosy,  as it is stated:  “And Miriam was confined outside of the camp seven days;  and the people journeyed not until Miriam was brought in again”  (Numbers 12:15). וכן לענין הטובה  מרים המתינה למשה שעה אחת שנאמר (שמות ב, ד) ותתצב אחותו מרחוק לפיכך נתעכבו לה ישראל ז' ימים במדבר שנאמר (במדבר יב, טו) והעם לא נסע עד האסף מרים  Midrash Tanchuma, Tzav 13:1   And so [too,] do you find with Miriam, as it is stated, \"Go out, the three of you\" (Numbers 12:4). There was no need for Moshe to go out, as he did not say anything to [Aharon]. Rather it was so that he would be available to pray for Miriam, [in order] to heal her. \"And He called Aharon and Miriam\" (Numbers 12:5) - why did He call them and leave Moshe. As we [only] say part of a person's praise in front of them, but all of it not in front of him. And so [too,] do we find with Noach. Not in front of him, [God] said, \"A perfectly righteous man\" (Genesis 6:9); but in front of him, He said, \"as I have seen you to be righteous in front of Me\" (Genesis 7:1). Another interpretation of [why Moshe was not called]: So that he not hear the redressing of Aharon. He said, \"Hear  nah  My words\" (Numbers 12:6) -  nah  is always an expression of pleading - \"if you have a prophet of God, I will make Myself known to him though a vision to him\" - My Divine Presence will not be revealed to him through a clear lens, but rather through a dream or a trance.\" And why [were they disciplined]? Because they spoke [badly] about Moshe, as it is stated (Numbers 12:6), \"And Miriam and Aharon spoke ( tedaber ) about Moshe.\" And  dibbur  is only a harsh expression in each place.\" And so it states (Genesis 42:30), \"The man, the master of the land spoke ( deeber ) harsh things to us.\" [Whereas]  ameera  is only an expression of supplication. And so it states (Genesis 19:7), \"And He said ( vayomer ), 'Do not act evilly, my brothers.'\" \"And He said, 'Hear  nah  My words'\" (Numbers 12:6) - all  nah  is an expression of pleading. And why did it say Miriam first and Aharon afterwards? However it was because she started first, and therefore the verse mentioned her first. And what did they say? \"But was it only to Moshe that God spoke?\" (Numbers 12:2) That is to say did He only speak to Moshe, that he separated from his wife? \"Did he not also speak to us?\" (Numbers 12:2) In the same way did He speak to us and we have not separated from the way of the world (marital relations).  And how did Miriam know that Moshe separated from the woman? Rabbi Natan said, \"Miriam was alongside Tsipporah when they said to Moshe, 'Eldad and Meidad are prophesying in the camp' (Numbers 11:27); and when Tsipporah heard, she said, 'Woe to the wives of these [men]!' And from what time did Moshe separate? In fact, when the Holy One, blessed be He, said to Moshe at Sinai before the giving of the Torah that he should sanctify the people, and say to them, 'for three days do not come close to a woman' (Exodus 19:15). They [then] separated from their wives and Moshe separated from his wife. And after the giving of the Torah, the Holy One, blessed be He, said to him, 'Go tell them, \"You return to your tents,\" but you stay here with me' (Deuteronomy 5:27-28) - and do not go back to the way of the world. And [so Miriam knew] when Tsipporah said, 'Woe to the wives of these - they are called to prophecy [and] will be separating from their wives just like my husband separated from me.' And from then, Miriam knew and told Aharon.  And if Miriam who did not have intention to disgrace Moshe was punished, all the more so with one who recounts the disgrace of his fellow with evil speech, will that person be punished with  tsaraat .\" \"As he took a Cushite (Ethopian) woman\" (Numbers 12:1) - the numerical value of Cushite is [equal to that of] beautiful looks. The tally of this one is like the tally for that one. \"The Cushite woman\" tells [us] that everybody concedes about her beauty, in the same way as everyone speaks about the blackness of a Cushite. \"About the matter of the woman\" (Numbers 12:1) - about the matter of her divorce. \"As he took a Cushite woman\" (Numbers 12:1) - what do we learn to say [from here]? Rather, there is a woman who is pleasant in her looks but unpleasant in her deeds, or pleasant in her deeds but unpleasant in her looks, but this one was pleasant in everything. And now he divorced her? And she is called a Cushite because of her pleasantness; in the same way as a man will call his pleasant son, Cushite, so that the [evil] eye not [come to] overpower him. \"And the man Moshe was very humble ( anav )\" (Numbers 12:3) - humble, [meaning] lowly and patient. Another interpretation: \"Very  anav \" is from the expression of answering ( oneh ), meaning to say that if he had heard these words, he would have known to answer and respond with appropriate arguments. \"And the Lord said suddenly\" (Numbers 12:4) - when he revealed Himself to them suddenly and they were impure [as a result of] sex, they yelled out, \"Water, water.\" [This was] to show that Moshe acted properly when he separated from his wife, since the Divine Presence was constantly revealed to him, and there was no set time for speaking [with God]. And so did He say to them, \"I speak to him face to face\" (Numbers 12:8) - face to face did I tell him to separate from the woman - \"and a (clear) vision and not with riddles\" - and this vision is a vision of speech. And perhaps it is a vision of the Divine Presence? [Hence] we learn to say (Exodus 33:20), \"You are not able to see My face.\" And if you ask, \"Behold, it is written (Numbers 12:8), 'and he sees the picture of the Lord?'\" [The answer is] that is a vision 'from the back,' like the matter that is stated (Exodus 33:23), \"and you shall see My back.\" \"Why were you not afraid to to speak about My servant, about Moshe?\" (Numbers 12:8) It does not state, \"about My servant, Moshe,\" but rather \"about My servant, about Moshe.\" [This is] meaning to say, about My servant, even if it is not Moshe; and about Moshe, even if he is not My servant - it would be worthwhile to be afraid in front of him. And all the more so, since he is My servant, and the servant of a king is [like] the king. And you should have said, \"The King does not love him for nothing.\" And if you say that [the King] does not know about [Moshe's] deeds, that is more grievous than the first [mistake of not associating him with the King]! \"And the Lord waxed angry at them and left\" (Numbers 12:9) - teaches that [only] after He let them know their foulness did He proclaim their excommunication. All the more so with flesh and blood, should a person not get angry with his fellow until after he makes [the other's] foulness known to him. \"And the cloud left the tent\" - and afterwards - and behold, Miriam was inflicted with  tsaraat  like snow\" (Numbers 12:10). There is a [relevant] parable about a king who said to [his son's] pedagogue, \"Strike my child, but do not strike him until I go away from you, as my mercy is upon him.\" \"Please do not place the sin upon us that we sinned and that we blundered. Let her not be like a dead\" (Numbers 12:11-12) - just like a dead body transmits impurity through intercourse, so does a  metsora  transmit impurity through intercourse. \"About which upon its exit from its mother's womb\" (Numbers 12:12) - it should have stated, \"from our mother's womb,\" but so did Scripture phrase it. And so [too, instead of] \"half of its flesh,\" it should have stated, \"half of our flesh.\" But according to its understanding, it appears to me thus: It is not fitting to leave our sister to be like the dead. Since she exited the womb of the mother of this one (Moshe) that has it in his ability to help, and [yet] doesn't help, behold half of his flesh will be eaten away - as [Aharon's] brother is his flesh. Another interpretation: \"Let her not be like the dead\" - if you do not heal her with prayer, who will quarantine her, and who will render her impure? As it is impossible for me to observe her, since I am a relative - and a relative may not examine scabs - and there is no other priest in the world. This is [the meaning of] that which is stated, \"about which upon its exit from its mother's womb.\" \"God, please, heal her please\" (Numbers 12:12) - the verse came to teach you the way of the world (manners), such that one requesting a thing must first say two or three words of supplication, and then make his requests afterwards. \"Saying\" - what do we learn to say [from here]? [Moshe] said to Him, \"Answer me if You will heal her or not,\" so that He answered him, \"And if her father spit in her face [...]\" (Numbers 12:14). And why did Moshe not prolong this prayer? So that Israel not say, \"His sister is given over to distress and he prolongs his prayer?\" \"Let her be quarantined for seven days and afterwards she will be gathered\" (Numbers 12:14) - and I say that all expressions of gathering that exist with a  metsora  are because he is sent out from the camps. And when he is healed, he is gathered to the camp; [and] all gathering is an expressions of bringing in. \"And the people did not travel until Miriam was gathered\" (Numbers 12:15) - the Omnipresent awarded her this honor for the sake of one hour that she delayed for Moshe, when he was sent out to the Nile, as it is stated (Exodus 2:4), \"And his sister stood from a distance.\" She delayed for an hour and all of Israel delayed for her sake for seven days. [The comparison that the Torah nonetheless makes between Miriam when she is struck by  tsaraat  and a dead body shows that] a  metsora  is considered like dead. וְכֵן אַתָּה מוֹצֵא בְּמִרְיָם, שֶׁנֶּאֱמַר: צְאוּ שְׁלָשְׁתְּכֶם  (במדבר יב, ד) . לֹא הָיָה צָרִיךְ מֹשֶׁה לָצֵאת, שֶׁלֹּא דִּבֵּר עִמּוֹ כְּלוּם, אֶלָּא כְּדֵי שֶׁיְּהֵא מְזֻמָּן לְהִתְפַּלֵּל עַל מִרְיָם לְרַפֵּא אוֹתָהּ. וַיִּקְרָא אַהֲרֹן וּמִרְיָם  (במדבר יב, ה) . לָמָּה קְרָאָם וְעָזַב לְמֹשֶׁה. לְפִי שֶׁאוֹמְרִים מִקְצָת שִׁבְחוֹ שֶׁל אָדָם בְּפָנָיו, וְכֻלּוֹ שֶׁלֹּא בְּפָנָיו. וְכֵן מָצִינוּ בְּנֹחַ, שֶׁלֹּא בְּפָנָיו, אָמַר, אִישׁ צַדִּיק תָּמִים  (בראשית ו, ט) . וּבְפָנָיו אָמַר, כִּי אוֹתְךָ רָאִיתִי צַדִּיק לְפָנַי  (שם ז, א) . דָּבָר אַחֵר, שֶׁלֹּא יִשְׁמַע בִּנְזִיפָתוֹ שֶׁל אַהֲרֹן. אָמַר, שִׁמְעוּ נָא דְבָרָי  (במדבר יב, ו) . אֵין נָא אֶלָּא לְשׁוֹן בַּקָּשָׁה. אִם יִהְיֶה נְבִיאֲכֶם, ה', בַּמַּרְאָה אֵלָיו אֶתְוַדָּע  (במדבר יב, ו) , שְׁכִינָתִי אֵין נִגְלֶה עָלָיו בְּאַסְפַּקְלַרְיָא מְאִירָה, אֶלָּא בַּחֲלוֹם וְחִזָּיוֹן. וְלָמָּה, אֶלָּא שֶׁדִּבְּרוּ בְּמֹשֶׁה, שֶׁנֶּאֱמַר: וַתְּדַבֵּר מִרְיָם וְאַהֲרֹן בְּמֹשֶׁה  (במדבר יב, א) , וְאֵין דִּבּוּר בְּכָל מָקוֹם אֶלָּא לָשׁוֹן קָשָׁה. וְכֵן הוּא אוֹמֵר, דִּבֵּר הָאִישׁ אדושם הָאָרֶץ אִתָּנוּ קָשׁוֹת  (בראשית מב, ל) . וְאֵין אֲמִירָה אֶלָּא תַּחֲנוּנִים. וְכֵן הוּא אוֹמֵר, וַיֹּאמֶר אַל נָא אָחַי תָּרֵעוּ  (שם יט, ז) . וַיֹּאמֶר שִׁמְעוּ נָא דְּבָרַי, כָּל נָא לְשׁוֹן בַּקָּשָׁה. וְלָמָּה אָמַר תְּחִלָּה מִרְיָם וְאַחַר כָּךְ אַהֲרֹן. אֶלָּא שֶׁהִיא פָּתְחָה בַּדָּבָר תְּחִלָּה, וּלְפִיכָךְ הִקְדִּימָהּ הַכָּתוּב. וּמָה אָמְרוּ, הֲרַק אַךְ בְּמֹשֶׁה דִּבֵּר ה'  (במדבר יב, ב) , כְּלוֹמַר, בְּמֹשֶׁה דִּבֵּר ה' לְבַדּוֹ, שֶׁפָּרַשׁ מֵאִשְׁתּוֹ. הֲלֹא גַּם בָּנוּ דִּבֵּר  (שם) , כְּמוֹ כֵן דִּבֵּר עִמָּנוּ וְלֹא פָּרַשְׁנוּ מִדֶּרֶךְ אֶרֶץ.  וּמִנַּיִן הָיְתָה יוֹדַעַת מִרְיָם שֶׁפָּרַשׁ מֹשֶׁה מִן הָאִשָּׁה. רַבִּי נָתַן אוֹמֵר, מִרְיָם הָיְתָה בְּצַד צִפּוֹרָהּ כְּשֶׁאָמְרוּ לְמֹשֶׁה אֶלְדָּד וּמֵידָד מִתְנַבְּאִים בַּמַּחֲנֶה  (שם יא, כז) . וְכֵיוָן שֶׁשָּׁמְעָה צִפּוֹרָהּ, אָמְרָה, אוֹי לָהֶם לִנְשׁוֹתֵיהֶם שֶׁל אֵלּוּ. וּמֵאֵיזֶה זְמַן פָּרַשׁ מֹשֶׁה מִדֶּרֶךְ אֶרֶץ, אֶלָּא בְּשָׁעָה שֶׁאָמַר הַקָּדוֹשׁ בָּרוּךְ הוּא לְמֹשֶׁה בְּסִינַי קֹדֶם מַתַּן תּוֹרָה שֶׁיְּקַדֵּשׁ אֶת הָעָם וְאָמַר לָהֶם: לִשְׁלֹשֶת יָמִים אֶל תִּגְּשׁוּ אֶל אִשָּׁה  (שמות יט, טו) , פָּרְשׁוּ הֵם מִנְּשׁוֹתֵיהֶם וּפָרַשׁ מֹשֶׁה מֵאִשְׁתּוֹ. וְאַחַר מַתַּן תּוֹרָהּ אָמַר לֵיהּ הַקָּדוֹשׁ בָּרוּךְ הוּא, לֵךְ אֱמֹר לָהֶם, שׁוּבוּ לָכֶם לְאָהֳלֵיכֶם, וְאַתָּה פֹּה עֲמֹד עִמָּדִי  (דברים ה, ל-לא) , וְאַל תָּשׁוּב לְדֶרֶךְ אֶרֶץ. וּכְשֶׁאָמְרָה צִפּוֹרָהּ אוֹי לִנְשׁוֹתֵיהֶן שֶׁל אֵלּוּ, הֵן נִזְקָקִין לִנְבוּאָה שֶׁיְּהוּ פּוֹרְשִׁין מִנְּשׁוֹתֵיהֶם כְּמוֹ שֶׁפָּרַשׁ בַּעֲלֵי הֵימֶנִּי. וּמִשָּׁם יָדְעָה מִרְיָם וְהִגִּידָה לְאַהֲרֹן.  וּמַה מִּרְיָם שֶׁלֹּא נִתְכַּוְּנָה לִגְנוּתוֹ שֶׁל מֹשֶׁה, נֶעֶנְשָׁה. קַל וָחֹמֶר לַמְסַפֵּר בִּגְנוּתוֹ שֶׁל חֲבֵרוֹ וּבְלָשׁוֹן הָרַע, יִלְקֶה הָאָדָם בְּצָרַעַת. כִּי אִשָּׁה כֻשִׁית לָקַח  (במדבר יב, א) . כּוּשִׁית בְּגִימַטְרִיָּא יְפַת מַרְאֶה, חֶשְׁבּוֹנוֹ שֶׁל זֶה כְּחֶשְׁבּוֹנוֹ שֶׁל זֶה. הָאִשָּׁה הַכֻּשִׁית, מַגִּיד, שֶׁהַכֹּל מוֹדִים בְּיָפְיָהּ, כְּשֵׁם שֶׁהַכֹּל דּוֹבְרִים בְּשַׁחֲרוּתוֹ שֶׁל כּוּשִׁי. עַל אֹדוֹת הָאִשָּׁה  (שם) , עַל אֹדוֹת גֵּרוּשֶׁיהָ. כִּי אִשָּׁה כֻשִׁית לָקַח, מַה תַּלְמוּד לוֹמַר. אֶלָּא יֵשׁ לְךָ אִשָּׁה נָאָה בְּיָפְיָהּ וְאֵינָהּ נָאָה בְּמַעֲשֶׂיהָ, אוֹ נָאָה בְּמַעֲשֶׂיהָ וְאֵין נָאָה בְּיָפְיָהּ, וְזוֹ נָאָה בַּכֹּל, וְעַתָּה גֵּרְשָׁהּ. וְעַל שֵׁם נוֹיָהּ נִקְרֵאת כּוּשִׁית, כְּאָדָם הַקּוֹרֵא לִבְנוֹ נָאֶה, כּוּשִׁי, כְּדֵי שֶׁלֹּא תִּשְׁלֹט בּוֹ הָעַיִן וְהָאִישׁ מֹשֶׁה עָנָו מְאֹד  (במדבר יב, ג) . עָנָו, שָׁפָל וְסַבְלָן. דָּבָר אַחֵר, עָנָו מְאֹד, מִלְּשׁוֹן עוֹנֶה. כְּלוֹמַר, שֶׁאִם הָיָה שׁוֹמֵעַ אֵלּוּ הַדְּבָרִים יוֹדֵעַ הָיָה לַעֲנוֹת וּלְהָשִׁיב טְעָנוֹת כְּנֶגְדָן. וַיֹּאמֶר ה' פִּתְאֹם  (במדבר יב, ד) . שֶׁנִּגְלָה עִמָּהֶם פִּתְאֹם, וְהֵם טְמֵאִים בְּדֶרֶךְ אֶרֶץ וְהָיוּ צוֹעֲקִים מַיִם מַיִם, לְהוֹדִיעָם שֶׁיָּפֶה עָשָׂה מֹשֶׁה שֶׁפָּרַשׁ מֵאִשְׁתּוֹ, אַחַר שֶׁנִּגְלֵית שְׁכִינָה עָלָיו תָּדִיר וְאֵין עֵת קָבוּעַ לַדִּבּוּר. וְכֵן אָמַר לָהֶם: פֶּה אֶל פֶּה אֶדָּבֵר בּוֹ  (במדבר יב, ח) , פֶּה אֶל פֶּה אָמַרְתִּי לוֹ לִפְרֹשׁ מִן הָאִשָּׁה. וּמַרְאֶה וְלֹא בְחִידוֹת  (במדבר יב, ח) , וּמַרְאֶה זוֹ מַרְאֶה הַדִּבּוּר. יָכֹל מַרְאֶה הַשְּׁכִינָה. תַּלְמוּד לוֹמַר: לֹא תּוּכַל לִרְאוֹת אֶת פָּנַי  (שמות לג, כ) . וְאִם תֹּאמַר, הָא כְּתִיב: וּתְמוּנַת ה' יַבִּיט  (במדבר יב, ח) . זֶה מַרְאֶה אֲחוֹרַיִם, כְּעִנְיָן שֶׁנֶּאֱמַר: וְרָאִיתָ אֶת אֲחוֹרַי  (שמות לג, כג) . לָמָּה לֹא יְרֵאתֶם לְדַבֵּר בְּעַבְדִּי בְּמֹשֶׁה  (במדבר יב, ח) . אֵינוֹ אוֹמֵר בְּעַבְדִּי מֹשֶׁה, אֶלָּא בְּעַבְדִּי בְּמֹשֶׁה. כְּלוֹמַר, בְּעַבְדִּי אַף עַל פִּי שֶׁאֵינוֹ מֹשֶׁה, וְכֵן בְּמֹשֶׁה אַף עַל פִּי שֶׁאֵינוֹ עַבְדִּי, כְּדַאי הָיָה לִירֹא מִפָּנָיו. וְכָל שֶׁכֵּן שֶׁהוּא עַבְדִּי, וְעֶבֶד מֶלֶךְ מֶלֶךְ. וְהָיָה לָכֶם לוֹמַר, אֵין הַמֶּלֶךְ אוֹהֲבוֹ חִנָּם. וְאִם תֹּאמְרוּ שֶׁאֵינוֹ מַכִּיר בְּמַעֲשָׂיו, זוֹ קָשָׁה מִן הָרִאשׁוֹנָה. וַיִּחַר אַף ה' בָּם וַיֵּלֵךְ  (במדבר יב, ט) . לִמֵּד, כִּי מֵאַחַר שֶׁהוֹדִיעַ סִרְחוֹנָם, אַחֲרֵי כֵן גָּזַר עָלֶיהָ נִדּוּי. קַל וָחֹמֶר בָּשָׂר וָדָם, שֶׁלֹּא יִכְעֹס עַל חֲבֵרוֹ עַד שֶׁיּוֹדִיעֶנּוּ סִרְחוֹנוֹ. וְהֶעָנָן סָר מֵעַל הָאֹהֶל  (במדבר יב, י) , וְאַחֲרֵי כֵן, וְהִנֵּה מִרְיָם מְצֹרַעַת כַּשֶּׁלֶג  (במדבר יב, י) . מָשָׁל לְמֶלֶךְ שֶׁאָמַר לְפֶּדָגוֹגוֹ, הַכֵּה אֶת בְּנִי. אֲבָל לֹא תַּכֶּנּוּ עַד שֶׁאֵלֵךָ מֵאֶצְלְךָ, שֶׁרַחֲמַי עָלָיו. אַל נָא תָשֵׁת עָלֵינוּ חַטָּאת אֲשֶׁר נוֹאַלְנוּ  (במדבר יב, יא) . אַל נָא תְּהִי כַּמֵּת  (במדבר יב, יב) . מַה מֵּת מְטַמֵּא בְּבִיאָה, אַף מְצֹרָע מְטַמֵּא בְּבִיאָה. אֲשֶׁר בְּצֵאתוֹ מֵרֶחֶם אִמּוֹ  (במדבר יב, יב) . מֵרֶחֶם אִמֵּנוּ הָיָה לוֹ לוֹמַר, אֶלָּא שֶׁכִּנָּהוּ הַכָּתוּב כֵּן. וְכֵן חֲצִי בְּשָׂרוֹ  (במדבר יב, יב) , הָיָה לוֹ לוֹמַר חֲצִי בְּשָׂרֵנוּ. וּלְפִי מַשְׁמָעוֹ נִרְאֶה לִי כֵן, אֵין רָאוּי לְהַנִּיחַ אֶת אֲחוֹתֵינוּ לִהְיוֹת כַּמֵּת, כִּי מֵאַחַר שֶׁיָּצָאת מֵרֶחֶם אִמּוֹ שֶׁל זֶה שֶׁהָיָה בְּיָדוֹ לַעֲזֹר וְאֵינוֹ עוֹזְרוֹ, הֲרֵי יֵאָכֵל חֲצִי בְּשָׂרוֹ, שֶׁאָחִיו בְּשָׂרוֹ הוּא. דָּבָר אַחֵר, אַל נָא תְּהִי כַּמֵּת. אִם אֵינְךָ רוֹפְאָהּ בִּתְפִלָּה, מִי מַסְגִּירָהּ וּמִי מְטַמְּאָהּ, כִּי אֵינִי אֶפְשָׁר לִרְאוֹתָהּ, כִּי אֲנִי קָרוֹב, וְאֵין קָרוֹב רוֹאֶה אֶת הַנְּגָעִים, וְכֹהֵן אַחֵר אֵין בָּעוֹלָם. וְזֶהוּ שֶׁנֶּאֱמַר: אֲשֶׁר בְּצֵאתוֹ מֵרֶחֶם אִמּוֹ. אֵל נָא רְפָא נָא לָהּ  (במדבר יב, יג) . בָּא הַכָּתוּב לְלַמֶּדְךָ דֶּרֶךְ אֶרֶץ, שֶׁהַשּׁוֹאֵל דָּבָר, צָרִיךְ שֶׁיֹּאמַר שְׁנַיִם אוֹ שְׁלֹשָׁה דִּבְרֵי תַּחֲנוּנִים וְאַחַר כָּךְ יְבַקֵּשׁ שְׁאֵלוֹתָיו. לֵאמֹר, מַה תַּלְמוּד לוֹמַר. אָמַר לוֹ: הֲשִׁיבֵנִי אִם מְרַפֵּא אַתָּה אוֹתָהּ אִם לָאו. עַד שֶׁהֱשִׁיבוֹ, וְאָבִיהָ יָרֹק יָרַק בְּפָנֶיהָ  (במדבר יב, יד) . וּמִפְּנֵי מָה לֹא הֶאֱרִיךְ מֹשֶׁה בִּתְפִלָּה זוֹ. כְּדֵי שֶׁלֹּא יִהְיוּ יִשְׂרָאֵל אוֹמְרִין, אֲחוֹתוֹ נְתוּנָה בְּצָרָה, וְהוּא מַרְבֶּה בִּתְפִלָּה. תִּסָּגֵר שִׁבְעַת יָמִים וְאַחַר תֵּאָסֵף  (במדבר יב, יד) . וַאֲנִי אוֹמֵר, כִּי כָּל הָאֲסֵפוֹת שֶׁיֵּשׁ בִּמְצֹרָעִים, יִהְיוּ עַל שֵׁם שֶׁהוּא מְשֻׁלָּח מִן הַמַּחֲנֶה. וּכְשֶׁהוּא נִרְפָּא, נֶאֱסָף אֶל הַמַּחֲנֶה. כָּל אֲסִיפָה לְשׁוֹן הַכְנָסָה הִיא. וְהָעָם לֹא נָסַע עַד הֵאָסֵף מִרְיָם  (במדבר יב, טו) . כָּבוֹד זֶה חָלַק לָהּ הַמָּקוֹם בִּשְׁבִיל שָׁעָה אַחַת שֶׁנִּתְעַכְּבָה לְמֹשֶׁה כְּשֶׁהֻשְׁלַךְ לַיְּאוֹר, שֶׁנֶּאֱמַר: וַתֵּתַצַּב אֲחוֹתוֹ מֵרָחוֹק  (שמות ב, ד) . הִיא עִכְּבָה שָׁעָה אַחַת, וְכָל יִשְׂרָאֵל עִכְּבוּ בִּשְׁבִילָהּ שִׁבְעַת יָמִים. הֱוֵי, הַמְצֹרָע חָשׁוּב כַּמֵּת.  Berakhot 5b:4-7   Rabbi Yoḥanan said: Leprosy and  suffering due to  children are not afflictions of love.   The Gemara asks: Is  leprosy not  an affliction of love?  Didn’t we learn  in a  baraita :  If one has any of the four signs of leprosy  (Leviticus 13)  they are nothing other than an altar of atonement?   The Gemara answers: Although the signs of leprosy  are an altar of atonement  for one’s transgressions,  they are not an affliction of love.   And if you wish, say  instead:  This   baraita , which says that leprosy is an affliction of love,  is for us  in Babylonia, because outside of Eretz Yisrael we are not as careful of the laws of ritual impurity, and one afflicted with leprosy may interact with others, mitigating his suffering.  And that  statement of Rabbi Yoḥanan, that leprosy is not an affliction of love,  is for them  in Eretz Yisrael, where they are exceedingly careful of the laws of ritual impurity and the suffering of a leper is great because he is banished from society (Rav Hai Gaon). אָמַר רַבִּי יוֹחָנָן: נְגָעִים וּבָנִים — אֵינָן יִסּוּרִין שֶׁל אַהֲבָה.   וּנְגָעִים לָא? וְהָתַנְיָא: כׇּל מִי שֶׁיֵּשׁ בּוֹ אֶחָד מֵאַרְבָּעָה מַרְאוֹת נְגָעִים הַלָּלוּ — אֵינָן אֶלָּא מִזְבַּח כַּפָּרָה!   מִזְבַּח כַּפָּרָה — הָווּ, יִסּוּרִין שֶׁל אַהֲבָה — לָא הָווּ.   וְאִי בָּעֵית אֵימָא: הָא — לָן. וְהָא — לְהוּ.  Zevachim 102a:1   and a non-priest may not inspect the  shades of leprous  marks  to diagnose them.  And if you say  that  Aaron quarantined her,  that is difficult, as  Aaron  was  a relative,  Miriam’s brother,  and a relative may not inspect the  shades of leprous  marks. Rather, the Holy One, Blessed be He, bestowed a great honor on Miriam at that time,  and said:  I  Myself  am a priest, and I  will  quarantine her  for seven days to see if the shades of leprous marks persist, and  I  will  declare her  a leper if she is impure,  and I  will  exempt her  if she is not impure. ואין זר רואה את הנגעים וא\"ת אהרן הסגירה אהרן קרוב הוא ואין קרוב רואה את הנגעים אלא כבוד גדול חלק לה הקב\"ה למרים אותה שעה אני כהן ואני מסגירה אני חולטה ואני פוטרה    Bewilderments: Reflections on the Book of Numbers, Avivah Gottlieb Zornberg \n\n Alienation and solitude, a father who kisses and strikes, a people that gathers her in—at the heart of Miriam's drama is her intense relation with her brother Moses, which continues throughout her life... \n\n   \n\n Bitterness and song, death and desire, are the motifs of her life; but more than anything, yearning—yearning for that other world so close to this one—that one step of the dance, one note of the song, will bring her there, even while she is still here.     ",
                    "owner_id": 52470,
                    "owner_name": "Jessica Spencer",
                    "owner_image": "",
                    "profile_url": "/profile/jessica-spencer",
                    "version": "Source Sheet by <a href='/profile/jessica-spencer' class='userLink'>Jessica Spencer</a>",
                    "tags": [],
                    "topic_slugs": ["isolation","leprosy","miriam","metzorat"],
                    "topics_en": ["Isolation","Leprosy","Miriam","Metzorat"],
                    "topics_he": ["בידוד","צרעת","מרים",""],
                    "sheetId": 234271,
                    "summary": "Why was Miriam stricken with illness in the desert, and why must she stay alone at the edge of the camp? Through close reading, we'll view Miriam's life through the lens of isolation and togetherness, separation and yearning. Is it possible to find God in a time of isolation?",
                    "collections": [],
                    "datePublished": "2020-05-04T07:27:32.813033",
                    "dateCreated": "2020-05-03T12:19:13.454487",
                    "dateModified": "2020-05-04T10:28:34.263374",
                    "views": 596
                },
                "highlight": {
                    "content": [
                        "Rather, initially  Miriam was  sickly [ <b>ḥela</b> ] ,  and ultimately  she was healthy and beautiful like  a young woman [ na’ara ]. עזובה זו מרים ולמה נקרא שמה עזובה שהכל עזבוה מתחילתה..."
                    ]
                }
            }
        ]
    }
}
```

<br />

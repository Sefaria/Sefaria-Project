---
updatedAt: 2026-06-02T06:51:34.000Z
agentTools:
  projectIndex: https://developers.sefaria.org/llms.txt
---

# Texts (v3)

The most up-to-date way to retrieve texts from Sefaria via the API, with enhanced control over language, language direction, and other parameters. 

# OpenAPI definition

```json
{
  "openapi": "3.0.2",
  "info": {
    "title": "Sefaria API",
    "version": "1.0.0",
    "description": "The Sefaria API endpoints grant live access to Sefaria's structured database of Jewish texts and their interconnections.",
    "contact": {
      "url": "https://www.sefaria.org",
      "email": "developers@sefaria.org"
    },
    "license": {
      "name": "GNU AGPLv3",
      "url": "https://www.gnu.org/licenses/agpl.txt"
    }
  },
  "servers": [
    {
      "url": "https://www.sefaria.org",
      "description": ""
    }
  ],
  "tags": [
    {
      "name": "Text",
      "description": "Operations related to retrieving texts"
    }
  ],
  "paths": {
    "/api/v3/texts/{tref}": {
      "summary": "v3 Texts",
      "description": "The most up-to-date way to retrieve Sefaria texts, with language data that can handle displaying a right-to-left text with a right-to-left translation. ",
      "get": {
        "operationId": "get-v3-texts",
        "tags": [
          "Text"
        ],
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/v3TextsJson"
                },
                "examples": {
                  "Esther 1.1": {
                    "value": {
                      "versions": [
                        {
                          "status": "locked",
                          "priority": 2,
                          "license": "CC-BY-SA",
                          "versionNotes": "<i>Miqra According to the Masorah</i> (MAM) is a digital Hebrew edition of the Tanakh based on the Aleppo Codex and related manuscripts. It is designed for readers, and as such it contains added elements to aid vocalization of the text. For instance: When an accent is marked in an unstressed syllable, an extra accent is added in the proper place (<i>pashta</i>, <i>zarqa</i>, <i>segol</i>, <i>telisha</i>). <i>Legarmeih</i> and <i>paseq</i> are visibly distinguished. <i>Qamaz qatan</i> is indicated by its designated Unicode character (alternatives are documented where traditions differ about its application).<br>The text of MAM is fully documented. The <a href=\"https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94/%D7%9E%D7%99%D7%93%D7%A2_%D7%A2%D7%9C_%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94_%D7%96%D7%95\">complete introduction</a> to the edition (Hebrew) explains the types of editorial decisions that have been made and the reasons for them (<a href=\"https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#About_this_Edition_(English_Abstract)\">English abstract</a>). In addition, every word in the Bible about which there is some textual concern or ambiguity includes a documentation note; these notes can be viewed conveniently <a href=\"https://bdenckla.github.io/MAM-with-doc/\">here</a>. If an error is discovered, it may be reported to <a href=\"https://he.wikisource.org/wiki/%D7%A9%D7%99%D7%97%D7%AA_%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi\">User:Dovi</a> at Hebrew Wikisource. Please check the documentation notes before reporting an error.",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "מקרא על פי המסורה",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94",
                          "versionTitle": "Miqra according to the Masorah",
                          "text": "וַיְהִ֖י בִּימֵ֣י אֲחַשְׁוֵר֑וֹשׁ ה֣וּא אֲחַשְׁוֵר֗וֹשׁ הַמֹּלֵךְ֙ מֵהֹ֣דּוּ וְעַד־כּ֔וּשׁ שֶׁ֛בַע וְעֶשְׂרִ֥ים וּמֵאָ֖ה מְדִינָֽה׃"
                        }
                      ],
                      "available_versions": [
                        {
                          "status": "locked",
                          "priority": 2,
                          "license": "CC-BY-SA",
                          "versionNotes": "<i>Miqra According to the Masorah</i> (MAM) is a digital Hebrew edition of the Tanakh based on the Aleppo Codex and related manuscripts. It is designed for readers, and as such it contains added elements to aid vocalization of the text. For instance: When an accent is marked in an unstressed syllable, an extra accent is added in the proper place (<i>pashta</i>, <i>zarqa</i>, <i>segol</i>, <i>telisha</i>). <i>Legarmeih</i> and <i>paseq</i> are visibly distinguished. <i>Qamaz qatan</i> is indicated by its designated Unicode character (alternatives are documented where traditions differ about its application).<br>The text of MAM is fully documented. The <a href=\"https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94/%D7%9E%D7%99%D7%93%D7%A2_%D7%A2%D7%9C_%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94_%D7%96%D7%95\">complete introduction</a> to the edition (Hebrew) explains the types of editorial decisions that have been made and the reasons for them (<a href=\"https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#About_this_Edition_(English_Abstract)\">English abstract</a>). In addition, every word in the Bible about which there is some textual concern or ambiguity includes a documentation note; these notes can be viewed conveniently <a href=\"https://bdenckla.github.io/MAM-with-doc/\">here</a>. If an error is discovered, it may be reported to <a href=\"https://he.wikisource.org/wiki/%D7%A9%D7%99%D7%97%D7%AA_%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi\">User:Dovi</a> at Hebrew Wikisource. Please check the documentation notes before reporting an error.",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "מקרא על פי המסורה",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94",
                          "versionTitle": "Miqra according to the Masorah"
                        },
                        {
                          "status": "locked",
                          "priority": 2,
                          "license": "CC-BY-NC",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "JPS, 1985",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/JPS_1985.png",
                          "purchaseInformationURL": "https://www.nebraskapress.unl.edu/jps/9780827602526/",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://jps.org/books/tanakh-the-holy-scriptures-blue/",
                          "versionTitle": "Tanakh: The Holy Scriptures, published by JPS"
                        },
                        {
                          "status": "locked",
                          "priority": 1,
                          "license": "Public Domain",
                          "versionNotes": "This 1917 translation by the Jewish Publication Society is in the public domain. JPS graciously shared digital images of this text with the Open Siddur Project, from which the text was imported by Sefaria.",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "כתבי הקודש: תרגום חדש (1917 JPS)",
                          "versionNotesInHebrew": "תרגום JPS 1917 קיים בנחלת הכלל. הסריקות באדיבות JPS. שעתוק הטקסט תודות לפרויקט Open Siddur, משם יובא הטקסט למאגר ספריא",
                          "shortVersionTitle": "JPS 1917",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "http://opensiddur.org/2010/08/%D7%AA%D7%A0%D7%B4%D7%9A-the-holy-scriptures-a-new-translation-jps-1917/",
                          "versionTitle": "The Holy Scriptures: A New Translation (JPS 1917)"
                        },
                        {
                          "status": "locked",
                          "priority": 1,
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "תנ״ך מלווה בטעמי מקרא",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "http://www.tanach.us/Tanach.xml",
                          "versionTitle": "Tanach with Ta'amei Hamikra"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "תנ״ך - טקסט בלבד",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "http://www.tanach.us/Tanach.xml",
                          "versionTitle": "Tanach with Text Only"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "תנ״ך עם ניקוד",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "http://www.tanach.us/Tanach.xml",
                          "versionTitle": "Tanach with Nikkud"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "תרגום קהילת ספריא",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.sefaria.org",
                          "versionTitle": "Sefaria Community Translation"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "CC-BY",
                          "versionNotes": "To enhance the quality of this text, obvious translation errors were corrected in accordance with the Hebrew source",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "כתובים' על פי רש״י, רבי שרגא זילברשטיין",
                          "versionNotesInHebrew": "כדי לשפר את איכות הטקסט הזה, שונו שגיאות תרגום ברורות בהתאם למקור העברי",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "http://www.sefaria.org/shraga-silverstein",
                          "versionTitle": "The Rashi Ketuvim by Rabbi Shraga Silverstein"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "CC-BY-NC",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/9f4b3fedfe5a8889a3a7b3b7f3022091.png",
                          "purchaseInformationURL": "https://korenpub.com/collections/tanakh",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.korenpub.com/koren_en_usd/koren/tanakh-bible/the-koren-jerusalem-bible.html",
                          "versionTitle": "The Koren Jerusalem Bible"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "CC-BY",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/958565938f3a7ed617834d467ac93c9f.png",
                          "purchaseInformationURL": "https://www.israelbookshoppublications.com/store/pc/Metsudah-Five-Megilloth-w-Rashi-26p309.htm",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.judaicaplace.com/search/brand/Metsudah-Publications/",
                          "versionTitle": "The Metsudah Five Megillot, Lakewood, N.J., 2001"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "CC-BY",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "חמש מגילות, הוצאת 'מצודה', לייקווד תשס\"א",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/232433ac3323606604f21e0c70f0c061.png",
                          "purchaseInformationURL": "https://www.israelbookshoppublications.com/store/pc/Metsudah-Five-Megilloth-w-Rashi-26p309.htm",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "https://www.judaicaplace.com/search/brand/Metsudah-Publications/",
                          "versionTitle": "The Metsudah Five Megillot, Lakewood, N.J., 2001"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "מגילת אסתר - מהדורה פורימית!!",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "https://www.sefaria.org",
                          "versionTitle": "Megillat Esther - Purim Edition!!"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "fr",
                          "languageFamilyName": "french",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://fr.wikisource.org/wiki/Bible_du_Rabbinat_1899",
                          "versionTitle": "Bible du Rabbinat 1899 [fr]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "CC0",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "מגילת אמוג'י",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "https://www.sefaria.org",
                          "versionTitle": "Emoji Megillah"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "CC0",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.sefaria.org",
                          "versionTitle": "Emoji Megillah"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "Izaak Cylkow, 1841 - 1908 ",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "pl",
                          "languageFamilyName": "polish",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "http://bibliepolskie.pl/",
                          "versionTitle": "Bible in Polish, trans. Izaak Cylkow, 1841 - 1908 [pl]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "it",
                          "languageFamilyName": "italian",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "http://www.archivio-torah.it",
                          "versionTitle": "Ester. Traduzione italiana di Samuel David Luzzatto, 1872 [it]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "fa",
                          "languageFamilyName": "persian",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "http://www.iranjewish.com/megilla/megilla_main.htm",
                          "versionTitle": "Book of Esther in Farsi, trans. by Pole-Choubi, synagogue Talmood Torah [fa]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "fa",
                          "languageFamilyName": "persian",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "http://www.iranjewish.com/megilla/megilla_main.htm",
                          "versionTitle": "Book of Esther in Farsi, trans. by Pole-Choubi, synagogue Talmood Torah, LTR [fa]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "This 1941 translation published by Yehoʼash Farlag Gezelshaft is in the public domain. A transcribed digitized version was produced by Itsik \"Robert\" Goldenberg, et al, by the Yehoyesh Project (1998-2006) under the direction of Leonard Prager. That version was graciously shared with the Open Siddur Project, from which the text was imported by Sefaria.",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "yi",
                          "languageFamilyName": "yiddish",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "http://opensiddur.org/praxes/study/yehoyeshs-yiddish-translation-of-the-tanakh/",
                          "versionTitle": "Yehoyesh's Yiddish Tanakh Translation [yi]"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "",
                          "versionNotes": "<b>Translator:</b> Marion Kaufmann, based on german translations of Tur-Sinai, Martín Buber and Franz Rosenzwig<br><b>Review and correction:</b> Manes Kogan<br><b>Final Review:</b> Batia Dorfman",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "es",
                          "languageFamilyName": "spanish",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.seminariorabinico.org/wp-content/uploads/El-libro-de-Ester-Meguila-Ester.pdf",
                          "versionTitle": "El libro de Ester - Meguila Ester - Seminario Rabínico [es]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "Samuel Cahen, 1831 ",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "fr",
                          "languageFamilyName": "french",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.levangile.com/Bible-CAH-1-1-1-complet-Contexte-oui.htm",
                          "versionTitle": "La Bible, Traduction Nouvelle, Samuel Cahen, 1831 [fr]"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "Public Domain",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "eo",
                          "languageFamilyName": "esperanto",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://eo.wikisource.org/wiki/Malnova_Testamento_(Zamenhof)/Ester/1",
                          "versionTitle": "La Malnova Testamento, L.L.Zamenhof [eo]"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "Digitized by Chajm Guski and Marina Struse",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "de",
                          "languageFamilyName": "german",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://www.talmud.de/tlmd/tanach/",
                          "versionTitle": "Die Heilige Schrift, trans. Dr. Simon Bernfeld, Berlin, 1902 - German [de]"
                        },
                        {
                          "status": "locked",
                          "priority": "",
                          "license": "PD",
                          "versionNotes": "",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": true,
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "",
                          "purchaseInformationURL": "",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "he",
                          "languageFamilyName": "hebrew",
                          "isSource": true,
                          "isPrimary": true,
                          "direction": "rtl",
                          "language": "he",
                          "title": "Esther",
                          "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A7%D7%A8%D7%90_%D7%9E%D7%91%D7%95%D7%90%D7%A8",
                          "versionTitle": "Miqra Mevoar, trans. and edited by David Kokhav, Jerusalem 2020"
                        },
                        {
                          "status": "",
                          "priority": "",
                          "license": "",
                          "versionNotes": "<a href=\"http://purl.org/jps/rjps-preface\">Read the Preface to the Revised JPS Edition</a>\n<br><br>\n<a href=\"http://purl.org/jps/gender\">Read the Notes on Gender in Translation for the Revised JPS Edition</a>\n<br><br>\n<a href=\"https://www.sefaria.org/collections/commentary-on-the-usage-and-rendering-of-%D7%90%D7%99%D7%A9?tab=sheets\">Read a Commentary on the Hebrew word 'ish in the Revised JPS Edition</a>",
                          "formatAsPoetry": "",
                          "digitizedBySefaria": "",
                          "method": "",
                          "heversionSource": "",
                          "versionUrl": "",
                          "versionTitleInHebrew": "",
                          "versionNotesInHebrew": "",
                          "shortVersionTitle": "Revised JPS, 2023",
                          "shortVersionTitleInHebrew": "",
                          "extendedNotes": "",
                          "extendedNotesHebrew": "",
                          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/JPS-Tanakh-Gender-Sensitive-Edition-Cover-300x450.jpg",
                          "purchaseInformationURL": "https://jps.org/books/the-jps-tanakh-gender-sensitive-edition/",
                          "hasManuallyWrappedRefs": "",
                          "actualLanguage": "en",
                          "languageFamilyName": "english",
                          "isSource": false,
                          "isPrimary": false,
                          "direction": "ltr",
                          "language": "en",
                          "title": "Esther",
                          "versionSource": "https://jps.org/books/the-jps-tanakh-gender-sensitive-edition/",
                          "versionTitle": "THE JPS TANAKH: Gender-Sensitive Edition"
                        }
                      ],
                      "ref": "Esther 1:1",
                      "heRef": "אסתר א׳:א׳",
                      "sections": [
                        "1",
                        "1"
                      ],
                      "toSections": [
                        "1",
                        "1"
                      ],
                      "sectionRef": "Esther 1",
                      "heSectionRef": "אסתר א׳",
                      "firstAvailableSectionRef": "Esther 1:1",
                      "isSpanning": false,
                      "spanningRefs": [
                        "Esther 1:1"
                      ],
                      "next": "Esther 2",
                      "title": "Esther 1",
                      "book": "Esther",
                      "heTitle": "אסתר",
                      "primary_category": "Tanakh",
                      "type": "Tanakh",
                      "indexTitle": "Esther",
                      "categories": [
                        "Tanakh",
                        "Writings"
                      ],
                      "heIndexTitle": "אסתר",
                      "isComplex": false,
                      "isDependant": false,
                      "order": [
                        34,
                        8
                      ],
                      "collectiveTitle": "",
                      "heCollectiveTitle": "",
                      "alts": [],
                      "lengths": [
                        10,
                        167
                      ],
                      "length": 10,
                      "textDepth": 2,
                      "sectionNames": [
                        "Chapter",
                        "Verse"
                      ],
                      "addressTypes": [
                        "Perek",
                        "Pasuk"
                      ],
                      "titleVariants": [
                        "Est.",
                        "Est",
                        "Ester",
                        "Esth.",
                        "Esth",
                        "Esther"
                      ],
                      "heTitleVariants": [
                        "מגילת אסתר",
                        "אסתר"
                      ],
                      "index_offsets_by_depth": {},
                      "warnings": []
                    }
                  }
                }
              }
            },
            "description": "Successful retrieval of the desired texts."
          }
        },
        "summary": "Texts (v3)",
        "description": "The most up-to-date way to retrieve texts from Sefaria via the API, with enhanced control over language, language direction, and other parameters. "
      },
      "parameters": [
        {
          "examples": {
            "language": {
              "value": "hebrew"
            },
            "language|version": {
              "value": "hebrew|Miqra according to the Masorah"
            }
          },
          "name": "version",
          "description": "There are two possible forms for the string passed as the `version`:\n1. `language`\n2. `language|versionTitle`\n\nWhen in the form of `language`, the primary version of that language is returned in the `versions` field of the response object. When in the form of `language|versionTitle`, only that specific version is returned in the `versions` field. \n\n\n**Notes**: \n- `language` is the full English name of the language. In cases of dialectics with varying sub-specifities, please pass the ‘mother’ language (so for example, `arabic` rather than `judeo-arabic`). This field is NOT case sensitive.\n- `versionTitle` is the exact English `versionTitle` of the given `version` in the Sefaria database. \n- When only `language` is passed, the response will return a single version of the text in that language, the one that is highest priority in the Sefaria database.\n- Requests can have more than one `version` param. If no `version` was passed, the API defaults to `version=primary`.\n\n-----\n\n**Special Values**\nThe following values can be passed in as special values to the `version` parameter. \n- `source`: When `version=source` is passed, it retrieves the text in its \"source\" language (i.e. the original language the text was written in, versus a translation).\n- `translation`: When `version=translation`is passed, it retrieves a translation of the text. \n- `primary`: When `version=primary` is passed, it retrieves the primary text as per the Sefaria database (i.e. the `isPrimary` field on the `version` in the database is set to `True`). Usually the text returned is identical to what is returned with the special value of `source`, but it can also include other languages (e.g. Hebrew for the _Kuzari_, which was originally written in Judeo-Arabic)\n- `all`: get all texts in the required language.\n\n\nIf a required version is missing that information will be under the field warnings of the response.\n",
          "schema": {
            "type": "string"
          },
          "in": "query"
        },
        {
          "examples": {
            "Tanakh Segment Level Ref": {
              "value": "Esther 1.1"
            },
            "Tanakh Bottom Level Section Ref": {
              "value": "Esther 4"
            },
            "Talmud Segment Ref": {
              "value": "Berakhot 14b.2"
            },
            "Talmud Bottom Level Section Ref": {
              "value": "Berakhot 14b"
            },
            "Commentary Section Ref": {
              "value": "Rashi on Genesis 1:1:1"
            },
            "Commentary Bottom Level Section Ref": {
              "value": "Rashi on Genesis 1:1"
            }
          },
          "name": "tref",
          "description": "A Sefaria-specific reference, `Ref`. This should be a segment `Ref` (the most specific reference possible), or bottom level section `Ref` (i.e.  a section of text one level up. A section is an array of segments). If a `Ref` which is not a segment or bottom level section is passed, the response will be to the first bottom level section `Ref` (e.g. `Genesis` will resolve to the bottom level section `Ref` of `Genesis 1`)",
          "schema": {
            "type": "string",
            "default": "Esther 1.1"
          },
          "in": "path",
          "required": true
        },
        {
          "name": "fill_in_missing_segments",
          "description": "This parameter is only relevant for cases where the requested text is incomplete (i.e. not all of the segments in the requested version exist in the database for that text, such as a partial translation).\n\nWhen `fill_in_missing_segments=1`, the segments of text that are missing in the requested version will be filled by other versions of the same language.\n\nThis value defaults to `0`. \n",
          "schema": {
            "enum": [
              "0",
              "1"
            ],
            "type": "string"
          },
          "in": "query"
        },
        {
          "examples": {
            "Text Only": {
              "value": "text_only"
            },
            "Wrap All Entities": {
              "value": "wrap_all_entities"
            }
          },
          "name": "return_format",
          "description": "This parameter formats the text that will be returned from the `v3` `texts/` API. It can have one of four values:\n1. `text_only` - This strips footnotes, inline references, and all HTML tags from the returned text.\n2. `strip_only_footnotes` - This strips only the footnotes and commentator tags without stripping the other HTML tags.This is useful for the native app, where we do not display footnotes.\n3. `wrap_all_entities` - This wraps the HTML for links and topic links.\n4. `default` - This returns the basic text as it is saved in Sefaria’s DB.\n",
          "schema": {
            "enum": [
              "default",
              "wrap_all_entities",
              "strip_only_footnotes",
              "text_only"
            ],
            "type": "string",
            "default": "default"
          },
          "in": "query"
        }
      ]
    }
  },
  "components": {
    "schemas": {
      "ref": {
        "description": "A string representing a citation to a Jewish text. \n\nA valid `Ref` consists of a title string followed optionally by a section string or a segment string. \n\nA title string is any one of the known text titles or title variants in the Sefaria Database.",
        "type": "string",
        "example": "Mishnah Peah 4:2"
      },
      "v3TextsJson": {
        "title": "Root Type for v3TextsJson",
        "description": "The JSON returned from the `v3` `texts/` endpoint. ",
        "type": "object",
        "properties": {
          "versions": {
            "description": "The list of requested `version` objects. It includes all the data that is unique to the requested `versions`. \n",
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/v3TextVersionsJSON"
            },
            "example": [
              {
                "status": "locked",
                "priority": 2,
                "license": "CC-BY-SA",
                "versionNotes": "<i>Miqra According to the Masorah</i> (MAM) is a digital Hebrew edition of the Tanakh based on the Aleppo Codex and related manuscripts. It is designed for readers, and as such it contains added elements to aid vocalization of the text. For instance: When an accent is marked in an unstressed syllable, an extra accent is added in the proper place (<i>pashta</i>, <i>zarqa</i>, <i>segol</i>, <i>telisha</i>). <i>Legarmeih</i> and <i>paseq</i> are visibly distinguished. <i>Qamaz qatan</i> is indicated by its designated Unicode character (alternatives are documented where traditions differ about its application).<br>The text of MAM is fully documented. The <a href=\\\"https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94/%D7%9E%D7%99%D7%93%D7%A2_%D7%A2%D7%9C_%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94_%D7%96%D7%95\\\">complete introduction</a> to the edition (Hebrew) explains the types of editorial decisions that have been made and the reasons for them (<a href=\\\"https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#About_this_Edition_(English_Abstract)\\\">English abstract</a>). In addition, every word in the Bible about which there is some textual concern or ambiguity includes a documentation note; these notes can be viewed conveniently <a href=\\\"https://bdenckla.github.io/MAM-with-doc/\\\">here</a>. If an error is discovered, it may be reported to <a href=\\\"https://he.wikisource.org/wiki/%D7%A9%D7%99%D7%97%D7%AA_%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi\\\">User:Dovi</a> at Hebrew Wikisource. Please check the documentation notes before reporting an error.",
                "formatAsPoetry": "",
                "digitizedBySefaria": "",
                "method": "",
                "heversionSource": "",
                "versionUrl": "",
                "versionTitleInHebrew": "מקרא על פי המסורה",
                "versionNotesInHebrew": "",
                "shortVersionTitle": "",
                "shortVersionTitleInHebrew": "",
                "extendedNotes": "",
                "extendedNotesHebrew": "",
                "purchaseInformationImage": "",
                "purchaseInformationURL": "",
                "hasManuallyWrappedRefs": "",
                "actualLanguage": "he",
                "languageFamilyName": "hebrew",
                "isSource": true,
                "isPrimary": true,
                "direction": "rtl",
                "language": "he",
                "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94",
                "versionTitle": "Miqra according to the Masorah",
                "text": [
                  [
                    "חֲז֖וֹן עֹֽבַדְיָ֑ה כֹּֽה־אָמַר֩ אֲדֹנָ֨י יֱהֹוִ֜ה לֶאֱד֗וֹם שְׁמוּעָ֨ה שָׁמַ֜עְנוּ מֵאֵ֤ת יְהֹוָה֙ וְצִיר֙ בַּגּוֹיִ֣ם שֻׁלָּ֔ח ק֛וּמוּ וְנָק֥וּמָה עָלֶ֖יהָ לַמִּלְחָמָֽה׃\",\n\"הִנֵּ֥ה קָטֹ֛ן נְתַתִּ֖יךָ בַּגּוֹיִ֑ם בָּז֥וּי אַתָּ֖ה מְאֹֽד׃\",\n\"זְד֤וֹן לִבְּךָ֙ הִשִּׁיאֶ֔ךָ שֹׁכְנִ֥י בְחַגְוֵי־סֶ֖לַע מְר֣וֹם שִׁבְתּ֑וֹ אֹמֵ֣ר בְּלִבּ֔וֹ מִ֥י יוֹרִדֵ֖נִי אָֽרֶץ׃\",\n\"אִם־תַּגְבִּ֣יהַּ כַּנֶּ֔שֶׁר וְאִם־בֵּ֥ין כּֽוֹכָבִ֖ים שִׂ֣ים קִנֶּ֑ךָ מִשָּׁ֥ם אוֹרִֽידְךָ֖ נְאֻם־יְהֹוָֽה׃\",\n\"אִם־גַּנָּבִ֤ים בָּאֽוּ־לְךָ֙ אִם־שׁ֣וֹדְדֵי לַ֔יְלָה אֵ֣יךְ נִדְמֵ֔יתָה הֲל֥וֹא יִגְנְב֖וּ דַּיָּ֑ם אִם־בֹּֽצְרִים֙ בָּ֣אוּ לָ֔ךְ הֲל֖וֹא יַשְׁאִ֥ירוּ עֹלֵלֽוֹת׃\",\n\"אֵ֚יךְ נֶחְפְּשׂ֣וּ עֵשָׂ֔ו נִבְע֖וּ מַצְפֻּנָֽיו׃\",\n\"עַֽד־הַגְּב֣וּל שִׁלְּח֗וּךָ כֹּ֚ל אַנְשֵׁ֣י בְרִיתֶ֔ךָ הִשִּׁיא֛וּךָ יָכְל֥וּ לְךָ֖ אַנְשֵׁ֣י שְׁלֹמֶ֑ךָ לַחְמְךָ֗ יָשִׂ֤ימוּ מָזוֹר֙ תַּחְתֶּ֔יךָ אֵ֥ין תְּבוּנָ֖ה בּֽוֹ׃\",\n\"הֲל֛וֹא בַּיּ֥וֹם הַה֖וּא נְאֻם־יְהֹוָ֑ה וְהַאֲבַדְתִּ֤י חֲכָמִים֙ מֵֽאֱד֔וֹם וּתְבוּנָ֖ה מֵהַ֥ר עֵשָֽׂו׃\",\n\"וְחַתּ֥וּ גִבּוֹרֶ֖יךָ תֵּימָ֑ן לְמַ֧עַן יִכָּֽרֶת־אִ֛ישׁ מֵהַ֥ר עֵשָׂ֖ו מִקָּֽטֶל׃\",\n\"מֵחֲמַ֛ס אָחִ֥יךָ יַעֲקֹ֖ב תְּכַסְּךָ֣ בוּשָׁ֑ה וְנִכְרַ֖תָּ לְעוֹלָֽם׃\",\n\"בְּיוֹם֙ עֲמׇֽדְךָ֣ מִנֶּ֔גֶד בְּי֛וֹם שְׁב֥וֹת זָרִ֖ים חֵיל֑וֹ וְנׇכְרִ֞ים בָּ֣אוּ <span class=\\\"mam-kq-trivial\\\">שְׁעָרָ֗ו</span> וְעַל־יְרוּשָׁלַ֙͏ִם֙ יַדּ֣וּ גוֹרָ֔ל גַּם־אַתָּ֖ה כְּאַחַ֥ד מֵהֶֽם׃\",\n\"וְאַל־תֵּ֤רֶא בְיוֹם־אָחִ֙יךָ֙ בְּי֣וֹם נׇכְר֔וֹ וְאַל־תִּשְׂמַ֥ח לִבְנֵֽי־יְהוּדָ֖ה בְּי֣וֹם אׇבְדָ֑ם וְאַל־תַּגְדֵּ֥ל פִּ֖יךָ בְּי֥וֹם צָרָֽה׃\",\n\"אַל־תָּב֤וֹא בְשַֽׁעַר־עַמִּי֙ בְּי֣וֹם אֵידָ֔ם אַל־תֵּ֧רֶא גַם־אַתָּ֛ה בְּרָעָת֖וֹ בְּי֣וֹם אֵיד֑וֹ וְאַל־תִּשְׁלַ֥חְנָה בְחֵיל֖וֹ בְּי֥וֹם אֵידֽוֹ׃\",\n\"וְאַֽל־תַּעֲמֹד֙ עַל־הַפֶּ֔רֶק לְהַכְרִ֖ית אֶת־פְּלִיטָ֑יו וְאַל־תַּסְגֵּ֥ר שְׂרִידָ֖יו בְּי֥וֹם צָרָֽה׃\",\n\"כִּֽי־קָר֥וֹב יוֹם־יְהֹוָ֖ה עַל־כׇּל־הַגּוֹיִ֑ם כַּאֲשֶׁ֤ר עָשִׂ֙יתָ֙ יֵעָ֣שֶׂה לָּ֔ךְ גְּמֻלְךָ֖ יָשׁ֥וּב בְּרֹאשֶֽׁךָ׃\",\n\"כִּ֗י כַּֽאֲשֶׁ֤ר שְׁתִיתֶם֙ עַל־הַ֣ר קׇדְשִׁ֔י יִשְׁתּ֥וּ כׇֽל־הַגּוֹיִ֖ם תָּמִ֑יד וְשָׁת֣וּ וְלָע֔וּ וְהָי֖וּ כְּל֥וֹא הָיֽוּ׃\",\n\"וּבְהַ֥ר צִיּ֛וֹן תִּהְיֶ֥ה פְלֵיטָ֖ה וְהָ֣יָה קֹ֑דֶשׁ וְיָֽרְשׁוּ֙ בֵּ֣ית יַֽעֲקֹ֔ב אֵ֖ת מוֹרָֽשֵׁיהֶֽם׃\",\n\"וְהָיָה֩ בֵית־יַעֲקֹ֨ב אֵ֜שׁ וּבֵ֧ית יוֹסֵ֣ף לֶהָבָ֗ה וּבֵ֤ית עֵשָׂו֙ לְקַ֔שׁ וְדָלְק֥וּ בָהֶ֖ם וַאֲכָל֑וּם וְלֹֽא־יִֽהְיֶ֤ה שָׂרִיד֙ לְבֵ֣ית עֵשָׂ֔ו כִּ֥י יְהֹוָ֖ה דִּבֵּֽר׃\",\n\"וְיָרְשׁ֨וּ הַנֶּ֜גֶב אֶת־הַ֣ר עֵשָׂ֗ו וְהַשְּׁפֵלָה֙ אֶת־פְּלִשְׁתִּ֔ים וְיָרְשׁוּ֙ אֶת־שְׂדֵ֣ה אֶפְרַ֔יִם וְאֵ֖ת שְׂדֵ֣ה שֹׁמְר֑וֹן וּבִנְיָמִ֖ן אֶת־הַגִּלְעָֽד׃\",\n\"וְגָלֻ֣ת הַֽחֵל־הַ֠זֶּ֠ה לִבְנֵ֨י יִשְׂרָאֵ֤ל אֲשֶֽׁר־כְּנַעֲנִים֙ עַד־צָ֣רְפַ֔ת וְגָלֻ֥ת יְרוּשָׁלַ֖͏ִם אֲשֶׁ֣ר בִּסְפָרַ֑ד יִֽרְשׁ֕וּ אֵ֖ת עָרֵ֥י הַנֶּֽגֶב׃\",\n\"וְעָל֤וּ מֽוֹשִׁעִים֙ בְּהַ֣ר צִיּ֔וֹן לִשְׁפֹּ֖ט אֶת־הַ֣ר עֵשָׂ֑ו וְהָיְתָ֥ה לַֽיהֹוָ֖ה הַמְּלוּכָֽה׃"
                  ]
                ],
                "firstSectionRef": "Obadiah 1"
              }
            ]
          },
          "available_versions": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/v3AvailableVersionsTextJson"
            }
          },
          "ref": {
            "$ref": "#/components/schemas/ref"
          },
          "heRef": {
            "description": "Hebrew `Ref` for the segment. ",
            "type": "string"
          },
          "sections": {
            "description": "An array which corresponds to sectionNames and represents the sections of the text requested. When sectionNames is `[\"Chapter\", \"Verse\"]` a request for chapter 4 looks like `[4]` while a request for chapter 4, verse 7 would look like `[4, 7]`. _Note, for Talmud, Dafs are represented by a string like \"42a\" or \"12b\"_",
            "type": "array",
            "items": {}
          },
          "toSections": {
            "type": "array",
            "items": {}
          },
          "sectionRef": {
            "$ref": "#/components/schemas/ref"
          },
          "heSectionRef": {
            "type": "string"
          },
          "firstAvailableSectionRef": {
            "type": "string"
          },
          "isSpanning": {
            "type": "boolean"
          },
          "spanningRefs": {
            "type": "array",
            "items": {}
          },
          "next": {
            "description": "Next segment reference in sequence, if last ref, field will be `null`.",
            "type": "string"
          },
          "prev": {
            "description": "Previous segment reference in sequence, if first ref, field will be `null`.",
            "type": "string"
          },
          "title": {
            "description": "The title of the book these versions correspond to. ",
            "type": "string"
          },
          "book": {
            "description": "The title of the book that the response comes from.",
            "type": "string",
            "example": "Esther"
          },
          "heTitle": {
            "type": "string"
          },
          "primary_category": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "indexTitle": {
            "description": "The book title",
            "type": "string"
          },
          "categories": {
            "description": "A list of categories that a text belongs to. ",
            "type": "array",
            "items": {
              "type": "string"
            },
            "example": [
              "Tanakh",
              "Writings"
            ]
          },
          "heIndexTitle": {
            "type": "string"
          },
          "isComplex": {
            "description": "Whether or not the text is a \"complex\" text or not.\n\nIn Sefaria, a complex text is any text which has a more complicated index structure beyond Chapters/Verses, (e.g. the Talmud). There are a variety of structural differences for a complex text, having to do primarily with its Index, and the way the data is stored. For more on complex texts, see the documentation here.",
            "type": "boolean"
          },
          "isDependant": {
            "type": "boolean"
          },
          "order": {
            "type": "array",
            "items": {
              "format": "int32",
              "type": "integer"
            }
          },
          "collectiveTitle": {
            "description": "A shortened name of the Index for display in the connection panel (i.e. `Rashi on Genesis` will have a collective title of `Rashi`)",
            "type": "string"
          },
          "heCollectiveTitle": {
            "description": "A Hebrew shortened name of the Index for display in the connection panel (i.e. `רש״י על בראשית` will have a collective title of `רש״י`)",
            "type": "string"
          },
          "alts": {
            "type": "array",
            "items": {}
          },
          "lengths": {
            "type": "array",
            "items": {
              "format": "int32",
              "type": "integer"
            }
          },
          "length": {
            "format": "int32",
            "type": "integer"
          },
          "textDepth": {
            "format": "int32",
            "description": "The depth of the text. For example, Genesis will have depth of `2`, since it is comprised of two layers, chapters and verses. Whereas a commentary on Genesis will have a depth of `3`, since it is organized by chapter, verse, and then specific comment on a verse. ",
            "type": "integer"
          },
          "sectionNames": {
            "description": "An array containing the type names of the sections of this text. The length of sectionNames gives the depth of the structure of this text. For example, Kohelet `([\"Chapter\", \"Verse\"])` has depth 2, while Mishneh Torah `([\"Book\", \"Topic\", \"Section\", \"Law\"])` has depth 4. Comparing this depth to the depth of sections will show if the request was for the lowest level, or a higher level, of the text.",
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "addressTypes": {
            "description": "A list which length reflects the depth of the text structure, with string values indicating class names for address types for each level",
            "type": "array",
            "items": {
              "type": "string"
            },
            "example": [
              "Perek",
              "Pasuk"
            ]
          },
          "titleVariants": {
            "description": "Various alternative titles used for the text. ",
            "type": "array",
            "items": {
              "type": "string"
            },
            "example": [
              "Est.",
              "Est",
              "Ester",
              "Esth.",
              "Esth",
              "Esther"
            ]
          },
          "heTitleVariants": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "index_offsets_by_depth": {
            "type": "object"
          },
          "warnings": {
            "description": "A list of objects - for any version parameter that has no result there is a readable message and warning code. \n\nCodes:\n`APINoVersion = 101`\n`APINoLanguageVersion = 102`\n`APINoSourceText = 103`\n`APINoTranslationText = 104`\n",
            "type": "array",
            "items": {},
            "example": [
              {
                "finnish": {
                  "warning_code": 102,
                  "message": "We do not have the language you asked for Esther 1:1. Available languages are ['english', 'esperanto', 'french', 'german', 'hebrew', 'italian', 'persian', 'polish', 'spanish', 'yiddish']"
                }
              },
              {
                "dutch": {
                  "warning_code": 102,
                  "message": "We do not have the language you asked for Esther 1:1. Available languages are ['english', 'esperanto', 'french', 'german', 'hebrew', 'italian', 'persian', 'polish', 'spanish', 'yiddish']"
                }
              }
            ]
          }
        },
        "example": {
          "versions": [
            {
              "status": "locked",
              "priority": 2,
              "license": "CC-BY-SA",
              "versionNotes": "<i>Miqra According to the Masorah</i> (MAM) is a digital Hebrew edition of the Tanakh based on the Aleppo Codex and related manuscripts. It is designed for readers, and as such it contains added elements to aid vocalization of the text. For instance: When an accent is marked in an unstressed syllable, an extra accent is added in the proper place (<i>pashta</i>, <i>zarqa</i>, <i>segol</i>, <i>telisha</i>). <i>Legarmeih</i> and <i>paseq</i> are visibly distinguished. <i>Qamaz qatan</i> is indicated by its designated Unicode character (alternatives are documented where traditions differ about its application).<br>The text of MAM is fully documented. The <a href=\"https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94/%D7%9E%D7%99%D7%93%D7%A2_%D7%A2%D7%9C_%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94_%D7%96%D7%95\">complete introduction</a> to the edition (Hebrew) explains the types of editorial decisions that have been made and the reasons for them (<a href=\"https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#About_this_Edition_(English_Abstract)\">English abstract</a>). In addition, every word in the Bible about which there is some textual concern or ambiguity includes a documentation note; these notes can be viewed conveniently <a href=\"https://bdenckla.github.io/MAM-with-doc/\">here</a>. If an error is discovered, it may be reported to <a href=\"https://he.wikisource.org/wiki/%D7%A9%D7%99%D7%97%D7%AA_%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi\">User:Dovi</a> at Hebrew Wikisource. Please check the documentation notes before reporting an error.",
              "formatAsPoetry": "",
              "digitizedBySefaria": "",
              "method": "",
              "heversionSource": "",
              "versionUrl": "",
              "versionTitleInHebrew": "מקרא על פי המסורה",
              "versionNotesInHebrew": "",
              "shortVersionTitle": "",
              "shortVersionTitleInHebrew": "",
              "extendedNotes": "",
              "extendedNotesHebrew": "",
              "purchaseInformationImage": "",
              "purchaseInformationURL": "",
              "hasManuallyWrappedRefs": "",
              "actualLanguage": "he",
              "languageFamilyName": "hebrew",
              "isSource": true,
              "isPrimary": true,
              "direction": "rtl",
              "language": "he",
              "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94",
              "versionTitle": "Miqra according to the Masorah",
              "text": [],
              "firstSectionRef": "Obadiah 1"
            }
          ],
          "available_versions": [],
          "ref": "Obadiah",
          "heRef": "עובדיה",
          "sections": [],
          "toSections": [],
          "sectionRef": "Obadiah",
          "heSectionRef": "עובדיה",
          "firstAvailableSectionRef": "Obadiah 1",
          "isSpanning": false,
          "spanningRefs": [],
          "next": "Obadiah 1",
          "prev": "Obadiah 1",
          "title": "Obadiah",
          "book": "Obadiah",
          "heTitle": "עובדיה",
          "primary_category": "Tanakh",
          "type": "Tanakh",
          "indexTitle": "Obadiah",
          "categories": [
            "Tanakh",
            "Prophets"
          ],
          "heIndexTitle": "עובדיה",
          "isComplex": false,
          "isDependant": false,
          "order": [
            18,
            13
          ],
          "collectiveTitle": "",
          "heCollectiveTitle": "",
          "alts": [],
          "lengths": [
            1,
            21
          ],
          "length": 1,
          "textDepth": 2,
          "sectionNames": [
            "Chapter",
            "Verse"
          ],
          "addressTypes": [
            "Perek",
            "Pasuk"
          ],
          "titleVariants": [
            "Ovadiah",
            "Ob.",
            "Oba.",
            "Ovadyah",
            "Ovadia",
            "Ovadya",
            "Abdias",
            "Obad",
            "Obadiah"
          ],
          "heTitleVariants": [
            "עובדיה"
          ],
          "index_offsets_by_depth": {},
          "warnings": []
        }
      },
      "v3AvailableVersionsTextJson": {
        "title": "Root Type for v3AvailableVersionsTextJson",
        "description": "Data returned in the `available_versions` field of the `v3` `texts` API. This contains all of the available versions for a given text, not just the required versions. ",
        "type": "object",
        "allOf": [
          {
            "type": "object",
            "properties": {
              "status": {
                "type": "string"
              },
              "priority": {
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "format": "int32",
                    "type": "integer"
                  }
                ]
              },
              "license": {
                "type": "string"
              },
              "versionNotes": {
                "type": "string"
              },
              "formatAsPoetry": {
                "type": "string"
              },
              "digitizedBySefaria": {
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "boolean"
                  }
                ]
              },
              "method": {
                "type": "string"
              },
              "heversionSource": {
                "type": "string"
              },
              "versionUrl": {
                "type": "string"
              },
              "versionTitleInHebrew": {
                "type": "string"
              },
              "versionNotesInHebrew": {
                "type": "string"
              },
              "shortVersionTitle": {
                "type": "string"
              },
              "shortVersionTitleInHebrew": {
                "type": "string"
              },
              "extendedNotes": {
                "type": "string"
              },
              "extendedNotesHebrew": {
                "type": "string"
              },
              "purchaseInformationImage": {
                "type": "string"
              },
              "purchaseInformationURL": {
                "type": "string"
              },
              "hasManuallyWrappedRefs": {
                "type": "string"
              },
              "actualLanguage": {
                "type": "string"
              },
              "languageFamilyName": {
                "description": "The overarching family for the specific language detailed in `actualLanguage`. For example, `Arabic` would be the overarching `languageFamily` for `judeo-arabic`.",
                "type": "string"
              },
              "isSource": {
                "type": "boolean"
              },
              "isPrimary": {
                "type": "boolean"
              },
              "direction": {
                "type": "string"
              },
              "language": {
                "type": "string"
              },
              "title": {
                "description": "The title of the book.",
                "type": "string",
                "example": "Esther"
              },
              "versionSource": {
                "type": "string"
              },
              "versionTitle": {
                "type": "string"
              }
            }
          },
          {
            "$ref": "#/components/schemas/v3TextVersionsJSON"
          }
        ],
        "example": {
          "status": "locked",
          "priority": 3,
          "license": "CC-BY-NC",
          "versionNotes": "<a href=\"http://purl.org/jps/rjps-preface\">Read the Preface to the Revised JPS Edition</a>\n<br><br>\n<a href=\"http://purl.org/jps/gender\">Read the Notes on Gender in Translation for the Revised JPS Edition</a>\n<br><br>\n<a href=\"https://www.sefaria.org/collections/commentary-on-the-usage-and-rendering-of-%D7%90%D7%99%D7%A9?tab=sheets\">Read a Commentary on the Hebrew word ’ish in the Revised JPS Edition</a>",
          "formatAsPoetry": "",
          "digitizedBySefaria": "",
          "method": "",
          "heversionSource": "",
          "versionUrl": "",
          "versionTitleInHebrew": "",
          "versionNotesInHebrew": "",
          "shortVersionTitle": "Revised JPS, 2023",
          "shortVersionTitleInHebrew": "",
          "extendedNotes": "",
          "extendedNotesHebrew": "",
          "purchaseInformationImage": "https://storage.googleapis.com/sefaria-physical-editions/JPS-Tanakh-Gender-Sensitive-Edition-Cover-300x450.jpg",
          "purchaseInformationURL": "https://jps.org/books/the-jps-tanakh-gender-sensitive-edition/",
          "hasManuallyWrappedRefs": "",
          "actualLanguage": "en",
          "languageFamilyName": "english",
          "isSource": false,
          "isPrimary": false,
          "direction": "ltr",
          "language": "en",
          "title": "Obadiah",
          "versionSource": "https://jps.org/books/the-jps-tanakh-gender-sensitive-edition/",
          "versionTitle": "THE JPS TANAKH: Gender-Sensitive Edition"
        }
      },
      "v3TextVersionsJSON": {
        "title": "Root Type for v3TextVersionsJSON",
        "description": "",
        "type": "object",
        "properties": {
          "status": {
            "description": "Whether or not the text is `\"locked\"` for further edits from the community. ",
            "type": "string"
          },
          "priority": {
            "description": "The priority assigned to a version of the text. A higher number will have the text appear higher within the listing of available versions for a specific text on the Sefaria website. (i.e. `Esther A` with a priority of `2`, will appear before `Esther B`, with a priority of `1`)",
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "number",
                "format": "float"
              }
            ]
          },
          "license": {
            "description": "The license for the text, in terms of copyright, and distribution. ",
            "type": "string",
            "example": "Public Domain"
          },
          "versionNotes": {
            "description": "Notes on the version",
            "type": "string",
            "example": "© Kehot Publication Society"
          },
          "formatAsPoetry": {
            "description": "A boolean indicating whether or not the text (or portions of it) are formatted as poetry.",
            "oneOf": [
              {
                "type": "boolean"
              },
              {
                "type": "string"
              }
            ]
          },
          "digitizedBySefaria": {
            "description": "An indicator of whether or not Sefaria digitized the text, versus acquiring an already digital copy of a text. ",
            "oneOf": [
              {
                "type": "boolean"
              },
              {
                "type": "string"
              }
            ]
          },
          "method": {
            "type": "string"
          },
          "heversionSource": {
            "type": "string"
          },
          "versionUrl": {
            "description": "URl for the version",
            "type": "string"
          },
          "versionTitleInHebrew": {
            "type": "string"
          },
          "versionNotesInHebrew": {
            "type": "string"
          },
          "shortVersionTitle": {
            "type": "string"
          },
          "shortVersionTitleInHebrew": {
            "type": "string"
          },
          "extendedNotes": {
            "type": "string"
          },
          "extendedNotesHebrew": {
            "type": "string"
          },
          "purchaseInformationImage": {
            "description": "A URL pointing to an image of the hardcopy text available for purchase.",
            "type": "string",
            "example": "https://storage.googleapis.com/sefaria-physical-editions/touger-mishneh-torah-hilkhot-teshuvah-purchase-img.png"
          },
          "purchaseInformationURL": {
            "description": "A URL pointing to where one can purchase a hardcopy of this text. ",
            "type": "string",
            "example": "https://moznaim.com/products/mishneh-torah-rambam"
          },
          "hasManuallyWrappedRefs": {
            "type": "string"
          },
          "actualLanguage": {
            "description": "The [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) language code for the language of the text. We default to 2 letter codes when available, and 3 letter codes when they are not.",
            "type": "string",
            "example": "de"
          },
          "languageFamilyName": {
            "description": "The overarching family for the specific language detailed in `actualLanguage`. For example, `Arabic` would be the overarching family for `judeo-arabic`. ",
            "type": "string"
          },
          "isSource": {
            "type": "boolean"
          },
          "isPrimary": {
            "description": "Indicates whether or not this version of the text is determined as the primary version in the Sefaria database.",
            "type": "boolean"
          },
          "direction": {
            "description": "The direction of the text, either `ltr` (left-to-right) or `rtl` (right-to-left). Examples of `ltr` languages include English, French and German. Examples of `rtl` languages are Hebrew and Arabic. ",
            "type": "string",
            "example": "ltr"
          },
          "language": {
            "description": "A holdover from the `v2` API which will eventually be deprecated. This used to indicate the direction of the text, with `en` indicating texts written from left-to-right, and `he` indicating texting written from right-to-left. ",
            "type": "string",
            "example": "`he`\n`en`"
          },
          "versionSource": {
            "description": "The original source of the digital text. ",
            "type": "string",
            "example": "http://kehot.com/"
          },
          "versionTitle": {
            "description": "The English title of the Version of text. ",
            "type": "string",
            "example": "Mischnajot mit deutscher Übersetzung und Erklärung. Berlin 1887-1933 [de]"
          },
          "text": {
            "description": "An array of strings containing the text of the specific version. \n\nIf a segment `Ref` was passed, the array returned will be one-dimensional and contain a string with the specific segment level text. \n\nIf a bottom level section `Ref` was passed, the array returned will be a two-dimensional array, a list of lists of strings. The outer layer of the array represents the section, and the inner arrays represent the segments. ",
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "oneOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  ]
                }
              },
              {
                "type": "string"
              }
            ],
            "example": [
              [
                "<b>Von welcher Zeit ab liest man das Schema.</b> Zu Schema wird Deuter. 6, 4—9 <span dir=\"ltr\">שמע</span> , 2. Deuter. 11, 13—21 <span dir=\\\"rtl\\\">והיה אם שמוע</span> und 3. Numeri 15, 37—41 <span dir=\\\"rtl\\\">ויאמר</span> gerechnet.\",\n\"<b>da die Priester eintreten.</b> Nämlich unreine Priester, welche nicht gebadet und gereinigt hatten und erst mit dem Erscheinen der Sterne ihre Hebe essen durften (Lev. 22, 7).",
                "<b>bis zu Ende der ersten Nachtwache.</b> Man teilte die Nacht in drei Wachen.",
                "<b>Die Weisen.</b> So oft hier der Ausdruck die Weisen vorkommt, verstehe man darunter die große Mehrzahl der Weisen, sofern sie nach allgemein geltender Ansicht entscheidet.",
                "<b>Bis die Morgenröte.</b> Säule der Morgenröte im Hebr. und Arab.\",\n\"<b>aufsteigt.</b> Der Grund der Meinungsverschiedenheit liegt in der Deutung des <span dir=\\\"rtl\\\">ובשכבך</span> . R. Elieser erklärt: Wenn du dich niederlegst; dies geschieht bei den meisten Menschen bis Ende der ersten Nachtwache. Nach den Weisen und so auch nach R. Gamliel heißt <span dir=\\\"rtl\\\">ובשכבך</span> , wenn du liegst; demnach wäre es die ganze Nacht erlaubt das Schema zu lesen, jedoch die Weisen erlauben es nur bis Mitternacht, um der Gesetzesübertretung vorzubeugen, was R. Gamliel nicht für nötig hält.",
                "<b>Das Aufdampfen des Fettes und der Glieder.</b> Stücke der Opfertiere, (Lev. 6, 2; 7, 2.)",
                "<b>nur an demselben Tage gegessen werden darf.</b> D. h. am Tage der Darbringung (Lev. 7, 15).",
                "<b>Um die Menschen von der Übertretung fern zu halten.</b> Nämlich, sie setzten eine kürzere Frist, damit man sich auf keinen Fall verspäte."
              ],
              [
                "<b>Sobald man zwischen himmelblau und weiß unterscheiden kann; R. Elieser sagt: Zwischen himmelblau und lauchgrün; (und beendet das Lesen.</b> <span dir=\\\"rtl\\\">וגומרה</span> , wenn die Lesart richtig ist, bezieht es sich auf <span dir=\\\"rtl\\\">פרשת שמע</span> .",
                "<b>erst um drei Stunden aufzustehen.</b> Das Gesetz <span dir=\\\"rtl\\\">ובקומך</span> meint er, bedeute »bis Jedermann aufgestanden ist.« — Die Stunden sind hier je nach der Jahreszeit von verschiedener Länge; denn man teilte den Tag und die Nacht in je 12 Teile. Wenn also z. B. der Tag 8 und die Nacht 16 Stunden hat, so wird die Tagesstunde zu 8/12 gewöhnliche Stunden = 40 Minuten, die Nachtstunde aber zu 16/12 gewöhnliche Stunden = 80 Minuten gerechnet. Solche Stunden werden <span dir=\\\"rtl\\\">שעות זמניות</span> = Zeitstunden genannt\",\n\"<b>büsst nichts ein.</b> D. h. er möge immerhin die dazu gehörigen Vor- und Nachgebete sprechen (nach Einigen jedoch nur bis Ende der. 4. Stunde) obgleich deren Zeit vorüber ist."
              ],
              [
                "<b>brachte mich aber in Lebensgefahr durch Räuber.</b> Wäre beinahe von Räubern getötet worden."
              ],
              [
                "<b>Am Morgen spricht man zwei Segenssprüche voran.</b> <span dir=\\\"rtl\\\">לפניה</span> bezieht sich auf <span dir=\\\"rtl\\\">פרשת שמע</span> .",
                "<b>und zwei nachher.</b> Nämlich des Morgens <span dir=\\\"rtl\\\">אהבה רבה ,יוצר אור</span> und <span dir=\\\"rtl\\\">גאולה</span> Des Abends <span dir=\\\"rtl\\\">מעריב גאולה ,אהבת עולם ,ערבים</span> und <span dir=\\\"rtl\\\">השכיבנו</span> .",
                "<b>eine Schlussformel anzubringen.</b> Die ganze Stelle von <span dir=\\\"rtl\\\">מקום שאמרו</span> an wird hier als ein allgemeines, auf alle anderen <span dir=\\\"rtl\\\">ברכות</span> sich auch beziehendes Gesetz mit eingeschaltet. — Unter Schlussformel versteht man einen mit <span dir=\\\"rtl\\\">ברוך</span> anfangenden Satz, der das Ganze schliesst. Z. B. <span dir=\\\"rtl\\\">ברוך אתה ה׳ גאל ישראל</span> ."
              ],
              [
                "<b>Man gedenke des Auszuges aus Ägypten auch in der Nachtzeit.</b> D. h. es ist Pflicht auch in der Nacht <span dir=\\\"rtl\\\">פרשת ציצית</span> zu sprechen, weil darin des Auszuges Erwähnung geschieht.",
                "<b>Ich bin jetzt beinah.</b> So nach einer Baraita im Jeruschalmi. Der babylonische Talmud jedoch sagt: R. Elasar ben Asarja sei damals nur 18 Jahre alt, aber bereits grau gewesen, wie ein Greis von siebzig Jahren. Nach Maimonides ist er durch vieles Studieren grau geworden."
              ]
            ]
          },
          "firstSectionRef": {
            "description": "The first available `Ref` to the section of text passed in the API. ",
            "type": "string"
          }
        },
        "example": {
          "status": "locked",
          "priority": 2,
          "license": "CC-BY-SA",
          "versionNotes": "<i>Miqra According to the Masorah</i> (MAM) is a digital Hebrew edition of the Tanakh based on the Aleppo Codex and related manuscripts. It is designed for readers, and as such it contains added elements to aid vocalization of the text. For instance: When an accent is marked in an unstressed syllable, an extra accent is added in the proper place (<i>pashta</i>, <i>zarqa</i>, <i>segol</i>, <i>telisha</i>). <i>Legarmeih</i> and <i>paseq</i> are visibly distinguished. <i>Qamaz qatan</i> is indicated by its designated Unicode character (alternatives are documented where traditions differ about its application).<br>The text of MAM is fully documented. The <a href=\"https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94/%D7%9E%D7%99%D7%93%D7%A2_%D7%A2%D7%9C_%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94_%D7%96%D7%95\">complete introduction</a> to the edition (Hebrew) explains the types of editorial decisions that have been made and the reasons for them (<a href=\"https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#About_this_Edition_(English_Abstract)\">English abstract</a>). In addition, every word in the Bible about which there is some textual concern or ambiguity includes a documentation note; these notes can be viewed conveniently <a href=\"https://bdenckla.github.io/MAM-with-doc/\">here</a>. If an error is discovered, it may be reported to <a href=\"https://he.wikisource.org/wiki/%D7%A9%D7%99%D7%97%D7%AA_%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi\">User:Dovi</a> at Hebrew Wikisource. Please check the documentation notes before reporting an error.",
          "formatAsPoetry": "",
          "digitizedBySefaria": "",
          "method": "",
          "heversionSource": "",
          "versionUrl": "",
          "versionTitleInHebrew": "מקרא על פי המסורה",
          "versionNotesInHebrew": "",
          "shortVersionTitle": "",
          "shortVersionTitleInHebrew": "",
          "extendedNotes": "",
          "extendedNotesHebrew": "",
          "purchaseInformationImage": "",
          "purchaseInformationURL": "",
          "hasManuallyWrappedRefs": "",
          "actualLanguage": "he",
          "languageFamilyName": "hebrew",
          "isSource": true,
          "isPrimary": true,
          "direction": "rtl",
          "language": "he",
          "versionSource": "https://he.wikisource.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:Dovi/%D7%9E%D7%A7%D7%A8%D7%90_%D7%A2%D7%9C_%D7%A4%D7%99_%D7%94%D7%9E%D7%A1%D7%95%D7%A8%D7%94",
          "versionTitle": "Miqra according to the Masorah",
          "text": [],
          "firstSectionRef": "Obadiah 1"
        }
      }
    }
  }
}
```
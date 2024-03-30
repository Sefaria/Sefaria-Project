import django

django.setup()

from sefaria.helper.topic import add_image_to_topic

## Adding images

hardcodedTopicImagesMap = {
    'prayer': {'image_uri': 'https://storage.googleapis.com/pecha-topic-pictures/topics/losar.jpg',
                      'enCaption': 'losar caption',
                      'heCaption': 'ལོ་གསར་'},

    'Author': {'image_uri': 'https://storage.googleapis.com/pecha-topic-pictures/topics/gonpo.jpg',
                   'enCaption': 'Gonpo Ludrup',
                   'heCaption': 'མགོན་པོ་ཀླུ་གྲུབ་'},

    'the-four-species': {'image_uri': 'https://storage.googleapis.com/img.sefaria.org/topics/the-four-species.jpg',
                         'enCaption': 'Etrog container, K B, late 19th century, Germany. The Jewish Museum, Gift of Dr. Harry G. Friedman',
                         'heCaption': 'תיבת אתרוג, סוף המאה ה19, גרמניה. המוזיאון היהודי בניו יורק, מתנת דר. הארי ג. פרידמן  '},

    'sukkot': {'image_uri': 'https://storage.googleapis.com/img.sefaria.org/topics/sukkot.jpg',
               'enCaption': 'Detail of a painting of a sukkah. Image taken from f. 316v of Forli Siddur. 1383, Italian rite. The British Library',
               'heCaption': 'פרט ציור של סוכה עם שולחן פרוש ושלוש דמויות. דימוי מתוך סידור פורלי, 1383 איטליה'},

    'simchat-torah': {'image_uri': 'https://storage.googleapis.com/img.sefaria.org/topics/simchat-torah.jpg',
                      'enCaption': 'Rosh Hashanah postcard: Hakafot, Haim Yisroel Goldberg (1888-1943) Publisher: Williamsburg Post Card Co. Germany, ca. 1915 Collection of Yeshiva University Museum',
                      'heCaption': 'גלויה לראש השנה: הקפות, חיים גולדברג, גרמניה 1915, אוסף ישיבה יוניברסיטי'},

    'shabbat': {'image_uri': 'https://storage.googleapis.com/img.sefaria.org/topics/shabbat.jpg',
                'enCaption': 'Friday Evening, Isidor Kaufmann, Austria c. 1920. The Jewish Museum, Gift of Mr. and Mrs. M. R. Schweitzer',
                'heCaption': 'שישי בערב, איזידור קאופמן, וינה 1920. המוזיאון היהודי בניו יורק, מתנת  מר וגברת מ.ר. שוויצר'},

}

for topic in hardcodedTopicImagesMap:
    add_image_to_topic(topic,
                       image_uri=hardcodedTopicImagesMap[topic]["image_uri"],
                       en_caption=hardcodedTopicImagesMap[topic]["enCaption"],
                       he_caption=hardcodedTopicImagesMap[topic]["heCaption"])
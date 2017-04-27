# encoding=utf-8

import csv
import re
from optparse import OptionParser
from sklearn.feature_extraction.text import TfidfVectorizer

from sefaria.model import *


def tokenizer(s):
    s = re.sub(ur'<.+?>', u'', s)
    s = re.sub(ur'\(.+?\)', u'', s).strip()
    return re.split('\s+', s)

# http://www.markhneedham.com/blog/2015/02/15/pythonscikit-learn-calculating-tfidf-on-how-i-met-your-mother-transcripts/
def derive_names(rows):
    sugyah_refs = [Ref(d["ref"]) for d in rows if d["type"] == "Sugya"]
    sugyah_texts = [s.text("he").as_string() for s in sugyah_refs]
    vectorizer = TfidfVectorizer(min_df=1, tokenizer=tokenizer, lowercase=False, ngram_range=(2,3))
    tdm = vectorizer.fit_transform(sugyah_texts)
    feature_names = vectorizer.get_feature_names()
    dense = tdm.todense()
    for sugnum in range(len(dense)):
        print sugyah_refs[sugnum]
        sug = dense[sugnum].tolist()[0]
        phrase_scores = [pair for pair in zip(range(0, len(sug)), sug) if pair[1] > 0]
        sorted_phrase_scores = sorted(phrase_scores, key=lambda t: t[1] * -1)
        for phrase, score in [(feature_names[word_id], score) for (word_id, score) in sorted_phrase_scores][:3]:
            print(u'{0: <20} {1}'.format(phrase, score))

if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tractate", dest="tractate", help="Name of tractate to parse. Input 'all' to parse everything")

    options, user_args = parser.parse_args()

    if options.tractate:
        mesechtot = [options.tractate]
    else:
        mesechtot = ["Beitzah", "Chagigah", "Gittin", "Ketubot", "Kiddushin",
                     "Megillah", "Moed Katan", "Nazir", "Nedarim", "Rosh Hashanah", "Sotah", "Sukkah", "Taanit",
                     "Yevamot", "Yoma", "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin"]

    for m in mesechtot:
        print m

        with open('../data/sugyot/{}.csv'.format(m), 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            rows = [row for row in reader]
            derive_names(rows)
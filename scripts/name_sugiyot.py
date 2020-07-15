# encoding=utf-8

import csv
import re

from optparse import OptionParser
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.decomposition import NMF, LatentDirichletAllocation

from sefaria.model import *


n_topics = 10
n_top_words = 20


def tokenizer(s):
    s = re.sub(r'<.+?>', '', s)
    s = re.sub(r'\(.+?\)', '', s).strip()
    return re.split('\s+', s)


def _word_ngrams(tokens, stop_words=None, min_n=2, max_n=4):
    """Turn tokens into a sequence of n-grams after stop words filtering"""
    # handle stop words
    if stop_words is not None:
        tokens = [w for w in tokens if w not in stop_words]

    # handle token n-grams
    if max_n != 1:
        original_tokens = tokens
        tokens = []
        n_original_tokens = len(original_tokens)
        for n in range(min_n,
                        min(max_n + 1, n_original_tokens + 1)):
            for i in range(n_original_tokens - n + 1):
                tokens.append(" ".join(original_tokens[i: i + n]))

    return tokens


def analyzer(doc):
    # Take an array doc, and build n-grams out of that
    # preprocess = self.build_preprocessor()
    # stop_words = self.get_stop_words()

    ngram_set = set()
    assert isinstance(doc, list)
    for subdoc in doc:
        ngram_set.update(_word_ngrams(tokenizer(subdoc)))
    return list(ngram_set)


def print_top_words(model, feature_names, n_top_words):
    for topic_idx, topic in enumerate(model.components_):
        print(("Topic #%d:" % topic_idx))
        print((" ".join([feature_names[i]
                        for i in topic.argsort()[:-n_top_words - 1:-1]])))
    print()


def derive_names(rows):
    sugyah_refs = [Ref(d["ref"]) for d in rows if d["type"] == "Sugya"]

    # Work with flat texts
    sugyah_texts = [s.text("he").as_string() for s in sugyah_refs]
    vectorizer = TfidfVectorizer(min_df=1, tokenizer=tokenizer, lowercase=False, ngram_range=(2, 4))
    tfidf = vectorizer.fit_transform(sugyah_texts)

    # Work with segment-by-segment arrays (poor results, why?)
    # sugyah_arrays = [s.text("he").ja().flatten_to_array() for s in sugyah_refs]
    # vectorizer = TfidfVectorizer(min_df=1, analyzer=analyzer, lowercase=False, ngram_range=(2, 4))
    # tfidf = vectorizer.fit_transform(sugyah_arrays)

    tfidf_feature_names = vectorizer.get_feature_names()

    # http://www.markhneedham.com/blog/2015/02/15/pythonscikit-learn-calculating-tfidf-on-how-i-met-your-mother-transcripts/
    dense = tfidf.todense()
    for sugnum in range(len(dense)):
        print(sugyah_refs[sugnum])
        sug = dense[sugnum].tolist()[0]
        phrase_scores = [pair for pair in zip(list(range(0, len(sug))), sug) if pair[1] > 0]
        sorted_phrase_scores = sorted(phrase_scores, key=lambda t: t[1] * -1)
        for phrase, score in [(tfidf_feature_names[word_id], score) for (word_id, score) in sorted_phrase_scores][:3]:
            print(('{0: <20} {1}'.format(phrase, score)))



    """
    # http://scikit-learn.org/stable/auto_examples/applications/topics_extraction_with_nmf_lda.html#sphx-glr-auto-examples-applications-topics-extraction-with-nmf-lda-py
    nmf = NMF(n_components=n_topics, random_state=1, alpha=.1, l1_ratio=.5).fit(tfidf)

    print("\nTopics in NMF model:")
    print_top_words(nmf, tfidf_feature_names, n_top_words)

    tf_vectorizer = CountVectorizer(tokenizer=tokenizer, lowercase=False, ngram_range=(2, 4))


    tf = tf_vectorizer.fit_transform(sugyah_texts)
    lda = LatentDirichletAllocation(n_topics=n_topics, max_iter=5,
                                    learning_method='online',
                                    learning_offset=50.,
                                    random_state=0)
    lda.fit(tf)

    print("\nTopics in LDA model:")
    tf_feature_names = tf_vectorizer.get_feature_names()
    print_top_words(lda, tf_feature_names, n_top_words)
    """


if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-t", "--tractate", dest="tractate", help="Name of tractate to parse. Input 'all' to parse everything")

    options, user_args = parser.parse_args()

    if options.tractate:
        mesechtot = [options.tractate]
    else:
        mesechtot = ["Sukkah", "Beitzah", "Chagigah", "Gittin", "Ketubot", "Kiddushin",
                     "Megillah", "Moed Katan", "Nazir", "Nedarim", "Rosh Hashanah", "Sotah", "Taanit",
                     "Yevamot", "Yoma", "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin"]
    rows = []

    for m in mesechtot:
        print(m)
        with open('../data/sugyot/{}.csv'.format(m), 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            rows += [row for row in reader]
    derive_names(rows)
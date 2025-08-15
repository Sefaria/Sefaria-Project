import re
try:
    import spacy
    from spacy.tokenizer import Tokenizer
except ImportError:
    spacy = Tokenizer = None


def inner_punct_tokenizer_factory():
    def inner_punct_tokenizer(nlp):
        # infix_re = spacy.util.compile_infix_regex(nlp.Defaults.infixes)
        infix_re = re.compile(r'''[.,?!:;…‘’`“”"'~–—\-‐‑‒־―⸺⸻/()<>]''')
        prefix_re = spacy.util.compile_prefix_regex(nlp.Defaults.prefixes)
        suffix_re = spacy.util.compile_suffix_regex(nlp.Defaults.suffixes)

        return Tokenizer(nlp.vocab, prefix_search=prefix_re.search,
                         suffix_search=suffix_re.search,
                         infix_finditer=infix_re.finditer,
                         token_match=None)
    return inner_punct_tokenizer


if spacy:
    spacy.registry.tokenizers("inner_punct_tokenizer")(inner_punct_tokenizer_factory)


def get_spacy_tokenizer():
    """
    language agnostic spacy tokenizer that uses inner punctuation
    @return:
    """
    nlp = spacy.blank("en")
    return inner_punct_tokenizer_factory()(nlp)

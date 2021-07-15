import spacy, re
from spacy.tokenizer import Tokenizer

@spacy.registry.tokenizers("custom_tokenizer")
def custom_tokenizer_factory():
    def custom_tokenizer(nlp):
        tag_re = r'<[^>]+>'
        class_re = r'<[a-z]+ class="[a-z]+">'
        prefix_re = re.compile(rf'''^(?:[\[({{:"'\u05F4\u05F3§\u05c0\u05c3]|{tag_re}|class="[a-zA-Z\-]+">)''')
        suffix_re =  re.compile(rf'''(?:[\])}}.,;:?!"'\u05F4\u05F3\u05c0\u05c3]|{tag_re})$''')
        infix_re = re.compile(rf'''([-~]|{tag_re})''')
        tokenizer = Tokenizer(nlp.vocab, prefix_search=prefix_re.search,
                                    suffix_search=suffix_re.search,
                                    infix_finditer=infix_re.finditer,
                                    token_match=None)
        return tokenizer
    return custom_tokenizer
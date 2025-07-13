from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import cached_property
from sefaria.spacy_function_registry import get_spacy_tokenizer

TOKENIZER = get_spacy_tokenizer()


class _Subspannable(ABC):
    """
    Abstract base class for objects that contain text and can be subspanned (meaning, they can be sliced to create smaller spans).
    """

    @property
    @abstractmethod
    def text(self) -> str:
        pass

    @property
    @abstractmethod
    def doc(self) -> 'NEDoc':
        pass

    @abstractmethod
    def _get_subspan_offset(self) -> int:
        pass

    def word_length(self) -> int:
        """
        Returns the number of words in the text.
        Words are defined as runs of non-whitespace characters.
        """
        return len(self.__word_spans)

    def subspan(self, item: slice, span_label: str = None) -> 'NESpan':
        if isinstance(item, slice):
            start = item.start if item.start is not None else 0
            end = item.stop
        else:
            raise TypeError("Item must be a slice")
        start += self._get_subspan_offset()
        if end is not None:
            end += self._get_subspan_offset()
        return NESpan(self.doc, start, end, span_label)

    @cached_property
    def __word_spans(self):
        doc = TOKENIZER(self.text)
        # extract start and end character indices of each word
        spans = [(token.idx, token.idx+len(token)) for token in doc if not token.is_space]
        return spans

    def subspan_by_word_indices(self, word_slice: slice) -> 'NESpan':
        """
        Return an NESpan covering words [start_word, end_word), where words
        are runs of non-whitespace. 0-based, end_word is exclusive.
        """
        spans = self.__word_spans
        try:
            word_span_slice = spans[word_slice]
        except IndexError:
            raise IndexError(f"Word indices out of range: {word_slice}. Document has {len(self.__word_spans)} words.")
        if not word_span_slice:
            # slice is empty, return a span of zero length
            start_char = end_char = 0
        else:
            start_char = word_span_slice[0][0]
            end_char = word_span_slice[-1][1]
        return self.subspan(slice(start_char, end_char))


class NEDoc(_Subspannable):

    def __init__(self, text: str):
        self.__text = text

    @property
    def text(self) -> str:
        return self.__text

    @property
    def doc(self):
        return self

    def _get_subspan_offset(self) -> int:
        return 0


@dataclass
class NESpan(_Subspannable):
    """
    Span of text which represents a named entity before it has been identified with an object in Sefaria's DB
    """
    def __init__(self, doc: NEDoc, start: int, end: int, label: str = None):
        """
        :param doc: The document containing the text
        :param start: Start index of the span in the text
        :param end: End index of the span in the text
        :param label
        """
        self.__doc = doc
        self.__start = start
        self.__end = end
        self.__label = label

    def __str__(self):
        return f"NESpan(text='{self.text}', label='{self.label}', range={self.range})"

    @property
    def doc(self) -> NEDoc:
        return self.__doc

    @property
    def text(self) -> str:
        return self.__doc.text[self.__start:self.__end]

    @property
    def label(self) -> str:
        return self.__label

    @property
    def range(self) -> [int, int]:
        return self.__start, self.__end

    def __hash__(self):
        return hash((self.__doc.text, self.__start, self.__end, self.__label))

    def _get_subspan_offset(self) -> int:
        return self.__start

import django
django.setup()
import pytest
from ne_span import NEDoc, NESpan


class TestNEDoc:
    @pytest.mark.parametrize(
        "slc,expected_text,expected_range",
        [
            (slice(0, 4), "This", (0, 4)),
            (slice(0, 0), "", (0, 0)),
        ]
    )
    def test_subspan(self, slc, expected_text, expected_range):
        doc = NEDoc("This is a test document.")
        span = doc.subspan(slc)
        assert span.text == expected_text
        assert span.range == expected_range

    @pytest.mark.parametrize(
        "slc,expected_text,expected_range",
        [
            (slice(1, 3), "is a", (5, 9)),
            (slice(2, 2), "", (0, 0)),
        ]
    )
    def test_subspan_by_word_indices(self, slc, expected_text, expected_range):
        doc = NEDoc("This is a test document.")
        span = doc.subspan_by_word_indices(slc)
        assert span.text == expected_text
        assert span.range == expected_range

    def test_handles_out_of_range_word_indices(self):
        doc = NEDoc("This is a test document.")
        with pytest.raises(IndexError):
            doc.subspan_by_word_indices(slice(10, 12))

    def test_creates_correct_hash_for_span(self):
        doc = NEDoc("This is a test document.")
        span = NESpan(doc, 0, 4, "test_label")
        assert hash(span) == hash(("This is a test document.", 0, 4, "test_label"))


class TestNESpan:
    @pytest.mark.parametrize(
        "text,start,end,label,expected_text,expected_label,expected_range",
        [
            ("Abraham went to Egypt.", 0, 7, "PERSON", "Abraham", "PERSON", (0, 7)),
            ("Abraham went to Egypt.", 8, 12, "ACTION", "went", "ACTION", (8, 12)),
            ("Abraham went to Egypt.", 13, 15, None, "to", None, (13, 15)),
        ]
    )
    def test_properties(self, text, start, end, label, expected_text, expected_label, expected_range):
        doc = NEDoc(text)
        span = NESpan(doc, start, end, label)
        assert span.text == expected_text
        assert span.label == expected_label
        assert span.range == expected_range
        assert span.doc is doc

    def test_hash_equality_and_inequality(self):
        doc = NEDoc("Abraham went to Egypt.")
        span1 = NESpan(doc, 0, 7, "PERSON")
        span2 = NESpan(doc, 0, 7, "PERSON")
        span3 = NESpan(doc, 0, 7, "LOCATION")
        assert hash(span1) == hash(span2)
        assert hash(span1) != hash(span3)

    @pytest.mark.parametrize(
        "text,start,end,slice_args,expected_text,expected_range",
        [
            ("Abraham went to Egypt.", 0, 7, (0, 3), "Abr", (0, 3)),
            ("Abraham went to Egypt.", 8, 12, (0, 2), "we", (0, 2)),
        ]
    )
    def test_subspan(self, text, start, end, slice_args, expected_text, expected_range):
        doc = NEDoc(text)
        span = NESpan(doc, start, end, "LABEL")
        sub = span.subspan(slice(*slice_args))
        assert isinstance(sub, NESpan)
        assert sub.text == expected_text
        assert sub.range == expected_range
        assert sub.doc.text == span.text

    def test_subspan_by_word_indices(self):
        doc = NEDoc("Abraham went to Egypt.")
        span = NESpan(doc, 0, len(doc.text), "EVENT")
        sub = span.subspan_by_word_indices(slice(2, 4))
        assert sub.text == "to Egypt"
        assert sub.doc.text == span.text

    def test_word_length(self):
        doc = NEDoc("Abraham went to Egypt.")
        span = NESpan(doc, 0, len(doc.text), "EVENT")
        assert span.word_length() == 5

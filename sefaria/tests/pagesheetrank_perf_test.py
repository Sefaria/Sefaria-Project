# sefaria/tests/pagesheetrank_perf_test.py
"""The vectorized PageRank must match the legacy pure-Python implementation.

The legacy `create_web`/`step` pair is retained in pagesheetrank.py purely as
the reference implementation for these tests. The vectorized path must
reproduce its results EXACTLY, including two behaviours that look like bugs
but are the shipped semantics search ranking is calibrated on:

  1. in_links repeats each edge int(round(weight)) times, so a weight of 0.4
     is dropped entirely and 0.6 becomes 1.
  2. number_out_links accumulates the RAW float weight, so the matrix is
     round(w(k->j)) / out_total(k) -- a rounded numerator over an unrounded
     denominator.

Changing either is a separate decision, not a refactor.
"""
import numpy
import pytest

from sefaria import pagesheetrank as psr


def _legacy_pagerank(g, s=0.85, tolerance=0.00005, maxiter=100):
    """Drive the retained legacy create_web/step exactly as the old pagerank did."""
    w = psr.create_web(g)
    n = w.size
    p = numpy.matrix(numpy.ones((n, 1))) / n
    iteration, change = 1, 2
    while change > tolerance and iteration < maxiter:
        new_p = psr.step(w, p, s)
        change = numpy.sum(numpy.abs(p - new_p))
        p = new_p
        iteration += 1
    pr_list = list(numpy.squeeze(numpy.asarray(p)))
    return {k: v for k, v in zip([x[0] for x in g], pr_list)}


def _graph(d):
    """dict-of-dicts -> the list-of-items shape pagerank() consumes."""
    return list(d.items())


SIMPLE = {
    "a": {"b": 1, "c": 2},
    "b": {"c": 1},
    "c": {},
    "d": {"a": 3},
}

# every edge weight lands on a different side of int(round())
QUANTIZED = {
    "a": {"b": 0.4, "c": 0.6},   # 0.4 -> dropped, 0.6 -> 1
    "b": {"c": 1.5},             # banker's rounding: round(1.5) == 2
    "c": {"a": 2.4},             # -> 2
    "d": {},
}

DANGLING = {
    "a": {"b": 1},
    "b": {},          # dangling: no outgoing edges
    "c": {"a": 0.4},  # rounds to 0 -> contributes no in_link, but c is NOT dangling
}


@pytest.mark.parametrize("graph,name", [
    (SIMPLE, "simple"),
    (QUANTIZED, "quantized"),
    (DANGLING, "dangling"),
])
def test_vectorized_matches_legacy(graph, name):
    g = _graph(graph)
    legacy = _legacy_pagerank(g)
    new = psr.pagerank(g, s=0.85, tolerance=0.00005)

    assert set(new) == set(legacy), name
    for k in legacy:
        assert new[k] == pytest.approx(legacy[k], rel=1e-9, abs=1e-12), (
            "{}: rank for {!r} diverged: {} vs {}".format(name, k, new[k], legacy[k])
        )


def test_ranking_order_preserved():
    g = _graph(SIMPLE)
    legacy = sorted(_legacy_pagerank(g), key=lambda k: _legacy_pagerank(g)[k])
    new_scores = psr.pagerank(g, s=0.85, tolerance=0.00005)
    new = sorted(new_scores, key=lambda k: new_scores[k])
    assert new == legacy


def test_quantization_is_preserved():
    """A 0.4 edge must vanish and a 0.6 edge must count once -- same as legacy."""
    n, rows, cols, rounded_weights, out, dangling, keys = psr._build_pagerank_arrays(
        _graph({"a": {"b": 0.4, "c": 0.6}, "b": {}, "c": {}})
    )
    # in g[ref1] = {ref2: weight}, ref2 links INTO ref1 -- so out-degree accrues
    # on the source (b, c), and only the 0.6 edge survives int(round()).
    edges = {(int(r), int(c)): int(w) for r, c, w in zip(rows, cols, rounded_weights)}
    assert all(v > 0 for v in edges.values()), "zero-weight edges must not be stored"
    assert len(edges) == 1, "the 0.4 edge must vanish entirely"
    assert list(edges.values()) == [1], "the 0.6 edge must count exactly once"
    assert (int(rows[0]), int(cols[0])) == (keys.index("a"), keys.index("c"))

    # out_links keeps the RAW float weight, including the edge that rounded away
    assert out[keys.index("b")] == pytest.approx(0.4)
    assert out[keys.index("c")] == pytest.approx(0.6)
    assert out[keys.index("a")] == pytest.approx(0.0)


def test_dangling_detection_matches_legacy():
    g = _graph(DANGLING)
    w = psr.create_web(g)
    n, rows, cols, rounded_weights, out, dangling, keys = psr._build_pagerank_arrays(g)
    legacy_dangling = set(w.dangling_pages.keys())
    new_dangling = {i for i in range(n) if dangling[i]}
    assert new_dangling == legacy_dangling


def test_empty_graph_does_not_crash():
    assert psr.pagerank([], s=0.85, tolerance=0.00005) == {}


def test_start_year_cache_collapses_repeat_lookups():
    class FakeTP:
        def __init__(self, y): self.y = y
        def determine_year_estimate(self): return self.y

    calls = []

    class FakeIndex:
        def __init__(self, title, year): self.title, self._y = title, year
        def best_time_period(self):
            calls.append(self.title)
            return FakeTP(self._y)

    cache = {}
    idx = FakeIndex("Genesis", 1200)
    got = [psr._start_year(idx, cache) for _ in range(500)]

    assert got == [1200] * 500
    assert len(calls) == 1, "best_time_period must be called once per index, got {}".format(len(calls))


def test_start_year_falls_back_to_3000_without_time_period():
    class NoTP:
        title = "Unknown"
        def best_time_period(self): return None

    cache = {}
    assert psr._start_year(NoTP(), cache) == 3000
    assert psr._start_year(NoTP(), cache) == 3000  # cached, still 3000


def test_start_year_caches_per_title_not_globally():
    class FakeTP:
        def __init__(self, y): self.y = y
        def determine_year_estimate(self): return self.y

    class FakeIndex:
        def __init__(self, title, year): self.title, self._y = title, year
        def best_time_period(self): return FakeTP(self._y)

    cache = {}
    assert psr._start_year(FakeIndex("A", 100), cache) == 100
    assert psr._start_year(FakeIndex("B", 900), cache) == 900
    assert len(cache) == 2

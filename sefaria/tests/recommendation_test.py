from sefaria.model import *
from sefaria.recommendation_engine import RecommendationEngine

class TestClustering:

    def test_simple(self):
        trefs = ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:4']
        refs = [Ref(tref) for tref in trefs]
        clusters = RecommendationEngine.cluster_close_refs(refs, [None]*len(refs), dist_threshold=2)
        assert len(clusters) == 1

    def test_two_clusters(self):
        trefs = ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:5', 'Genesis 1:7']
        refs = [Ref(tref) for tref in trefs]
        clusters = RecommendationEngine.cluster_close_refs(refs, [None]*len(refs), dist_threshold=2)
        assert len(clusters) == 2
        assert clusters[0][0]['ref'].normal() == 'Genesis 1:1'
        assert clusters[1][0]['ref'].normal() == 'Genesis 1:5'

    def test_out_of_order(self):
        trefs = ['Genesis 1:5', 'Genesis 1:1', 'Exodus 1:1', 'Genesis 1:2', 'Genesis 1:7', 'Exodus 1:3']
        refs = [Ref(tref) for tref in trefs]
        clusters = RecommendationEngine.cluster_close_refs(refs, [None]*len(refs), dist_threshold=2)
        assert len(clusters) == 3
        assert clusters[0][0]['ref'].normal() == 'Genesis 1:1'
        assert clusters[1][0]['ref'].normal() == 'Genesis 1:5'
        assert clusters[2][0]['ref'].normal() == 'Exodus 1:1'

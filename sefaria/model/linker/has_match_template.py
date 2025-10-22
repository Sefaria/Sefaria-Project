class MatchTemplateMixin:
    """ Mixin for classes that have match templates. """
    MATCH_TEMPLATE_ALONE_SCOPES = {'any', 'alone'}

    def get_match_templates(self):
        from sefaria.model.linker.match_template import MatchTemplate
        for raw_match_template in getattr(self, 'match_templates', []):
            yield MatchTemplate(**raw_match_template)

    def get_match_template_trie(self, lang: str):
        from sefaria.model.linker.match_template import MatchTemplateTrie
        # check cache first
        if not hasattr(self, '_match_template_trie_cache'):
            self._match_template_trie_cache = {}
        cached_trie = self._match_template_trie_cache.get(lang)
        if cached_trie:
            return cached_trie
        trie = MatchTemplateTrie(lang, nodes=[self], scope='combined')
        # cache the trie for future use
        self._match_template_trie_cache[lang] = trie
        return trie

    def has_scope_alone_match_template(self):
        """
        @return: True if `self` has any match template that has scope = "alone" OR scope = "any"
        """
        return any(template.scope in self.MATCH_TEMPLATE_ALONE_SCOPES for template in self.get_match_templates())



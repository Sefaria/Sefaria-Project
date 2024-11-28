class HasMatchTemplates:
    MATCH_TEMPLATE_ALONE_SCOPES = {'any', 'alone'}

    def get_match_templates(self):
        from sefaria.model.linker.match_template import MatchTemplate
        for raw_match_template in getattr(self, 'match_templates', []):
            yield MatchTemplate(**raw_match_template)

    def get_match_template_trie(self, lang: str):
        from sefaria.model.linker.match_template import MatchTemplateTrie
        return MatchTemplateTrie(lang, nodes=[self], scope='combined')

    def has_scope_alone_match_template(self):
        """
        @return: True if `self` has any match template that has scope = "alone" OR scope = "any"
        """
        return any(template.scope in self.MATCH_TEMPLATE_ALONE_SCOPES for template in self.get_match_templates())



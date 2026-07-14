class SemanticSearchRouter:
    app_label = 'semantic_search'

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return 'vector_db'

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return 'vector_db'

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == self.app_label:
            return False

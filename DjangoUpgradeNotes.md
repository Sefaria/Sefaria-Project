# Django Upgrade Notes




# Deprecated Packages

- [ ] Upgrade `oauth2client` to `google-auth` 


## Official 1.11 -> 2.0 upgrade checklist

_Official deprecation guide: https://docs.djangoproject.com/en/3.1/internals/deprecation/#deprecation-removed-in-2-0_

- [ ] The weak argument to `django.dispatch.signals.Signal.disconnect()` will be removed.
- [ ] `django.db.backends.base.BaseDatabaseOperations.check_aggregate_support()` will be removed.
- [ ] The `django.forms.extras` package will be removed.
- [ ] The `assignment_tag` helper will be removed.
- [ ] The host argument to `assertsRedirects` will be removed. The compatibility layer which allows absolute URLs to be considered equal to relative ones when the path is identical will also be removed.
- [ ] `Field.rel` will be removed.
- [ ] `Field.remote_field.to` attribute will be removed.
- [ ] The `on_delete` argument for `ForeignKey` and `OneToOneField` will be required.
- [ ] `django.db.models.fields.add_lazy_relation()` will be removed.
- [ ] When time zone support is enabled, database backends that don’t support time zones won’t convert aware datetimes to naive values in UTC anymore when such values are passed as parameters to SQL queries executed outside of the ORM, e.g. with cursor.execute().
- [ ] The `django.contrib.auth.tests.utils.skipIfCustomUser()` decorator will be removed.
- [ ] The `GeoManager` and `GeoQuerySet` classes will be removed.
- [ ] The `django.contrib.gis.geoip` module will be removed.
- [ ] The `supports_recursion` check for template loaders will be removed from:
    - [ ] `django.template.engine.Engine.find_template()`
    - [ ] `django.template.loader_tags.ExtendsNode.find_template()`
    - [ ] `django.template.loaders.base.Loader.supports_recursion()`
    - [ ] `django.template.loaders.cached.Loader.supports_recursion()`
- [ ] The `load_template()` and `load_template_sources()` template loader methods will be removed.
- [ ] The `template_dirs` argument for template loaders will be removed:
    - [ ] `django.template.loaders.base.Loader.get_template()`
    - [ ] `django.template.loaders.cached.Loader.cache_key()`
    - [ ] `django.template.loaders.cached.Loader.get_template()`
    - [ ] `django.template.loaders.cached.Loader.get_template_sources()`
    - [ ] `django.template.loaders.filesystem.Loader.get_template_sources()`
- [ ] The `django.template.loaders.base.Loader.__call__()` method will be removed.
- [ ] Support for custom error views with a single positional parameter will be dropped.
- [ ] The `mime_type` attribute of `django.utils.feedgenerator.Atom1Feed` and `django.utils.feedgenerator.RssFeed` will be removed in favor of `content_type`.
- [ ] The app_name argument to `django.conf.urls.include()` will be removed.
- [ ] Support for passing a 3-tuple as the first argument to `include()` will be removed.
- [ ] Support for setting a URL instance namespace without an application namespace will be removed.
- [ ] `Field._get_val_from_obj()` will be removed in favor of `Field.value_from_object()`.
- [ ] `django.template.loaders.eggs.Loader` will be removed.
- [ ] The `current_app` parameter to the contrib.auth views will be removed.
- [ ] The `callable_obj` keyword argument to `SimpleTestCase.assertRaisesMessage()` will be removed.
- [ ] Support for the `allow_tags` attribute on `ModelAdmin` methods will be removed.
- [ ] The enclosure keyword argument to `SyndicationFeed.add_item()` will be removed.
- [ ] The `django.template.loader.LoaderOrigin` and `django.template.base.StringOrigin` aliases for `django.template.base.Origin` will be removed.
 
 
See the Django 1.10 release notes for more details on these changes.
 
- [ ] The `makemigrations --exit` option will be removed.
- [ ] Support for direct assignment to a reverse foreign key or many-to-many relation will be removed.
- [ ] The `get_srid()` and `set_srid()` methods of `django.contrib.gis.geos.GEOSGeometry` will be removed.
- [ ] The `get_x()`, `set_x()`, `get_y()`, `set_y()`, `get_z()`, and `set_z()` methods of `django.contrib.gis.geos.Point` will be removed.
- [ ] The `get_coords()` and `set_coords()` methods of `django.contrib.gis.geos.Point` will be removed.
- [ ] The `cascaded_union` property of `django.contrib.gis.geos.MultiPolygon` will be removed.
- [ ] `django.utils.functional.allow_lazy()` will be removed.
- [ ] The `shell --plain` option will be removed.
- [ ] The `django.core.urlresolvers` module will be removed.
- [ ] The model `CommaSeparatedIntegerField` will be removed. A stub field will remain for compatibility with historical migrations.
- [ ] Support for the template `Context.has_key()` method will be removed.
- [ ] Support for the `django.core.files.storage.Storage.accessed_time()`, `created_time()`, and `modified_time()` methods will be removed.
- [ ] Support for query lookups using the model name when `Meta.default_related_name` is set will be removed.
- [ ] The `__search` query lookup and the `DatabaseOperations.fulltext_search_sql()` method will be removed.
- [ ] The shim for supporting custom related manager classes without a `_apply_rel_filters()` method will be removed.
- [ ] Using `User.is_authenticated()` and `User.is_anonymous()` as methods will no longer be supported.
- [ ] The private attribute `virtual_fields` of `Model._meta` will be removed.
- [ ] The private keyword arguments `virtual_only` in `Field.contribute_to_class()` and `virtual` in `Model._meta.add_field()` will be removed.
- [ ] The `javascript_catalog()` and `json_catalog()` views will be removed.
- [ ] The `django.contrib.gis.utils.precision_wkt()` function will be removed.
- [ ] In multi-table inheritance, implicit promotion of a `OneToOneField` to a `parent_link` will be removed.
- [ ] Support for `Widget._format_value()` will be removed.
- [ ] FileField methods `get_directory_name()` and `get_filename()` will be removed.
- [ ] The `mark_for_escaping()` function and the classes it uses: `EscapeData`, `EscapeBytes`, `EscapeText`, `EscapeString`, and `EscapeUnicode` will be removed.
- [ ] The escape filter will change to use `django.utils.html.conditional_escape()`.
- [ ] `Manager.use_for_related_fields` will be removed.
- [ ] Model Manager inheritance will follow MRO inheritance rules and the `Meta.manager_inheritance_from_future` to opt-in to this behavior will be removed.
- [ ] Support for old-style middleware using `settings.MIDDLEWARE_CLASSES` will be removed.

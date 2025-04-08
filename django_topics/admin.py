from django.contrib import admin, messages
from django_topics.models import Topic, TopicPool, FeaturedTopicEnglish, FeaturedTopicHebrew, SeasonalTopicEnglish, SeasonalTopicHebrew
from django_topics.models.pool import PoolType
from django.utils.html import format_html



def create_add_to_pool_action(pool_name):
    def add_to_pool(modeladmin, request, queryset):
        try:
            pool = TopicPool.objects.get(name=pool_name)
            for topic in queryset:
                topic.pools.add(pool)
            modeladmin.message_user(request, f"Added {queryset.count()} topics to {pool.name}", messages.SUCCESS)

        except TopicPool.DoesNotExist:
            modeladmin.message_user(request, "The specified pool does not exist.", messages.ERROR)

    add_to_pool.short_description = f"Add selected topics to '{pool_name}' pool"
    add_to_pool.__name__ = f"add_to_specific_pool_{pool_name}"
    return add_to_pool


def create_remove_from_pool_action(pool_name):
    def remove_from_pool(modeladmin, request, queryset):
        try:
            pool = TopicPool.objects.get(name=pool_name)
            for topic in queryset:
                topic.pools.remove(pool)
            modeladmin.message_user(request, f"Removed {queryset.count()} topics from {pool.name}", messages.SUCCESS)

        except TopicPool.DoesNotExist:
            modeladmin.message_user(request, "The specified pool does not exist.", messages.ERROR)

    remove_from_pool.short_description = f"Remove selected topics from '{pool_name}' pool"
    remove_from_pool.__name__ = f"remove_from_pool_{pool_name}"
    return remove_from_pool


class PoolFilter(admin.SimpleListFilter):
    title = 'Pool Filter'
    parameter_name = 'pool'

    def lookups(self, request, model_admin):
        return [
            ('general_en', 'General Pool EN'),
            ('general_he', 'General Pool HE'),
            (PoolType.TORAH_TAB.value, 'TorahTab Pool'),
        ]

    def queryset(self, request, queryset):
        pool_name = self.value()
        if pool_name:
            pool = TopicPool.objects.get(name=pool_name)
            return queryset.filter(pools=pool)
        return queryset


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ('slug', 'en_title', 'he_title', 'is_in_pool_general_en', 'is_in_pool_general_he', 'is_in_pool_torah_tab', 'sefaria_link')
    list_filter = (PoolFilter,)
    filter_horizontal = ('pools',)
    search_fields = ('slug', 'en_title', 'he_title')
    readonly_fields = ('slug', 'en_title', 'he_title')
    actions = [
        create_add_to_pool_action('general_en'),
        create_add_to_pool_action('general_he'),
        create_add_to_pool_action(PoolType.TORAH_TAB.value),
        create_remove_from_pool_action('general_en'),
        create_remove_from_pool_action('general_he'),
        create_remove_from_pool_action(PoolType.TORAH_TAB.value),
    ]
    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        Topic.objects.build_slug_to_pools_cache(rebuild=True)


    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.filter(pools__name=PoolType.LIBRARY.value)

    def is_in_pool_general_en(self, obj):
        return obj.pools.filter(name='general_en').exists()
    is_in_pool_general_en.boolean = True
    is_in_pool_general_en.short_description = "General Pool EN"

    def is_in_pool_general_he(self, obj):
        return obj.pools.filter(name='general_he').exists()
    is_in_pool_general_he.boolean = True
    is_in_pool_general_he.short_description = "General Pool HE"

    def is_in_pool_torah_tab(self, obj):
        return obj.pools.filter(name=PoolType.TORAH_TAB.value).exists()
    is_in_pool_torah_tab.boolean = True
    is_in_pool_torah_tab.short_description = "TorahTab Pool"

    def sefaria_link(self, obj):
        url = f"https://www.sefaria.org/topics/{obj.slug}"
        return format_html('<a href="{}" target="_blank">{}</a>', url, obj.slug)
    sefaria_link.short_description = "Sefaria Link"


class FeaturedTopicAdmin(admin.ModelAdmin):
    exclude = ("lang",)  # not for manual editing
    list_display = ('start_date', 'topic')
    list_filter = ('start_date',)
    raw_id_fields = ('topic',)
    search_fields = ('topic__slug', 'topic__en_title', 'topic__he_title')
    date_hierarchy = 'start_date'
    ordering = ['-start_date']
    fieldsets = (
        (None, {
            'fields': ('topic', 'start_date'),
        }),
    )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "topic":
            kwargs["label"] = "Topic slug"
            kwargs["help_text"] = "Use the magnifying glass button to select a topic."
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(FeaturedTopicEnglish)
class FeaturedTopicAdminEnglish(FeaturedTopicAdmin):

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(lang="en")


@admin.register(FeaturedTopicHebrew)
class FeaturedTopicAdminHebrew(FeaturedTopicAdmin):

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(lang="he")


class SeasonalTopicAdmin(admin.ModelAdmin):
    exclude = ("lang",)  # not for manual editing
    list_display = (
        'start_date',
        'topic',
        'display_date_prefix',
        'display_date_suffix',
        'secondary_topic',
        'display_start_date_israel',
        'display_end_date_israel',
        'display_start_date_diaspora',
        'display_end_date_diaspora'
    )
    raw_id_fields = ('topic', 'secondary_topic')
    list_filter = (
        'start_date',
        'display_start_date_israel',
        'display_start_date_diaspora'
    )
    ordering = ['-start_date']
    search_fields = ('topic__slug', 'topic__en_title', 'topic__he_title', 'secondary_topic__slug')
    autocomplete_fields = ('topic', 'secondary_topic')
    date_hierarchy = 'start_date'
    fieldsets = (
        (None, {
            'fields': (
                'topic',
                'secondary_topic',
                'start_date'
            )
        }),
        ('Display Date Prefix/Suffix', {
            'fields': (
                'display_date_prefix',
                'display_date_suffix',
            ),
            'description': 'Prefix/Suffix that will be displayed around the secondary topic.',
        }),
        ('Israel Display Dates', {
            'fields': (
                'display_start_date_israel',
                'display_end_date_israel'
            ),
            'description': 'Dates to be displayed to the user of when this topic is "happening". '
                           'E.g. for a holiday, when the holiday occurs. '
                           'When the dates are the same for both Israel and Diaspora, only fill out Israeli dates. '
                           'Similarly, when the start and end dates are the same, only fill out start date.'
        }),
        ('Diaspora Display Dates', {
            'fields': (
                'display_start_date_diaspora',
                'display_end_date_diaspora'
            ),
            'description': 'When the dates are the same for both Israel and Diaspora, only fill out Israeli dates. '
                           'Similarly, when the start and end dates are the same, only fill out start date.'

        }),
    )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "topic":
            kwargs["label"] = "Topic slug"
            kwargs["help_text"] = "Use the magnifying glass button to select a topic."
        if db_field.name == "secondary_topic":
            kwargs["label"] = "Secondary topic slug"
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        """
        Overriding the save_model to ensure the model's clean method is executed.
        """
        obj.clean()
        super().save_model(request, obj, form, change)


@admin.register(SeasonalTopicEnglish)
class SeasonalTopicAdminEnglish(SeasonalTopicAdmin):

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(lang="en")


@admin.register(SeasonalTopicHebrew)
class SeasonalTopicAdminHebrew(SeasonalTopicAdmin):
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(lang="he")

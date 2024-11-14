from django.contrib import admin, messages
from topics.models import Topic, TopicPool
from topics.models.pool import PoolType


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
            (PoolType.GENERAL.value, 'General Pool'),
            (PoolType.TORAH_TAB.value, 'TorahTab Pool'),
        ]

    def queryset(self, request, queryset):
        pool_name = self.value()
        if pool_name:
            pool = TopicPool.objects.get(name=pool_name)
            return queryset.filter(pools=pool)
        return queryset


class TopicAdmin(admin.ModelAdmin):
    list_display = ('slug', 'en_title', 'he_title', 'is_in_pool_general', 'is_in_pool_torah_tab')
    list_filter = (PoolFilter,)
    filter_horizontal = ('pools',)
    readonly_fields = ('slug', 'en_title', 'he_title')
    actions = [
        create_add_to_pool_action(PoolType.GENERAL.value),
        create_add_to_pool_action(PoolType.TORAH_TAB.value),
        create_remove_from_pool_action(PoolType.GENERAL.value),
        create_remove_from_pool_action(PoolType.TORAH_TAB.value),
    ]

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.filter(pools__name=PoolType.LIBRARY.value)

    def is_in_pool_general(self, obj):
        return obj.pools.filter(name=PoolType.GENERAL.value).exists()
    is_in_pool_general.boolean = True
    is_in_pool_general.short_description = "General?"

    def is_in_pool_torah_tab(self, obj):
        return obj.pools.filter(name=PoolType.TORAH_TAB.value).exists()
    is_in_pool_torah_tab.boolean = True
    is_in_pool_torah_tab.short_description = "TorahTab?"


class TopicPoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'topic_names')
    filter_horizontal = ('topics',)
    readonly_fields = ('name',)

    def topic_names(self, obj):
        topic_slugs = obj.topics.all().values_list('slug', flat=True)
        str_rep = ', '.join(topic_slugs[:30])
        if len(topic_slugs) > 30:
            str_rep = str_rep + '...'
        return str_rep


admin.site.register(Topic, TopicAdmin)
admin.site.register(TopicPool, TopicPoolAdmin)



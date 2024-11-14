from django.contrib import admin, messages
from django.db.models import BooleanField, Case, When
from topics.models import Topic, TopicPool
from topics.models.pool import PoolType


def create_add_to_specific_pool_action(pool_name):
    def add_to_specific_pool(modeladmin, request, queryset):
        try:
            pool = TopicPool.objects.get(name=pool_name)
            for topic in queryset:
                topic.pools.add(pool)
            modeladmin.message_user(request, f"Added {queryset.count()} topics to {pool.name}", messages.SUCCESS)

        except TopicPool.DoesNotExist:
            modeladmin.message_user(request, "The specified pool does not exist.", messages.ERROR)

    add_to_specific_pool.short_description = f"Add selected topics to '{pool_name}' pool"
    return add_to_specific_pool


class TopicAdmin(admin.ModelAdmin):
    list_display = ('slug', 'en_title', 'he_title', 'is_in_pool_general', 'is_in_pool_torah_tab')
    filter_horizontal = ('pools',)
    readonly_fields = ('slug', 'en_title', 'he_title')
    actions = [create_add_to_specific_pool_action(pool_name) for pool_name in (PoolType.GENERAL.value, PoolType.TORAH_TAB.value)]

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.annotate(
            in_pool_general=Case(
                When(pools__name=PoolType.GENERAL.value, then=True),
                default=False,
                output_field=BooleanField()
            ),
            in_pool_torah_tab=Case(
                When(pools__name=PoolType.TORAH_TAB.value, then=True),
                default=False,
                output_field=BooleanField()
            )
        ).filter(pools__name=PoolType.LIBRARY.value)

    def is_in_pool_general(self, obj):
        return obj.in_pool_general
    is_in_pool_general.boolean = True
    is_in_pool_general.short_description = "General?"
    is_in_pool_general.admin_order_field = 'in_pool_general'

    def is_in_pool_torah_tab(self, obj):
        return obj.in_pool_torah_tab
    is_in_pool_torah_tab.boolean = True
    is_in_pool_torah_tab.short_description = "TorahTab?"
    is_in_pool_torah_tab.admin_order_field = 'in_pool_torah_tab'


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



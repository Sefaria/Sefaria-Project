CURRENT_LINKER_VERSION = "feature.linker.current_version"
REF_CACHE_LIMIT_KEY = "feature.text.ref_cache_limit"
ENABLE_WEBPAGES = "feature.webpages.enable"
CLIENT_REMOTE_CONFIG_JSON = "feature.client.remote_config_json"
EXPIRE_LEGACY_COOKIES = "feature.cookies.expire_legacy"
SENTRY_CONFIG_JSON = "feature.sentry.config"

# Entity search (/api/entity-search) per-field match boosts. Each is a JSON object
# mapping a field name ("title_en", "titleVariants", ...) to a numeric boost, e.g.
# {"title_en": 3, "title_he": 3, "titleVariants": 2}. Only known field names are
# applied (see sefaria/helper/search.py); unknown/misspelled keys are ignored.
SEARCH_ENTITY_FIELD_BOOSTS_TOPIC = "feature.search.entity_field_boosts.topic"
SEARCH_ENTITY_FIELD_BOOSTS_AUTHOR = "feature.search.entity_field_boosts.author"
SEARCH_ENTITY_FIELD_BOOSTS_BOOK = "feature.search.entity_field_boosts.book"

# Chatbot configuration
CHATBOT_MAX_INPUT_CHARS = "feature.chatbot.max_input_chars"
CHATBOT_MAX_PROMPTS = "feature.chatbot.max_prompts"
CHATBOT_PROMO_LEARN_MORE_URLS = "feature.chatbot.promoLearnMoreUrls"
SHOW_JOIN_CHATBOT_BANNER = "feature.client.show_join_chatbot_banner"
CHATBOT_PROMO_MAYBE_LATER_JSON = "feature.chatbot.promoMaybeLaterJSON"
CHATBOT_PROMO_SESSION_LENGTH_SECONDS = "feature.chatbot.promoSessionLengthSeconds"

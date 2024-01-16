ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD = (
"i", "b", "br", "u", "strong", "h1", "h2", "h3", "pre", "em", "big", "small", "img", "sup", "sub", "span", "a",
"table", "td", "th", "tr", "tbody", "thead", "ul", "li")
ALLOWED_ATTRS_IN_ABSTRACT_TEXT_RECORD = {
    'sup': ['class'],
    'span': ['class', 'dir'],
    # There are three uses of i tags.
    # footnotes: uses content internal to <i> tag.
    # commentary placement: uses 'data-commentator', 'data-order', 'data-label'
    # structure placement (e.g. page transitions): uses 'data-overlay', 'data-value'
    'i': ['data-overlay', 'data-value', 'data-commentator', 'data-order', 'class', 'data-label', 'dir'],
    'img': ['src', 'alt'],
    'a': ['dir', 'class', 'href', 'data-ref', "data-ven", "data-vhe", 'data-scroll-link'],
}

LANGUAGE_CODES = {
    #maps ISO language codes to their nother language (i.e. jrb to Arabic rather than Judeo-Arabic)
    "ar": "arabic",
    "de": "german",
    "en": "english",
    "eo": "esperanto",
    "es": "spanish",
    "fa": "persian",
    "fi": "finnish",
    "fr": "french",
    "he": "hebrew",
    "it": "italian",
    "lad": "ladino",
    "pl": "polish",
    "pt": "portuguese",
    "ru": "russian",
    "yi": "yiddish",
    "jrb": "arabic",
}

ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD = ("i", "b", "br", "u", "strong", "em", "big", "small", "img", "sup", "sub", "span", "a")
ALLOWED_ATTRS_IN_ABSTRACT_TEXT_RECORD = {
    'sup': ['class'],
    'span': ['class', 'dir'],
    # There are three uses of i tags.
    # footnotes: uses content internal to <i> tag.
    # commentary placement: uses 'data-commentator', 'data-order', 'data-label'
    # structure placement (e.g. page transitions): uses 'data-overlay', 'data-value'
    'i': ['data-overlay', 'data-value', 'data-commentator', 'data-order', 'class', 'data-label', 'dir'],
    'img': lambda name, value: name == 'src' and value.startswith("data:image/"),
    'a': ['dir', 'class', 'href', 'data-ref', "data-ven", "data-vhe"],
}

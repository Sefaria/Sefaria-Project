"""Emoji shortcodes (`:warning:`) to Unicode, as live renders them (gemoji names).

Only this table is converted; an unknown shortcode stays as typed. The four used in the corpus are `warning`,
`sparkles`, `wrench` and `handshake`; the rest are common gemoji names an editor is likely to type.
"""

import re

SHORTCODES = {
    "+1": "👍",
    "-1": "👎",
    "bangbang": "‼️",
    "book": "📖",
    "books": "📚",
    "bookmark": "🔖",
    "bug": "🐛",
    "bulb": "💡",
    "calendar": "📆",
    "chart_with_upwards_trend": "📈",
    "check": "✔️",
    "heavy_check_mark": "✔️",
    "white_check_mark": "✅",
    "clap": "👏",
    "computer": "💻",
    "construction": "🚧",
    "dart": "🎯",
    "email": "📧",
    "envelope": "✉️",
    "eyes": "👀",
    "fire": "🔥",
    "gear": "⚙️",
    "globe_with_meridians": "🌐",
    "handshake": "🤝",
    "hammer": "🔨",
    "hammer_and_wrench": "🛠️",
    "heart": "❤️",
    "information_source": "ℹ️",
    "interrobang": "⁉️",
    "key": "🔑",
    "link": "🔗",
    "lock": "🔒",
    "mag": "🔍",
    "memo": "📝",
    "pencil": "📝",
    "pencil2": "✏️",
    "no_entry": "⛔",
    "exclamation": "❗",
    "heavy_exclamation_mark": "❗",
    "question": "❓",
    "package": "📦",
    "pushpin": "📌",
    "raised_hands": "🙌",
    "rocket": "🚀",
    "rotating_light": "🚨",
    "smile": "😄",
    "smiley": "😃",
    "sparkles": "✨",
    "star": "⭐",
    "stop_sign": "🛑",
    "tada": "🎉",
    "thumbsup": "👍",
    "thumbsdown": "👎",
    "warning": "⚠️",
    "wave": "👋",
    "wrench": "🔧",
    "x": "❌",
    "zap": "⚡",
    "blue_book": "📘",
    "scroll": "📜",
    "speech_balloon": "💬",
    "trophy": "🏆",
    "100": "💯",
}

SHORTCODE_RE = re.compile(r":([a-z0-9_+\-]+):")


def replace_shortcodes(text):
    return SHORTCODE_RE.sub(lambda m: SHORTCODES.get(m.group(1), m.group(0)), text)


def emoji_rule(state):
    """markdown-it core rule: convert shortcodes in text tokens (never inside code)."""
    for tok in state.tokens:
        if tok.type != "inline" or not tok.children:
            continue
        for child in tok.children:
            if child.type == "text" and ":" in child.content:
                child.content = replace_shortcodes(child.content)

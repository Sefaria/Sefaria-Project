#!/usr/bin/env python3
"""
POC icon cleanup: regenerate Sefaria's UI icons from Lucide (lucide-static, ISC licensed).

Every referenced icon file under static/icons and static/img is rewritten in place, so all
existing <img src>, CSS url() and Button icon="..." references keep working. Each file is:
  * the mapped Lucide glyph (stroke only), or a recolored legacy glyph where Lucide has no match
  * colored with one design-system icon token (icon-default / icon-muted / icon-disabled / icon-inverse)
  * sized to a standard 12, 18 or 24px

Font Awesome glyphs are swapped for Lucide masks in static/css/lucide-icons.css, which reads the
plain Lucide files this script copies to static/icons/lucide/.

Run from the repo root after `npm install`:
    python3 scripts/icons/build_lucide_icons.py
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LUCIDE_DIR = os.path.join(ROOT, "node_modules", "lucide-static", "icons")

# Values from sefaria-design-foundations tokens.css (Core Neutral primitives behind the icon-* tokens).
TOKENS = {
    "default": "#121212",   # --icon-default  (--gray-1000)
    "muted": "#6F6F6F",     # --icon-muted    (--gray-500)
    "disabled": "#999999",  # --icon-disabled (--gray-400)
    "inverse": "#FFFFFF",   # --icon-inverse  (--white), for icons on action-primary / inverse surfaces
}

# path (relative to static/) -> (lucide name | "legacy", token, size[, "filled"])
ICONS = {
    # --- static/icons ---
    "icons/add-to-sheet.svg": ("file-plus", "muted", 18),
    "icons/ai-double-star.svg": ("sparkles", "inverse", 18),
    "icons/ai-star-outline-18.svg": ("sparkle", "muted", 18),
    "icons/ai-star-outline-24.svg": ("sparkle", "muted", 24),
    "icons/ai-star-solid-18.svg": ("sparkle", "muted", 18, "filled"),
    "icons/ai-star-solid-24.svg": ("sparkle", "muted", 24, "filled"),
    "icons/android.svg": ("legacy", "default", 18),
    "icons/ios.svg": ("legacy", "default", 18),
    "icons/arrow-down-bold.svg": ("chevron-down", "muted", 12),
    "icons/arrow-up-bold.svg": ("chevron-up", "muted", 12),
    "icons/arrow-left.svg": ("arrow-left", "default", 24),
    "icons/bi-ltr-heLeft.svg": ("legacy", "muted", 24),
    "icons/bi-ltr-stacked.svg": ("legacy", "muted", 24),
    "icons/bi-rtl-heRight.svg": ("legacy", "muted", 24),
    "icons/bi-rtl-stacked.svg": ("legacy", "muted", 24),
    "icons/mixed-beside-ltrrtl.svg": ("legacy", "muted", 24),
    "icons/mixed-beside-rtlltr.svg": ("legacy", "muted", 24),
    "icons/mixed-stacked-ltrrtl.svg": ("legacy", "muted", 24),
    "icons/mixed-stacked-rtlltr.svg": ("legacy", "muted", 24),
    "icons/mono-continuous.svg": ("legacy", "muted", 24),
    "icons/mono-segmented.svg": ("legacy", "muted", 24),
    "icons/book-icon-black.svg": ("book-open", "default", 18),
    "icons/book.svg": ("book-open", "muted", 18),
    "icons/bookmark-filled.svg": ("bookmark", "default", 18, "filled"),
    "icons/bookmark.svg": ("bookmark", "muted", 18),
    "icons/bookmarkset_outline_mdl.svg": ("bookmark", "default", 18),
    "icons/calendar.svg": ("calendar", "muted", 18),
    "icons/checkmark.svg": ("check", "muted", 12),
    "icons/follow.svg": ("plus", "muted", 12),
    "icons/chevron-down-line.svg": ("chevron-down", "default", 18),
    "icons/chevron-down.svg": ("chevron-down", "muted", 12),
    "icons/chevron-right-sm.svg": ("chevron-right", "muted", 12),
    "icons/chevron-right.svg": ("chevron-right", "muted", 18),
    "icons/chevron.svg": ("chevron-down", "muted", 18),
    "icons/circled-x.svg": ("circle-x", "muted", 24),
    "icons/clock.svg": ("history", "muted", 18),
    "icons/collection-black.svg": ("library-big", "default", 18),
    "icons/collection.svg": ("library-big", "muted", 18),
    "icons/community-black.svg": ("users", "default", 18),
    "icons/copy.svg": ("copy", "muted", 18),
    "icons/editing-pencil.svg": ("pencil", "default", 24),
    "icons/educators.svg": ("graduation-cap", "muted", 18),
    "icons/ellipses.svg": ("ellipsis", "muted", 18),
    "icons/email-newsletter.svg": ("mail", "default", 18),
    "icons/enlarge_font.svg": ("a-arrow-up", "muted", 24),
    "icons/reduce_font.svg": ("a-arrow-down", "muted", 24),
    "icons/eye.svg": ("eye", "muted", 18),
    "icons/eye-off.svg": ("eye-off", "muted", 18),
    "icons/facebook.svg": ("legacy", "muted", 18),
    "icons/instagram.svg": ("legacy", "muted", 18),
    "icons/youtube.svg": ("legacy", "muted", 18),
    "icons/filter.svg": ("funnel", "muted", 18),
    "icons/globallanguageswitcher_mdl.svg": ("globe", "default", 18),
    "icons/heavy-x-dark.svg": ("x", "default", 12),
    "icons/heavy-x.svg": ("x", "muted", 24),
    "icons/help.svg": ("circle-help", "muted", 18),
    "icons/help_mdl.svg": ("circle-help", "default", 18),
    "icons/iconmonstr-book-15.svg": ("book-open", "muted", 18),
    "icons/iconmonstr-hashtag-1.svg": ("hash", "muted", 18),
    "icons/iconmonstr-magnifier-2.svg": ("search", "muted", 18),
    "icons/iconmonstr-magnifier-2-240.svg": ("search", "muted", 18),
    "icons/iconmonstr-pen-17.svg": ("pen-line", "muted", 18),
    "icons/iconmonstr-script-2.svg": ("scroll-text", "muted", 18),
    "icons/iconmonstr-view-6.svg": ("layout-grid", "muted", 18),
    "icons/image.svg": ("image", "muted", 18),
    "icons/video.svg": ("video", "muted", 18),
    "icons/quotation.svg": ("quote", "muted", 18),
    "icons/info.svg": ("info", "muted", 18),
    "icons/link_grey.svg": ("link", "muted", 18),
    "icons/little-chevron-down.svg": ("chevron-down", "muted", 12),
    "icons/little-chevron-up.svg": ("chevron-up", "muted", 12),
    "icons/login.svg": ("log-in", "muted", 18),
    "icons/logout.svg": ("log-out", "muted", 18),
    "icons/magnifier.svg": ("search", "muted", 18),
    "icons/mail.svg": ("mail", "inverse", 18),
    "icons/mobile.svg": ("smartphone", "muted", 18),
    "icons/moduleswitcher_mdl.svg": ("layout-grid", "default", 18),
    "icons/new-sheet-black.svg": ("file-plus", "default", 18),
    "icons/new_editor_saving/cloud-done-rounded.svg": ("cloud-check", "muted", 24),
    "icons/new_editor_saving/cloud-off-rounded.svg": ("cloud-off", "muted", 24),
    "icons/new_editor_saving/directory-sync-rounded.svg": ("refresh-cw", "muted", 24),
    "icons/new_editor_saving/error-rounded.svg": ("circle-alert", "muted", 24),
    "icons/new_editor_saving/person-off.svg": ("user-x", "muted", 24),
    "icons/notes-icon.svg": ("sticky-note", "muted", 18),
    "icons/notification.svg": ("bell", "muted", 18),
    "icons/notifications_mdl.svg": ("bell", "default", 18),
    "icons/notifications-1_mdl.svg": ("bell-dot", "default", 18),
    "icons/open-panel.svg": ("external-link", "muted", 12),
    "icons/profile.svg": ("user", "muted", 18),
    "icons/profile_loggedout_mdl.svg": ("circle-user", "default", 18),
    "icons/profile_loggedin_mdl.svg": ("circle-user", "default", 18),
    "icons/remove-connection.svg": ("unlink", "muted", 18),
    "icons/search_mdl.svg": ("search", "default", 18),
    "icons/settings.svg": ("settings", "muted", 18),
    "icons/sheet.svg": ("file-text", "muted", 18),
    "icons/sliders-horizontal.svg": ("sliders-horizontal", "muted", 18),
    "icons/sort.svg": ("arrow-down-up", "default", 18),
    "icons/tools-write-note.svg": ("notebook-pen", "muted", 18),
    "icons/topic.svg": ("hash", "muted", 18),
    "icons/torah-tab.svg": ("scroll", "muted", 18),
    "icons/trash.svg": ("trash-2", "default", 18),
    "icons/unpublish.svg": ("eye-off", "default", 18),
    "icons/vector.svg": ("play", "inverse", 18),
    "icons/visualization.svg": ("chart-network", "muted", 18),
    "icons/visualizations.svg": ("chart-network", "muted", 18),
    "icons/heart.svg": ("heart", "inverse", 18),  # new: replaces heart.png
    # --- static/img ---
    "img/3vdots.svg": ("ellipsis-vertical", "inverse", 18),
    "img/about-text.svg": ("info", "muted", 18),
    "img/advancedtools.svg": ("wrench", "muted", 18),
    "img/aleph.svg": ("legacy", "muted", 18),
    "img/aye.svg": ("legacy", "muted", 18),
    "img/lang_icon_english.svg": ("legacy", "muted", 18),
    "img/lang_icon_hebrew.svg": ("legacy", "muted", 18),
    "img/arrow-left-bold.svg": ("chevron-left", "muted", 18),
    "img/arrow-right-bold.svg": ("chevron-right", "muted", 18),
    "img/book-icon-black.svg": ("book-open", "default", 18),
    "img/bulb.svg": ("lightbulb", "muted", 18),
    "img/calendar.svg": ("calendar", "default", 18),
    "img/chat_submit_arrow.svg": ("send-horizontal", "disabled", 18),
    "img/chat_submit_arrow_blue.svg": ("send-horizontal", "default", 18),
    "img/check-mark.svg": ("check", "default", 12),
    "img/checkbox-checked.svg": ("square-check", "default", 18),
    "img/checkbox-partially.svg": ("square-minus", "default", 18),
    "img/checkbox-unchecked.svg": ("square", "muted", 18),
    "img/circled-arrow-left.svg": ("circle-arrow-left", "muted", 18),
    "img/circled-arrow-right.svg": ("circle-arrow-right", "muted", 18),
    "img/circled-x.svg": ("circle-x", "muted", 18),
    "img/clock-white.svg": ("clock", "inverse", 18),
    "img/compare-panel.svg": ("columns-2", "muted", 18),
    "img/compare.svg": ("text-search", "muted", 18),
    "img/connection-book.svg": ("book-open", "muted", 18),
    "img/dictionaries.svg": ("book-a", "muted", 18),
    "img/endcall.svg": ("phone-off", "inverse", 18),
    "img/eye-slash.svg": ("eye-off", "muted", 18),
    "img/feedback.svg": ("message-square", "muted", 18),
    "img/hashtag-icon.svg": ("hash", "muted", 18),
    "img/help.svg": ("circle-help", "muted", 18),
    "img/iconmonstr-school-17.svg": ("graduation-cap", "default", 18),
    "img/info.svg": ("info", "muted", 18),
    "img/less.svg": ("chevron-up", "muted", 12),
    "img/logout.svg": ("log-out", "default", 18),
    "img/manuscripts.svg": ("file-image", "muted", 18),
    "img/torahreadings.svg": ("scroll-text", "muted", 18),
    "img/more.svg": ("ellipsis", "muted", 18),
    "img/mute.svg": ("mic-off", "inverse", 18),
    "img/unmute.svg": ("mic", "inverse", 18),
    "img/note-white.svg": ("sticky-note", "inverse", 18),
    "img/notes.svg": ("notebook-pen", "muted", 18),
    "img/pause.svg": ("pause", "default", 12),
    "img/play.svg": ("play", "default", 12),
    "img/pin.svg": ("pin", "default", 18),
    "img/profile-white.svg": ("user", "inverse", 18),
    "img/profile.svg": ("user", "default", 18),
    "img/settings.svg": ("settings", "muted", 18),
    "img/share-icon-white.svg": ("share-2", "inverse", 18),
    "img/share.svg": ("share-2", "muted", 18),
    "img/sheet.svg": ("file-text", "muted", 18),
    "img/sheetsplus-white.svg": ("file-plus", "inverse", 18),
    "img/sheetsplus.svg": ("file-plus", "muted", 18),
    "img/text-navigation.svg": ("table-of-contents", "muted", 18),
    "img/three-dots.svg": ("ellipsis", "default", 18),
    "img/tools-add-connection-white.svg": ("link", "inverse", 18),
    "img/tools-add-connection.svg": ("link", "muted", 18),
    "img/tools-edit-text.svg": ("pencil", "muted", 18),
    "img/tools-translate.svg": ("languages", "muted", 18),
    "img/tools-write-note.svg": ("notebook-pen", "muted", 18),
    "img/translation.svg": ("languages", "muted", 18),
    "img/triangle-down.svg": ("chevron-down", "muted", 12),
    "img/triangle-up.svg": ("chevron-up", "muted", 12),
    "img/video.svg": ("video", "default", 18),
    "img/webpages.svg": ("globe", "muted", 18),
    "img/facebook.svg": ("legacy", "muted", 18),
    "img/twitter.svg": ("legacy", "muted", 18),
    "img/youtube.svg": ("legacy", "muted", 18),
    "img/linkedin.svg": ("legacy", "muted", 18),
}

# Font Awesome glyph -> Lucide name (brand glyphs such as fa-apple, fa-google, fa-github are left alone)
FONT_AWESOME = {
    "check": "check", "external-link": "external-link", "link": "link", "file-o": "file",
    "file-text-o": "file-text", "comment": "message-square", "comment-o": "message-square",
    "times": "x", "times-circle": "circle-x", "pencil": "pencil", "lock": "lock", "unlock": "lock-open",
    "chevron-left": "chevron-left", "chevron-right": "chevron-right", "bars": "menu",
    "caret-down": "chevron-down", "caret-up": "chevron-up", "caret-right": "chevron-right",
    "caret-left": "chevron-left", "angle-down": "chevron-down", "angle-up": "chevron-up",
    "angle-left": "chevron-left", "angle-right": "chevron-right", "plus": "plus", "eye": "eye",
    "upload": "upload", "trash-o": "trash-2", "share-alt": "share-2", "search-plus": "zoom-in",
    "search-minus": "zoom-out", "picture-o": "image", "list-ul": "list", "list-ol": "list-ordered",
    "language": "languages", "home": "house", "gear": "settings", "floppy-o": "save",
    "clipboard": "clipboard", "ban": "ban", "header": "heading", "wrench": "wrench", "envelope-o": "mail",
}

LICENSE = "<!-- Lucide {name} (ISC, lucide.dev), token icon-{token}. Generated by scripts/icons/build_lucide_icons.py -->\n"


def lucide_svg(name, color, size, filled=False):
    src = open(os.path.join(LUCIDE_DIR, name + ".svg")).read()
    src = re.sub(r"<!--.*?-->\s*", "", src, flags=re.S)
    src = re.sub(r'\s*class="[^"]*"', "", src)
    src = re.sub(r'width="24"', 'width="%d"' % size, src, count=1)
    src = re.sub(r'height="24"', 'height="%d"' % size, src, count=1)
    src = src.replace('stroke="currentColor"', 'stroke="%s"' % color)
    if filled:
        src = src.replace('fill="none"', 'fill="%s"' % color, 1)
    return re.sub(r"\n\s*", " ", src.strip()).replace("> <", "><") + "\n"


def recolor_legacy(src, color, size):
    """Keep a pre-Lucide glyph (brands, layout diagrams, Hebrew/English letterforms) but bind it to a token."""
    def swap(m):
        value = m.group(2)
        if value.lower() in ("none", "white", "#fff", "#ffffff") or value.startswith("url("):
            return m.group(0)
        return '%s="%s"' % (m.group(1), color)
    out = re.sub(r'\b(fill|stroke)="([^"]*)"', swap, src)
    out = re.sub(r"(fill|stroke):\s*#[0-9a-fA-F]{3,6}", lambda m: "%s:%s" % (m.group(1), color), out)
    open_tag = re.search(r"<svg\b[^>]*>", out, re.S).group(0)
    vb = re.search(r'viewBox="([^"]+)"', open_tag)
    w0 = re.search(r'\swidth="([\d.]+)', open_tag)
    h0 = re.search(r'\sheight="([\d.]+)', open_tag)
    if vb:
        _, _, vw, vh = [float(x) for x in vb.group(1).replace(",", " ").split()]
    else:
        vw, vh = float(w0.group(1)), float(h0.group(1))
        open_tag_new = open_tag.replace("<svg", '<svg viewBox="0 0 %g %g"' % (vw, vh), 1)
        out, open_tag = out.replace(open_tag, open_tag_new, 1), open_tag_new
    scale = size / max(vw, vh)
    new_tag = re.sub(r'\s(width|height)="[^"]*"', "", open_tag)
    new_tag = new_tag.replace("<svg", '<svg width="%g" height="%g"' % (round(vw * scale, 2), round(vh * scale, 2)), 1)
    out = out.replace(open_tag, new_tag, 1)
    if not re.search(r"\bfill\s*[=:]", out):  # glyph relied on default black
        out = out.replace("<svg", '<svg fill="%s"' % color, 1)
    return out


def main():
    if not os.path.isdir(LUCIDE_DIR):
        sys.exit("lucide-static is missing; run `npm install` first.")
    for rel, spec in sorted(ICONS.items()):
        name, token, size = spec[:3]
        filled = len(spec) > 3 and spec[3] == "filled"
        color = TOKENS[token]
        path = os.path.join(ROOT, "static", rel)
        if name == "legacy":
            out = recolor_legacy(open(path).read(), color, size)
        else:
            out = LICENSE.format(name=name, token=token) + lucide_svg(name, color, size, filled)
        open(path, "w").write(out)

    # Plain Lucide files used as CSS masks for Font Awesome replacements (color comes from currentColor).
    mask_dir = os.path.join(ROOT, "static", "icons", "lucide")
    os.makedirs(mask_dir, exist_ok=True)
    rules = []
    for fa, name in sorted(FONT_AWESOME.items()):
        open(os.path.join(mask_dir, name + ".svg"), "w").write(lucide_svg(name, "#000000", 24))
        rules.append(".fa.fa-%s::before { -webkit-mask-image: url(\"/static/icons/lucide/%s.svg\"); mask-image: url(\"/static/icons/lucide/%s.svg\"); }" % (fa, name, name))
    # Hover: icon-muted files turn icon-default when the icon, or the control it sits in, is hovered.
    # <img> can't take a CSS color, so a filter paints the muted file #121212 (invert(7%) of black).
    muted = sorted('[src$="%s"]' % rel for rel, spec in ICONS.items() if spec[1] == "muted")
    muted_imgs = "img:is(\n  %s\n):not(.highlighted *, .blue *, .primary *, .button:not(.white) *)" % ",\n  ".join(muted)
    hover = (
        "%s:hover,\n"
        ":is(a, button, summary, label, [role=\"button\"], [role=\"link\"], [role=\"tab\"], [tabindex])"
        ":not(.button, .blue, .primary, .highlighted):hover > %s,\n"
        ":is(a, button, [role=\"button\"], [role=\"link\"]):not(.button, .blue, .primary, .highlighted):hover > :not(a, button) > %s {\n"
        "  filter: brightness(0) invert(7%%); /* --icon-default */\n}"
    ) % (muted_imgs, muted_imgs, muted_imgs)
    css = open(os.path.join(os.path.dirname(__file__), "lucide-icons.css.tmpl")).read()
    css = css.replace("/* RULES */", "\n".join(rules)).replace("/* HOVER */", hover)
    open(os.path.join(ROOT, "static", "css", "lucide-icons.css"), "w").write(css)
    print("wrote %d icons and %d Font Awesome replacements" % (len(ICONS), len(FONT_AWESOME)))


if __name__ == "__main__":
    main()

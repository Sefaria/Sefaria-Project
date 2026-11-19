# Design system (https://claude.ai/artifact/YHFAd6iicPGAUPcyEosR77; copy in research/design/design-system/)
- Themes: Library (default), Sheets, DevPortal. DevPortal overrides: action-primary=navy-700 #18345d (NOT purple), border-strong=purple-800 #653259, module-primary=purple-700 #7c416f, module-accent=white.
- Buttons: primary fill action-primary + text-inverse; hover action-primary-hover (navy-800); secondary action-secondary (gray-700). Labels en-system-body-strong / en-system-small-strong (Roboto; Heebo for HE). Focus: 2px solid --functional-focus-blue, offset 2px. Disabled text-disabled/icon-disabled.
- Spacing tokens spacing-* (8/12/16/24...), radii from dimension-* steps, prefer borders over shadows (shadow-small for cards). Icons Lucide stroke-only 12/18/24; Discord logo not in Lucide -> flag ("using X directly, not in icon library") or text-only.
- Purple resolution: DS purple-700 #7c416f = brand-devportal-purple (matches site --devportal-purple). ReadMe #612854 and PBS #653259(=purple-800) are off-system/secondary.
- No logo files in DS yet (only wordmark/samekh assets listed).
- Codebase token names NOT mapped to DS names yet (codebase-mapping.md) -> don't guess.

# Discord CTA requirement (user, 2026-11-18)
- Prominent "Join the Discord" CTAs on homepage, docs, API reference. Max 5-6, strategically placed, design-system compliant.
- Current target: Formstack signup https://sefaria.formstack.com/forms/sefaria_developer_discord_community (i18n key developer.common.discord_signup.url; strings developer.about_you.community.discord.* EN+HE exist).
- Proposed placements (6): home hero secondary; home community band primary; shared docs/reference sidebar footer; docs end-of-page next to feedback; reference request/response panel ("Questions about this endpoint?"); contact-us page.

# Homepage design file (user, 2026-11-18) -> research/design/
- homepage-design-desktop.webp + SVGs: white "Developers on Sefaria" wordmark logo (214x25), wavy lines desktop 1440x130 & mobile 737x100 (7 strokes: #7B7EAD #2C827F #503876 #4E6ABC #C8B165 x2 #AB3A63), g22 = unclipped mobile dupe.
- Design = what the live homepage implements: purple header w/ logo + nav (Docs, API Reference, Github, Jobs, Get In Touch) + search field (⌘K) + 9-dot switcher; hero typing Ref("Shabbat 4b").all_segment_refs(), "Expand Digital Torah", subtitle; wavy lines; carousel card (Yamim Noraim Machzor) + "All Sefaria-Powered Projects" button; 6 tool tiles w/ colored icon squares; purple newsletter band "Stay in the loop" Sign Up; Sefaria wordmark footer.
- Contains placeholder copy ("This is the maximum length...", "dummy text") -> real copy must come from live site.
- Diffs vs live nav: design has Jobs, lacks Home/Donate. Logo text confirms "Developers on Sefaria" naming (Q32).

# DECISIONS (user, 2026-11-18)
- LIVE SITE IS SOURCE OF TRUTH when in doubt (over design files, prototypes, docs).
- HEADER REDESIGN OUT OF SCOPE: open question for designer later. Rebuild keeps the live header (purple bar, nav Home/Docs/API Reference/GitHub/Donate/Get in Touch, search, 9-dot switcher) as-is. Build it so it can be swapped later.
- Mobile homepage design (homepage-design-mobile.*): hamburger + centered "Sefaria Developer Portal" stacked logo + search icon; typing line dropped; hero title/subtitle centered; waves; carousel card full-width w/ peeking neighbors; "All Sefaria-Powered Projects" button; tiles stack single column, centered icon + title with → arrow + text; newsletter band; Sefaria footer. Logo lockup differs from desktop ("Sefaria Developer Portal" vs "Developers on Sefaria") -> live wins; compare with live mobile shot (site/shots/home-mobile-light-full.png).

### 2026-11-10 — wave 4, lane d-shell (shell, static pages, a11y)

- **Library Assistant for signed-out visitors** (parity S3): shown when remote config's `feature.chatbot.anonymous_enabled` is not off,
  without a token, with Sign up / Log in in its login prompt; not on /login and /register. Still missing vs sefaria.org: the phone sheet
  and menu row, the search no-results pointer. (AI-003, AI-011)
- **Static pages start where they do on sefaria.org** (parity S12): 60px higher, build-time CSS only. (STA-001)
- **/mobile, /educators, English /ways-to-give need no Django content mode** (exits F-9). (STA-008, STA-012)
- **Hebrew-interface category descriptions 17.08px / 24px** (parity S12b); library pages mark `dir` with `lang` (a11y N7). (LIB-001, LIB-008)
- **interfaceLang cookie exactly as legacy** (security nit 5): `Domain` per host from DOMAIN_MODULES, session cookie, a stale host-only
  cookie expired; cross-domain switch with `set-language-cookie`; signed-in switches go to Django (profile). (RTE-034)
- **Accessibility**: phone menu opened from the text panel takes focus (S6); Sort & filter dialog returns focus (S7); no page scroll on
  /topics Hebrew at 320px and /updates at 200% (S8); /calendars h1 (N1); one `<main>` on /updates and static pages (N2); topic card
  links underlined (N3); header menus close when focus leaves (N9). (GUI-011, SRC-063, TOP-003, LIB-022, CAL-001, STA-001, TOP-012, I18-007)
- **Dictionary editor** sanitises the stored entry before editing (security nit 3). (CON-072)
- **Rework round 1**: the stale host-only `interfaceLang` is expired on the signed-in switch and on the arrival host's
  `set-language-cookie`; the dictionary editor keeps `<big>` and raster `data:` images (never SVG); the Library Assistant only in the
  Library (never on the Voices host) and not on a password reset, as legacy. (RTE-034, CON-072, AI-011)

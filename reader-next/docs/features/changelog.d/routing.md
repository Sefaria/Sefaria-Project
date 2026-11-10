## 2026-11-10 — routing (wave 1, lane E)

### Built

- **RTE-040** 404 and error pages: the reader's own Page Not Found (legacy wording, in the new shell, noindex) once Django has also answered 404; an HTML 503 page for upstream failures (Retry-After kept).
- **RTE-059** Language-domain redirect: Django's LanguageSettings/LanguageCookie middleware reproduced for the pages the reader's server answers (DOMAIN_MODULES; signed-in readers through a cached probe of Django). _Verified_ Location shape on www.sefaria.org.
- **RTE-037**, **RTE-012**, **RTE-015**: /people, /people/Talmud, /texts/recent, /contributors/<uid>, /random/link and /my/notes answered by the reader's server. _Verified_ against www.sefaria.org.

### Deliberate differences

- **RTE-015** /my/notes goes to /texts/notes (the new reader's notes page), not the Voices profile.
- **RTE-040** the 404 page is noindex (live's is not).
- **VER-017** a version source that is not an address is plain text, not a link to Django's 404.

# GA4 requirement (user, 2026-11-18): keep basic GA4 on developers.sefaria.org — don't lose it
- Property "DevPortal" on account sefaria.org; measurement ID seen live: G-6SXQFSB219 (reference crawl). Rebuild must fire into SAME property (continuity).
- Traffic snapshot (Oct–Nov 2026) was reviewed; numbers kept out of the repo. Channels include Direct, Organic, Referral, Email and AI Assistant.
- Events in use: page_view, session_start, scroll, first_visit, user_engagement, click (outbound, enhanced measurement), form_start. No key events/conversions configured.
- Reports keyed on PAGE TITLE -> keep document.title identical per page for continuity (e.g. homepage title "Sefaria", "Getting Started With the Sefaria API", "Texts (v3)"). Endpoint titles = spec summaries.
- SPA: must send page_view on client-side route changes (ReadMe is SPA; avoid double-counting).
- "404 Not Found" is a top page -> existing broken inbound links; redirect map + 404 logging worth it.
- Translated titles (RU/HE/AR/ZH) appear = browser auto-translate; ignore.
- Opportunity (ask): add key events for Discord CTA clicks, Try It, Copy page/MCP, contact form; powered-by gallery has its own GA4/Plausible -> merge into same property or keep separate?

## DECISIONS (user, 2026-11-18)
- Add GA4 key events: YES (Discord CTA clicks, Try It runs, Copy page/MCP actions, contact form starts).
- Powered-by gallery GA: KEEP SEPARATE for now, pending analyst check. Build so the property is configurable per section (easy to merge later).

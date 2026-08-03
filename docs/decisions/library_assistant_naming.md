# Naming: `chatbot` vs `library_assistant`

Both names are correct, for different things. There is no mass rename planned, and code
review should not treat a `chatbot`-named identifier as a leftover.

## `library_assistant` — the product

The user-facing feature and everything Sefaria owns about the user's relationship to it:

- the user setting `profiles.settings.library_assistant` and its helper module
  `sefaria/helper/library_assistant.py`
- the opt-in landing route `/enable-library-assistant`
- UI components named for what the user sees, e.g. `LibraryAssistantPromoBanner`

## `chatbot` — the vendor / wire name

The thing the assistant actually is on the wire, and every contract written against it:

- the external bundle is genuinely `lc-chatbot` (`lc-chatbot.umd.cjs`), served from the
  chatbot service; the props that carry it (`chatbot_script_url`, `chatbot_user_token`,
  `chatbot_api_base_url`, `chatbot_version`) name that service
- remote-config keys (`CHATBOT_MAX_INPUT_CHARS`, `SHOW_JOIN_CHATBOT_BANNER`, …)
- the Salesforce webhook contract (`send_chatbot_opt_in_webhook`) and its payload
- Sentry and analytics identifiers already in use, where a rename would break continuity

Renaming any of these costs continuity — dashboards, saved queries, config keys and a
third-party integration contract — and buys nothing a comment can't.

## Deliberate exceptions

- The promo banner's dismissal storage key stays `chatbot_experiment_banner_dismissed`.
  Renaming it would reset every user's dismissal history and start nagging them again.
- The analytics `experiment` field is Guided Learning's "Experiment" pill, unrelated to
  the retired experiments program and to the Library Assistant. Leave it alone.

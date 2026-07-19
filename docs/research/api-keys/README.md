# API Key Research (sc-45692)

Research for [sc-45692 — "[8hr max] Research API key best practices and write an ADR"](https://app.shortcut.com/sefaria/story/45692),
part of the "Track off-Platform Data Usage" epic. Goal: the knowledge needed to engage product on
introducing API keys — self-serve issuance, first- vs third-party differentiation, usage tracking,
and an extended anonymous grace period. **These docs are research input; the ADR is compiled from
them (start with [10-decision-points.md](./10-decision-points.md)).**

Produced July 2026 with Claude (codebase audit by code-reading agents; industry surveys by
web-research agents; every external claim carries an inline source URL, with unverified items
flagged).

| Doc | Contents |
|---|---|
| [00-brief.md](./00-brief.md) | Shared context: the problem, traffic-inventory numbers, stack constraints, consumer table |
| [01-current-state.md](./01-current-state.md) | Code-level audit of today's auth surface: legacy `apikeys`, fragmented credentials, the Varnish cache-key constraint, per-consumer call patterns |
| [02-survey-open-content-apis.md](./02-survey-open-content-apis.md) | Wikimedia, Crossref, Internet Archive, Europeana, NYT, api.data.gov/NASA, Met, DPLA — how open-content orgs key (or don't) |
| [03-survey-commercial-platforms.md](./03-survey-commercial-platforms.md) | Stripe, GitHub, Google Maps, OpenAI/Anthropic, Twilio — key formats, publishable-vs-secret, restrictions, rotation, portals |
| [04-key-design-fundamentals.md](./04-key-design-fundamentals.md) | Token taxonomy, transport, generation/format, storage, standards (OWASP/IETF), pitfalls, Django building blocks |
| [05-first-vs-third-party.md](./05-first-vs-third-party.md) | Publishable keys, origin binding, attestation, per-site widget IDs, spoofability matrix, application to our five consumer types |
| [06-rate-limiting-usage-tracking.md](./06-rate-limiting-usage-tracking.md) | Metering pipelines, anonymous+keyed coexistence, algorithms, enforcement location, three concrete architectures for our stack |
| [07-gateway-platform-options.md](./07-gateway-platform-options.md) | Kong/Tyk/APISIX/KrakenD, Envoy Gateway native, Cloudflare/Apigee/Zuplo/Unkey, portal SaaS — feasibility vs our stack |
| [08-rollout-migration.md](./08-rollout-migration.md) | Case studies (Google Maps 2018, Wikimedia, Crossref, Twitter/Reddit 2023), deprecation machinery, three rollout playbooks |
| [09-self-serve-portal-ux.md](./09-self-serve-portal-ux.md) | Portal UX patterns, the app/project abstraction, ToS acceptance, build-vs-buy, minimal vs fuller scope |
| [10-decision-points.md](./10-decision-points.md) | **Synthesis: the seven decisions, recommendations, and what goes to product — the ADR skeleton** |
| [11-anonymous-tier-options.md](./11-anonymous-tier-options.md) | Product-facing menu: the escalation ladder for unkeyed traffic (warn → advertised limits → throttle), the Varnish/Envoy constraint picture, registration-friction options, convergence with the abuse track |
| [12-product-decisions.md](./12-product-decisions.md) | **The 2-page product deliverable**: five decisions (key issuance/SSO, registration fields, Linker registration, users-vs-projects, terms) + touchpoint list; assumes the settled API Key Program architecture |

# User answers to atlas questions (2026-11-18)

Rules: live site = source of truth when in doubt. Header redesign out of scope (copy live header as swappable component).
Q1 third django-hosts host: YES unless tech/devops complexity very high.
Q2 frontend stack: PENDING (explained options; awaiting choice).
Q3 storage: retire developer-docs repo. DB + easy editing path is fine (no git export required).
Q4 editors: any Sefaria staff (is_staff), no review.
Q5 editor scope: rec (tree w/ drag reorder, in-place WYSIWYG, slash menu, all used components, visibility, page settings, revisions, draft/publish). Defer AI edit/linter/comments/branches/reusable/glossary. Only AI parity needed = existing developers MCP (+ plan for maintaining it ourselves).
Q6 images: GCS bucket, developers/ prefix.
Q7 endpoint overlay only (no write-back); .md/llms/MCP read overlay.
Q8 no custom code samples / response examples.
Q9 direct calls, per-browser recent requests, feedback in Postgres. BUT: API key requirement coming for all Sefaria API calls -> design for a public example/demo key in Try It + code samples (needs design).
Q10 httpsnippet languages, fetch default for Node. CRITICAL: no security concerns/backdoors in live interactive calls.
Q11 reference pixel parity incl header (live); fix invisible a11y/CSS bugs. Agents must LOOP checking pixel parity (visual diff harness).
Q12 /api/async out of scope.
Q13 Spectral blocking CI: yes.
Q14 live homepage + designer SVG assets; carousel/tiles editable.
Q15 client-side search: yes (complexity estimate given).
Q16 no Ask AI; Copy Page menu (copy markdown / open in LLM / MCP / view md) on EVERY page.
Q17 migrate EVERYTHING incl unfinished news page (keep hidden flags); fix broken links.
Q18 font: DESIGN SYSTEM (Roboto) — overrides live (easy win).
Q19 docs MCP rebuild / tools/list POST: ASK AN EXPERT — remind user.
Q20 yes: .md, Accept negotiation, llms.txt per section, .well-known, Copy Page; add llms-full.txt.
Q21 keep Formstack embeds/links.
Q22 ActiveCampaign newsletter: keep; add to POST-CAULDRON question list.
Q23 Discord: Formstack signup, text-only, 6 placements as proposed.
Q24 gallery at developers.sefaria.org/powered-by, redirects from powered-by.sefaria.org + sefaria.org/powered-by; /powered-by/charts unlisted.
Q25 keep gallery layout, shared tokens; font license OK (in DS).
Q26 PENDING clarification (correction: `featured` already exists in model+API; only `featured_order` missing).
Q27 header: ask designer once site is live.
Q28 login/API keys: out of scope; ask after cauldron launch.
Q29 as live (EN); future: add Hebrew page.
Q30 dark mode out of scope; follow-up candidate.
Q31 purple: live #612854 where used today; new elements (Discord CTAs) follow DS.
Q32 "Developers on Sefaria", link behavior as live.
Q33 target end of Q4 2026; cauldron ASAP -> 6 weeks for decision.
Q34 ONE PR (structured commits per phase).
Q35 ignore.
OPEN: mobile hero gap (copy live vs treat as bug).

# Post-cauldron question list

- Q22 newsletter provider (ActiveCampaign vs CRM newsletter_service)
- Q27 header redesign w/ designer (+ UX brief's 17 questions, Roboto/purple alignment)
- Q28 login/account menu/API keys in portal
- Gallery GA4 merge (analyst)

# Follow-up candidates

- Dark mode (Q30); Hebrew page (Q29); /api/async in spec (Q12); in-app developer settings (Q35)

# Reminders for user

- Q19: ask expert about docs MCP rebuild + permission to POST tools/list to live MCP.

# Final answers (2026-11-18, later)

- Q2: A + A1 (separate Vite/React19/TS bundle in Sefaria-Project served by Django; Django renders content HTML server-side, React enhances).
- Q26: featured_order + carousel-from-featured = FUTURE IMPROVEMENT, out of scope.
- Q19: keep as a note (ask expert re docs MCP + tools/list POST + MCP maintenance).
- Mobile hero gap: treat as BUG; use mobile design spacing for hero only.

# Docs MCP (2026-11-18)

- Rebuild the docs MCP here at developers.sefaria.org/mcp (easiest option). Copy the live tool surface from research/site/machine/mcp-tools-list.json: list-endpoints, get-endpoint, search-endpoints, execute-request.
- execute-request takes any URL. Rebuilt on our server it would be an SSRF hole, so lock it to www.sefaria.org and the spec's endpoints.
- NOTE FOR TEAM: ask for guidance on the MCP's long-term home (here vs mcp.sefaria.org) and who owns its maintenance (ReadMe maintains it today).

# Planning

- The plan is written by Fable in a Claude Code session on this branch, with repo access (see PLANNING_BRIEF.md). Execution is by Opus with parallel builder agents and continuous verifier agents.

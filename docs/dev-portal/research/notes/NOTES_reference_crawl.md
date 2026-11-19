# Reference crawl summary (agent 1; full: atlas/reference/REFERENCE_SPEC.md)
- BLOCKED: cdn.readme.io/files.readme.io/try.readme.io denied -> no styled shots/measurements. Rerun script ref-crawl/cssvars-live.js once allowed. Slack ping sent asking user to allow cdn.readme.io + files.readme.io.
- Try It: ReadMe proxies via try.readme.io, but www.sefaria.org sends ACAO:* and preflight OK for find-refs POST -> call API directly, no proxy needed.
- No dark mode (forced light). Primary #612854, links #666/#333, Open Sans; code samples CodeMirror material-palenight.
- No tag landing pages: /reference/<tag> -> first endpoint; /reference -> /reference/getting-started.
- Sidebar order from developer-docs _order.yaml; Index tag split into two groups (index, index-1). get-v1-texts & get-topic-slug deprecated style.
- Title = op.summary || path.summary (verified all 61); description = op.description only. My earlier "Index (v2)" worry RESOLVED: that's get-v2-index (separate op), no dashboard-only overrides.
- Params: text/number inputs w/ example placeholder & default prefill; enums -> select + "Allowed:" chips; "Defaults to", required, enum labels; object body "+" expand; anchors #query-params-<name>; Response vs Responses.
- Request panel langs: Shell(default), Node, Ruby, PHP, Python + More Languages. No auth box. Recent Requests (ReadMe Metrics).
- Chrome: Copy Page + menu (View as Markdown, Open in ChatGPT/Claude/Copilot, MCP install: command/config/Cursor/VS Code). Ask AI disabled. "Updated N months ago", prev/next, "Did this page help you?" Yes/No + comment, Cmd-K search, Cmd-/ sidebar filter.
- Agent features: .md variants + Accept: text/markdown negotiation (md includes per-endpoint spec slice); Link headers (api-catalog, MCP server card, agent-skills, md); /llms.txt, /.well-known/api-catalog, /.well-known/agent-skills/index.json, /mcp, hidden "For AI agents" banner.
- 3rd party: GA G-6SXQFSB219, Cloudflare bot mgmt; ReadMe's own telemetry (Amplitude, Sentry, FullStory, HubSpot, Wootric, Novu).
- Breakpoints (Sefaria custom CSS): 737/738, 796, 1070/1071, 1280, 1400, 1440, 1600 (mostly landing page; 9-dot site switcher on ref pages).
- a11y oddities in original: response accordion inside <h1>, footer outside main.

## Pass 2 (styled; 55 shots in atlas/reference/shots)
- SIDE EFFECT to tell user: ReadMe page JS auto-POSTed ~20 pageview beacons + 3 request logs to developers.sefaria.org metrics-proxy before agent blocked them; 4 Try It calls total (2x v3 Genesis 1:1, 1x 404, 1x find-refs). Feedback widget opened, not submitted.
- Corrections: font = system UI stack (Open Sans config unused) + system mono; ReadMe icon font only webfont. Sidebar groups collapsible (current group open); sidebar collapse persisted in localStorage. First response example "200 - Esther 1.1" shown on load; response schema accordion collapsed. Header single 65px row; Library/Voices/Developers/More only in 9-dot menu. Enum chips copy to clipboard.
- Measured: sidebar 288px sticky; Try It panel 480px (432 content); center 32px pad, max 800px. 1066-1299 center shrinks to 292px min; <=1065 Try It drops below article; <=768 mobile 103px header + hamburger + sidebar dropdown. 484 CSS vars resolved.
- Badges: GET #008756, POST #0222c6, PUT #6d5ba6, PATCH #df7d03, DELETE #cb4452. Try It button #612854, hover ReadMe blue.
- Try It: via try.readme.io/<url>, header x-readme-api-explorer 5.968.3, no cookies. Response panel: status dot + code dropdown (examples, Clear Response), Headers modal (req+resp), copy, JSON w/ line numbers, no timing. Recent Requests: per-browser anonymous log.
- Languages: Shell, Node, Ruby, PHP, Python + More (Agent Prompt, C, C#, C++, Clojure, Crystal, Go, HTTP, Java, JavaScript, JSON, Kotlin, Obj-C, OCaml, PowerShell, R, Rust, Swift). Node libs: Axios, fetch, http, api (default; "Path Params" -> "Metadata").
- Copy Page menu: Open in ChatGPT, Open in Claude, Connect to Cursor, Connect to VS Code, Copy MCP Config, Copy MCP Command, View as Markdown.
- Unverified: GA, trackers, search results render, hover/focus beyond Try It, 1065 viewport vs container, macOS fonts.

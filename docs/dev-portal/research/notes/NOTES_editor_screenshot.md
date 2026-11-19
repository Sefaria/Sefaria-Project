# ReadMe admin editor (from user screenshot, 2026-11-18)
Requirement: comms folks get the SAME editing experience.
- Top bar: version (v1.0) > Branches (+ create branch), View/Edit toggle, history (clock), overflow menu.
- Left rail: Sections (Docs, Recipes, API Reference, Changelog, Custom Pages); Reusable Content (Custom Components, Reusable Content, Glossary); Ask AI; Feedback.
- Pages tree pane: section-grouped (TECHNICAL DOCS), nested collapsible pages, "+ New" page; (drag reorder presumably).
- Page toolbar: Add Icon, page type dropdown (Page/link/etc), visibility (Public/hidden), kebab menu.
- Canvas: WYSIWYG in-place — title, excerpt/subtitle, rendered headings, links, callouts (emoji + theme), rendered as on live site. "Edit with AI..." floating on selection.
- Right rail: blocks/components inserter, comments, page settings (gear); mini TOC.
- Bottom bar: Run AI Linter, settings, Save to Branch, Save (publish).

## Screenshot 2: API Reference section in editor
- Same editor applies to API Reference section. Tree: "API Definitions" entry (spec management), built-in pages (Getting Started / Authentication / My Requests = ReadMeConfig, greyed), WELCOME group (Getting Started, Tutorials w/ 4 children, FAQ = editable md pages), SEFARIA API group = tags > endpoints with GET/POST badges, deprecated/warning icon (Texts v1).
- RULE: endpoint content from openAPI.json is READ-ONLY in the GUI (source of truth = docs/openAPI.json in git). Editors can edit the reference-section md pages (welcome/tutorials) and probably tag/endpoint ordering/titles? -> confirm.
- Tree items have per-row kebab + "+" (add child page).
- The treemap in data-viz tutorial is a static image (files.readme.io screenshot), not live.

## Screenshot 3: endpoint page in editor (Texts (v3))
USER REQUIREMENT: next to spec-generated content, editors must be able to edit:
  * sidebar position + name, * title, * description, * add future markdown (free markdown block on endpoint page, "Type / for blocks and AI")
- Editor shows: page type "API Endpoint", Public toggle, GET + URL, description, free markdown area, then API Designer/Code tabs (ReadMe warns "some items cannot be edited... common parameters, references" -> edit in Code). Params sections (Path/Query/Header) each with +.
- Right column: CUSTOM CODE SAMPLES (dynamic samples auto-generated for 20+ langs; option to write static samples), CUSTOM RESPONSE EXAMPLES (+; e.g. "200 Esther 1.1").
- FINDING: developer-docs/reference/sefaria-api.json is byte-identical (parsed) to Sefaria-Project docs/openAPI.json. Endpoint .md files have no title/body. Titles come from spec summary (op-level or path-item-level). Some sidebar labels in screenshot ("Index (v2)", "Table of Contents") don't obviously match spec summaries (get-index-v2 path summary = "Index Metadata (v2)") -> possible dashboard-only overrides NOT in git sync; verify against live crawl.
- DESIGN IMPLICATION: overlay model. Spec stays source of truth for params/schemas/examples; a DB/markdown overlay keyed by operationId holds sidebar label/order, title, description override, extra markdown. Open Q: should GUI title/description edits write back to openAPI.json (via PR) or live only in overlay?

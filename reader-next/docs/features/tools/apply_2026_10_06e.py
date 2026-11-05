"""Analytics (owner decision 2026-10-06: one module, same property, same event names and parameters). Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["ANL-001","ANL-003","ANL-004","ANL-005","ANL-006","ANL-007","ANL-008","ANL-009","ANL-010","ANL-011","ANL-012","ANL-014","ANL-015","ANL-016","ANL-017","SRC-104","SRC-105","SRC-106","SRC-107","SRC-108"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
VER = "VERIFIED 2026-10-06 (scripts/probes/anl-probe.mjs, dataLayer recorded on www.sefaria.org/Genesis.1): "
add("ANL-014", [VER + "GTM container + gtag config G-5S6RP1RFZ2 {user_id, traffic_type, site_lang:'english', site_version:'v7.2.3-prod.2'}; GTM also loads a legacy property G-P6B48B03CT ('is_legacy_loaded') and a `ga` shim, so Sefaria.track.event (Universal Analytics) calls are still converted into GA4 events.",
  "Rebuild: src/lib/analytics/scripts.ts writes GTM, gtag (same config) and Simple Analytics (stub, sa_metadata, latest[.dev].js with DNT) from env GOOGLE_TAG_MANAGER_CODE / GOOGLE_GTAG / SIMPLE_ANALYTICS_HOSTNAME / APP_VERSION; each off when unset (development, tests). Helm (reader mode) reads the IDs from the local-settings secret by key. NOT ported: VWO (hides <body> until loaded), Hotjar, Unbounce — owner decision."])
add("ANL-016", ["Rebuild: uaEvent(category, action, label, value) sends through GTM's ga shim with the tracker name (as track.js), only when the shim is present. TrackG4.gtagClick (onclick_ToolTipped) belongs to promotions/AdContext — not built."])
add("ANL-015", ["Rebuild: src/lib/analytics/declarative.ts, a port of analyticsEventTracker.js (same whitelist, closest-wins aggregation, data-anl-batch, derived toggle/input data, scrollIntoView and inputStart) attached to the app root. Module switcher uses it (modswitch_open/close/item_click)."])
add("ANL-017", ["Rebuild: src/lib/analytics/sentry.ts — @sentry/react loaded on demand when CLIENT_SENTRY_DSN is set; release = APP_VERSION; tracing + replay; sample rates from /api/remote-config feature.client.remote_config_json.sentry (VERIFIED live: sampleRate 1.0, others 0)."])
add("ANL-008", ["Rebuild: useAppAnalytics — reader_app_mounted once per session, intersection_observer_not_supported once per browser, print on beforeprint, visitor marking (waits for sign-in state)."])
add("ANL-003", ["Rebuild: SiteHeader and CategoryColorLine report header_viewed (sa + gtag) once per session via useOnceFullyVisible (shared key sa.header_viewed, checked when the element mounts — as on the old site, both report only when they mount before either fires)."])
add("ANL-005", ["Rebuild: useOnceFullyVisible (callback ref, so elements that appear after mount are observed)."])
for i in ["ANL-004", "ANL-006"]: add(i, ["Rebuild: src/features/shell/BannerImpressionProbe.tsx (same delays, style and session key sa.banner_probe)."])
add("ANL-007", ["Rebuild: src/lib/analytics/search-box.ts — search_focus, search_defocus {text}, search_navto (keyboard with link_type; mouse without), search_submit (Search Results / Autolink), plus the old Track 'Search Box …' events."])
add("ANL-009", ["Rebuild (src/lib/analytics/reader.ts): select_content on opening a text; Text Segment Click (+ Open Connections Panel when no sidebar), Citation Link Click, Named Entity Link Click, Change Language (aleph buttons and the sidebar's), Choose Version, Other Text Click. NOT sent: Display Option Click (FOUND: only the retired ToggleOption sent it; the current display menu sends nothing), Set Translation Language Preference (the setting is not in this client)."])
add("ANL-012", ["Rebuild: feature_clicked {name: tools_button_<en>} + Tools '<mode> Click' (account tools only when signed in), Connections Category / Category Filter / Text Filter Click, Click Text from TextList, onClick_version_title / onClick_select_version, Version Download, Send Feedback, Lexicon Open[/No Result] and Click Dictionary Entry from Lookup. Guide events wait for Guided Learning."])
add("ANL-011", ["Rebuild: TextColumn onCopy → copy_text {length, panelType, book, category}, bilingual_copy_text, spanning_copy_text (primary/translation sides counted as .he/.en)."])
add("ANL-001", ["Rebuild: page views come from the same GTM container and gtag config (GTM history triggers / GA4 enhanced measurement), as on the old site; nothing to call from the client. saveLastPlace is part of signed-in history (Phase 7c)."])
add("ANL-010", ["Confirmed dead (the pageview call is commented out): not ported."])
for i in ["SRC-104","SRC-105","SRC-106","SRC-107","SRC-108"]:
    add(i, ["OWNER DECISION 2026-10-06: build analytics with the old names and parameters. BUILT: src/lib/analytics/search-flow.ts (port of searchAnalytics.js) wired in src/features/search/use-search-analytics.ts; e2e/analytics.spec.ts checks the funnel against the live API (deep_link and nav_bar sources, four-API completion, tab and result clicks, flow end)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
done = {"ANL-003":"src/ui/SiteHeader","ANL-004":"src/features/shell/BannerImpressionProbe.tsx","ANL-005":"src/lib/analytics/session.ts","ANL-006":"src/features/shell/BannerImpressionProbe.tsx","ANL-007":"src/lib/analytics/search-box.ts","ANL-008":"src/lib/analytics/session.ts","ANL-011":"src/lib/analytics/session.ts","ANL-015":"src/lib/analytics/declarative.ts","ANL-016":"src/lib/analytics/core.ts","ANL-017":"src/lib/analytics/sentry.ts","SRC-104":"src/lib/analytics/search-flow.ts","SRC-105":"src/features/search/use-search-analytics.ts","SRC-106":"src/features/search/use-search-analytics.ts","SRC-107":"src/lib/analytics/search-box.ts","SRC-108":"src/lib/analytics/search-flow.ts"}
for k, v in done.items(): st[k] = {"status": "done", "by": v}
st["ANL-009"] = {"status": "partial", "note": "Built for the reader; Display Option Click is dead on the old site; translation preference setting not in this client", "by": "src/lib/analytics/reader.ts"}
st["ANL-012"] = {"status": "partial", "note": "Built for the sidebar views this client has; Guide, notes and sheet events wait for those features", "by": "src/lib/analytics/reader.ts"}
st["ANL-014"] = {"status": "partial", "note": "GTM, gtag, Simple Analytics, Sentry built; VWO / Hotjar / Unbounce need an owner decision", "by": "src/lib/analytics/scripts.ts"}
st["ANL-001"] = {"status": "done", "note": "Page views come from GTM / gtag as on the old site", "by": "src/lib/analytics/scripts.ts"}
st["ANL-010"] = {"status": "n/a", "note": "Dead on the old site"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)

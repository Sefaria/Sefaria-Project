# C8: analytics events

Contract C8 of [PLAN.md](../../docs/dev-portal/PLAN.md) §4.3, from §2.13. The TypeScript form is `devportal-ui/src/analytics/events.ts`; `events.test.ts` pins it to this page. Nothing outside this list is sent. A change goes through the Integrator.

## Loading

- One module, `devportal-ui/src/analytics/`, loads `gtag` with the measurement id `site.ga4[site.analyticsSection]` from the page payload (C3). `site.ga4` is the setting `DEVPORTAL_GA4`, for example `{"default": "G-6SXQFSB219", "gallery": "G-44RHV2ZWQ1"}`. An empty mapping (the default outside production) loads nothing and sends nothing.
- `gtag('config', id, { send_page_view: false })`. Enhanced measurement stays on in the property (scroll, outbound click, form start).
- The gallery keeps its own Plausible-style events and its own GA4 property (`analyticsSection: "gallery"`).

## Events

| Event                | Parameters                                                                                     | Sent when                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `page_view`          | `page_title` (string), `page_location` (string, full URL)                                      | Exactly once on the first load and once per client-side navigation, after `document.title` is set. GA4's standard parameters |
| `discord_cta_click`  | `placement`: one of the six below                                                              | A Discord button is clicked                                                                                                  |
| `try_it_run`         | `operation_id` (string), `method` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), `status` (number) | A Try It request finishes. `status` is the HTTP status, or `0` when it failed without a response (network error, CORS)       |
| `copy_page_action`   | `action`: one of the eight below                                                               | A Copy Page action is used: the split button's left half, or a menu item                                                     |
| `contact_form_start` | none                                                                                           | Once per page view, when focus first moves into the Formstack frame on `/page/contact-us`                                    |

The four events after `page_view` are the property's key events. `document.title` is the page title with nothing appended: "Sefaria" on the homepage, the summary on endpoint pages, "404 Not Found" on the 404 page.

### `placement` values

| Value                     | Where                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `home_hero`               | Homepage hero, secondary (white) button (I-3)                  |
| `home_community`          | Homepage community band, primary button (I-3)                  |
| `sidebar_footer`          | Bottom of the docs and reference sidebar                       |
| `docs_page_end`           | End of a docs page, next to the feedback widget                |
| `reference_request_panel` | The reference request panel ("Questions about this endpoint?") |
| `contact_page`            | `/page/contact-us`                                             |

### `action` values

| Value              | Control                 |
| ------------------ | ----------------------- |
| `copy_markdown`    | "Copy Page" (left half) |
| `view_markdown`    | "View as Markdown"      |
| `open_chatgpt`     | "Open in ChatGPT"       |
| `open_claude`      | "Open in Claude"        |
| `connect_cursor`   | "Connect to Cursor"     |
| `connect_vscode`   | "Connect to VS Code"    |
| `copy_mcp_config`  | "Copy MCP Config"       |
| `copy_mcp_command` | "Copy MCP Command"      |

## Privacy

Parameters never contain parameter values, search text, API keys, response bodies or anything a visitor typed. `operation_id` is the spec's `operationId`, never a filled-in URL. `page_location` is the page URL without anything a visitor entered on the page.

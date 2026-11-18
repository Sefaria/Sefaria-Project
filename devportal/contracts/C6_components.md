# C6: component names and accessibility

Contract C6 of [PLAN.md](../../docs/dev-portal/PLAN.md) §4.3. It names the portal's components and gives each one its landmark, role and accessible name. Page objects (C7), Playwright locators (`getByRole(role, { name })`) and the Vitest axe checks rely on these, so a name changes only through the Integrator.

**Rule: copy live.** Where live has a landmark, role or name, the portal uses the same one, character for character (sources: `research/reference/REFERENCE_SPEC.md` §5, `research/reference/dom-outlines/*.outline.txt`, `research/site/chrome.json`, live's UI strings in `research/reference/data/i18n-en.json`). Where live has an invisible accessibility bug, the portal fixes it (Q11); each fix is marked **fix**. Where live markup was not captured, the entry is marked **new** and its builder confirms it on live (GET only) before building.

Columns: _Element_ is the HTML element or ARIA role; _Name_ is the accessible name, quoted exactly. `aria-current="page"` marks the current item in every navigation.

## Page skeleton

| Component      | Owner | Element / role                            | Name              | Notes                                                                                                 |
| -------------- | ----- | ----------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `AgentBanner`  | W8    | `div aria-hidden="true"`, visually hidden | (none)            | First child of `<body>`; text copied from live ("For AI agents: the docs index is at …")              |
| `SkipLink`     | W2    | `a href="#content"`                       | "Jump to Content" | First focusable element                                                                               |
| `PortalHeader` | W2    | `header` (banner)                         | (none)            | Self-contained; imports nothing else from the shell                                                   |
| `PortalMain`   | W2    | `main`                                    | (none)            | One per page. Holds the sidebar, the article and the right column, as live's `main#Explorer`          |
| `Article`      | W2    | `article id="content"`                    | (none)            | Skip-link target                                                                                      |
| `StatusBanner` |       | not built                                 |                   | Live's empty `footer aria-label="Status banner"` carries ReadMe banners only; it has no function here |

## Header (`src/shell/PortalHeader`)

| Component          | Element / role                                    | Name                                                                          | Notes                                                                                                                             |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HeaderLogo`       | `a href="/"` wrapping `img`                       | "Developers on Sefaria"                                                       | **fix**: live's `img` has no `alt`                                                                                                |
| `PrimaryNav`       | `nav`                                             | "Primary navigation"                                                          | Links: "Home", "Docs", "API Reference", "GitHub", "Donate", "Get in Touch"; GitHub and Donate open new tabs                       |
| `SearchToggle`     | `button`                                          | "Search ⌘k"                                                                   | As live, whatever the platform; the visible key hint reads `CTRL-K` or `⌘K`                                                       |
| `LinksMenuButton`  | `button aria-haspopup="dialog"` + `aria-expanded` | "Open links menu"                                                             | Menu links: "Sefaria Library", "Voices at Sefaria", "Developers", "More from Sefaria ›"                                           |
| `MobileMenuButton` | `button` + `aria-expanded`, `aria-controls`       | "Toggle navigation menu"                                                      | ≤768 only                                                                                                                         |
| `MobileDrawer`     | `div` (flyout) with links                         | (none)                                                                        | Links: "Home", "Docs", "API Reference", "GitHub", "Donate", "Get in Touch", "Sefaria Library", "Voices on Sefaria", then the logo |
| `MobileSubnav`     | `button` + `aria-expanded`                        | The current page's title, e.g. "Welcome to Sefaria's Technical Documentation" | ≤768; opens the sidebar as a panel                                                                                                |

## Sidebar (`src/shell/Sidebar`)

| Component            | Element / role                                                | Name                                                       | Notes                                                                |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `Sidebar`            | `nav`                                                         | "Secondary navigation"                                     | `id="reference-sidebar"` on reference pages, as live                 |
| `SidebarFilter`      | `input type="search"`, `aria-keyshortcuts="Control+/ Meta+/"` | "Filter pages"                                             | Placeholder "Filter"                                                 |
| `SidebarCategory`    | `section` with `h2`                                           | the category title                                         | Stored mixed case, upper-cased by CSS                                |
| `SidebarLink`        | `a`                                                           | the page title                                             | Endpoint rows also show the method pill text ("get", "post")         |
| `SidebarGroupToggle` | `button aria-expanded`                                        | "Show subpages for X" / "Hide subpages for X"              | X is the row's title                                                 |
| `DeprecatedMarker`   | `button`                                                      | "Deprecated Endpoint" (reference), "Deprecated Doc" (docs) |                                                                      |
| `ExternalLinkIcon`   | decorative `svg aria-hidden="true"`                           | (none)                                                     | On `link` rows                                                       |
| `SidebarCollapse`    | `button`                                                      | "Hide sidebar navigation"                                  | When collapsed, "Show sidebar navigation" (**new**: confirm on live) |
| `SidebarFooter`      | `div` holding the `DiscordButton`                             | (none)                                                     | Replaces "Powered by ReadMe" (I-12); placement `sidebar_footer`      |

## Article header and right rail

| Component            | Element / role                                  | Name                                                                                                                                      | Notes                                                                      |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `PageTitle`          | `h1`                                            | the page title                                                                                                                            | Exactly one `h1` per page (**fix**: see responses below)                   |
| `CopyPageButton`     | `button`                                        | "Copy Page"                                                                                                                               | Left half of the split button                                              |
| `CopyPageMenuButton` | `button aria-haspopup="menu"` + `aria-expanded` | "Copy Page options"                                                                                                                       | **fix**: live's chevron button has no name                                 |
| `CopyPageMenu`       | `menu` role with `menuitem`s; a `group` "MCP"   | "Open in ChatGPT", "Open in Claude", "Connect to Cursor", "Connect to VS Code", "Copy MCP Config", "Copy MCP Command", "View as Markdown" | **fix**: no coloured dots (brief §4.3)                                     |
| `TagsButton`         | `button aria-haspopup="dialog"`                 | "View tags"                                                                                                                               | Endpoint pages                                                             |
| `CopyUrlButton`      | `button`                                        | "Copy to clipboard"                                                                                                                       | Endpoint URL line                                                          |
| `TableOfContents`    | `nav`                                           | "Table of Contents"                                                                                                                       | **new**: name from live's string `common.tableOfContents`; docs pages ≥769 |
| `HeadingAnchor`      | `a href="#<id>"`                                | "Skip link to <heading text>"                                                                                                             | Same wording as the reference section anchors                              |

## Page footer

| Component         | Element / role                  | Name                                            | Notes                                                              |
| ----------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `UpdatedAt`       | `p` with `time datetime`        | (text) "Updated 6 months ago"                   |                                                                    |
| `Pagination`      | `nav`                           | "Pagination Controls"                           |                                                                    |
| `PaginationLink`  | `a`                             | "Previous Page: <title>" / "Next Page: <title>" |                                                                    |
| `FeedbackYes`     | `button aria-haspopup="dialog"` | "Yes, this page helped me"                      | Visible text "👍 Yes" after "Did this page help you?"              |
| `FeedbackNo`      | `button aria-haspopup="dialog"` | "No, this page did not help me"                 |                                                                    |
| `FeedbackPopover` | `dialog` (non-modal)            | "Did this page help you?"                       | **new** name                                                       |
| `FeedbackComment` | `textarea`                      | "Leave an optional comment…"                    | Placeholder and `aria-label` (**fix**: placeholder is not a label) |
| `FeedbackSubmit`  | `button`                        | "Vote"                                          | Sends the C3 `feedback-request`                                    |

## API reference (`src/reference/`)

| Component             | Element / role                                                                     | Name                                                                                      | Notes                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SectionHeader`       | `h2` with an anchor `a`                                                            | "Path Params", "Query Params", "Body Params", "Response" / "Responses", "Recent Requests" | **fix**: live uses non-heading `header`s. Ids `path-params`, `query-params`, `body-params`, `response-schemas` |
| `SectionAnchor`       | `a href="#path-params"`                                                            | "Skip link to Path Params" (and so on)                                                    |                                                                                                                |
| `ParamRow`            | `div id="{in}-params-{name}"`                                                      | (none)                                                                                    |                                                                                                                |
| `ParamAnchor`         | `a`                                                                                | "Skip link to <param name>"                                                               |                                                                                                                |
| `ParamInput`          | `input` with `label for`; `role="combobox"` + `aria-expanded` when it has examples | the parameter name                                                                        | Select when the schema has `enum`                                                                              |
| `AllowedValueChip`    | `button`                                                                           | the value                                                                                 | Copies the value; tooltip "Copied!"                                                                            |
| `ResponseToggle`      | `h3 > button aria-expanded`                                                        | "<status> <description>", e.g. "200 Successful Response"                                  | **fix**: live wraps each toggle in an `h1`                                                                     |
| `StatusDot`           | `span role="img"`                                                                  | the status code, e.g. "200"                                                               |                                                                                                                |
| `LanguageButton`      | `button aria-pressed`                                                              | "Shell", "Node", "Ruby", "PHP", "Python"                                                  |                                                                                                                |
| `MoreLanguagesButton` | `button aria-haspopup="dialog"`                                                    | "More Languages"                                                                          | 18 entries, starting "Agent Prompt"                                                                            |
| `LibraryMenuButton`   | `button aria-haspopup`                                                             | its visible label, e.g. "cURL Request"                                                    | Node: "Axios", "fetch", "http"                                                                                 |
| `CopyCodeButton`      | `button`                                                                           | "Copy to clipboard"                                                                       | Request and response cards                                                                                     |
| `TryItButton`         | `button`                                                                           | "Try It!"                                                                                 | Tracks `try_it_run` (C8)                                                                                       |
| `ResponseStatusMenu`  | `button aria-haspopup`                                                             | "<status>", e.g. "200"                                                                    | Items: examples, "Clear Example" / "Clear Response"                                                            |
| `HeadersButton`       | `button aria-haspopup="dialog"`                                                    | "Headers"                                                                                 | Opens `HeadersDialog`                                                                                          |
| `HeadersDialog`       | `dialog` (modal)                                                                   | "Headers"                                                                                 | Close button "Close"                                                                                           |
| `RecentRequestsTable` | `table`                                                                            | (caption-less; preceded by the "Recent Requests" heading)                                 | Column headers as live: "TIME", "STATUS", "USER AGENT"; empty state "Make a request to see history."           |
| `ResponseLiveRegion`  | `div aria-live="polite"`                                                           | (none)                                                                                    | **fix**: announces "Response 200" after Try It; live has none                                                  |
| `RequestPanelDiscord` | `DiscordButton`                                                                    | "Join our Discord"                                                                        | Placement `reference_request_panel`                                                                            |

## Docs article enhancers (`src/docs/`)

Live markup for these was captured as screenshots only; W7 confirms each name on live in Phase 3.

| Component        | Element / role                                      | Name                                               | Notes                                             |
| ---------------- | --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `CodeTabs`       | `tablist` of `tab`s, each with a `tabpanel`         | the tab label ("JSON", "Python", …)                | **new**                                           |
| `CodeCopyButton` | `button`                                            | "Copy to clipboard"                                |                                                   |
| `ImageLightbox`  | `button` around the image, opening a modal `dialog` | the image's `alt`; dialog: the same, close "Close" | **new**                                           |
| `HtmlBlockFrame` | `iframe sandbox`                                    | `title="HTML block"`                               | **new**: an iframe needs a title                  |
| `YouTubeEmbed`   | `iframe`                                            | `title` from the `<Embed title>` attribute         |                                                   |
| `ContactForm`    | `iframe` (Formstack)                                | `title="Developer contact form"`                   | **new**; focus into it fires `contact_form_start` |

## Search (`src/search/`)

| Component       | Element / role        | Name                                                         | Notes                                       |
| --------------- | --------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `SearchDialog`  | `dialog` (modal)      | "Search"                                                     | Opens on Cmd/Ctrl-K and from `SearchToggle` |
| `SearchInput`   | `input type="search"` | "Search"                                                     | Empty state text "Start typing to search…"  |
| `SearchTabs`    | `tablist` of `tab`s   | "All", "Docs", "API Reference", "Pages", each with its count | **new** structure                           |
| `SearchResults` | `list` of `link`s     | each result's title                                          | Endpoints carry the method badge            |
| `SearchPager`   | `nav`                 | "Search results pages"                                       | **new**; buttons "Back", "Next"             |
| `SearchClose`   | `button`              | "Close"                                                      |                                             |

## Other pages

| Component       | Owner | Element / role                                                           | Name                                                               | Notes                                                                                                |
| --------------- | ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `NotFoundPage`  | W2    | `h1`, then a `list` of 3 `link`s                                         | "Page Not Found"; intro "Maybe you were looking for one of these:" | `document.title` is "404 Not Found"                                                                  |
| `DiscordButton` | W11   | `a target="_blank" rel="noopener noreferrer"`                            | "Join our Discord"                                                 | Text only; label from `developer.about_you.community.discord.join_discord_link`; six placements (C8) |
| `HomeCarousel`  | W11   | as live: radio inputs with `label`s                                      | each card's title                                                  | No JavaScript                                                                                        |
| `HomeToolTile`  | W11   | `a`                                                                      | the tile title                                                     | Whole tile is the link                                                                               |
| Gallery         | W12   | as the gallery today                                                     | as the gallery today                                               | Its 64 Playwright checks and axe runs move with it                                                   |
| Editor          | W13   | `main` with `nav` "Page tree" (`tree` role) and a `form` "Page settings" | **new**                                                            | Staff only; not part of visual parity                                                                |

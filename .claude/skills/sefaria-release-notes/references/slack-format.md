# Slack mrkdwn Format Reference

## Rules — strictly no raw Markdown

| Want | Write | NOT |
|------|-------|-----|
| Bold | `*text*` | `**text**` |
| Italic | `_text_` | `*text*` |
| Link | `<https://url\|display text>` | `[text](url)` or bare URL |
| Bullet | `•` | `-` or `*` |
| Section header | `*Header text*` (bold, on its own line) | `## Header` |
| Horizontal rule | _(blank line between sections)_ | `---` |
| Inline code | `` `code` `` | (same — this works fine) |
| Emoji | `:emoji_name:` | (same) |

**Never use** `##`, `###`, `---`, `**`, or `[text](url)` — these render as literal characters in Slack.

---

## Tech File Structure

```
:rocket: *Upcoming Production Deploy — preprod → prod*
*Release:* app `X.X.X` / chart `X.X.X`
*Range:* ~N commits / N net feature PRs | Sprint: <start>–<end>

:large_green_circle: *User-Facing Fixes & Features*

• <https://app.shortcut.com/sefaria/story/XXXXX|sc-XXXXX> — *Story title*
PR <https://github.com/Sefaria/Sefaria-Project/pull/XXXX|#XXXX>
1–3 sentence technical description: what changed, why, what it enables.

[repeat for each user-facing item]

:gear: *Backend / Performance / Stability*

[items using same bullet format]

:bricks: *Infrastructure / DevOps*

[items using same bullet format]

:test_tube: *Still awaiting release (Deploy Ready — not in prod yet)*

• <https://app.shortcut.com/sefaria/story/XXXXX|sc-XXXXX> — *Story title*
• [only Deploy Ready / stuck stories not in this deploy; omit section if empty]
```

**Per-item format:**
```
• <SC_URL|sc-XXXXX> — *Title*
PR <GH_URL|#XXXX>
Description sentence(s).
```

If no SC story: omit the SC link line, just use `• *Title*`.
If no PR: omit the PR line.
Flag risk: append `:warning:` to the title line.

---

## Product File Structure

```
*Upcoming Production Release — What's Shipping*
<Date> | Sprint: <date range only — no team names>

<1–2 sentence overview: how many changes, any standout themes>

:eye: *What users will see and feel*

• *Feature or fix name.* Plain-language sentence(s) describing the user experience change. No jargon.

[repeat]

:wrench: *Fixes to visible bugs*

• *Bug description* — what it was, what it does now. One sentence.

:electric_plug: *Relevant for partners, API users, and external developers*

[only include this section if there are relevant items]

:building_construction: *Stability, speed, and operational maturity*

• *Area name.* What it means for reliability or performance in plain language.

:sparkles: *Still awaiting release (not in prod yet)*

• *Item* — brief plain-language note. Only Deploy Ready / stuck work not in this deploy. Omit section if empty.
```

---

## Translation Guide (tech → plain language)

| Technical term | Plain language |
|----------------|----------------|
| Django upgrade | Web framework upgrade |
| Postgres / PostgreSQL | Database |
| Elasticsearch | Search index |
| Helm / chart | Infrastructure configuration |
| MCP tool | AI assistant capability |
| CSRF | Security configuration |
| preprod / staging | Testing environment |
| CI/CD | Deployment pipeline |
| PR #XXXX | (omit — use the feature name instead) |
| sc-XXXXX | (omit — use the story name) |
| commit SHA | (omit) |

---

## Short correct example — tech item

```
• <https://app.shortcut.com/sefaria/story/39065|sc-39065> — *Upgrade Django 1.11 → 6.0 on Python 3.12* :warning:
PR <https://github.com/Sefaria/Sefaria-Project/pull/3251|#3251>
Long-running upgrade finally merged and deploying to prod. :warning: Highest-risk item in this deploy — monitor closely post-deploy.
```

## Short correct example — product item

```
• *Web framework upgrade complete.* The site's core framework is now on a modern, supported version — this was years in the making and keeps the platform secure and maintainable. Engineering will monitor closely for a few days after this goes live.
```

## Short incorrect example (do NOT do this)

```
### sc-39065: Upgrade Django (wrong: ## heading, no slack links)
**PR #3251** (wrong: ** bold, bare PR ref)
See [details](https://github.com/...) (wrong: markdown link)
---  (wrong: horizontal rule)
```

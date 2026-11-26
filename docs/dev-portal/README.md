# Developer portal rebuild (sc-48158)

We're rebuilding developers.sefaria.org, currently hosted on ReadMe.io, inside Sefaria-Project. The rebuild includes the Powered by Sefaria gallery.

| File                                   | What it is                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PLANNING_BRIEF.md](PLANNING_BRIEF.md) | The brief for writing the execution plan: goals, rules, architecture, every feature requirement, tests, security and what the plan must contain                                                   |
| [DECISIONS.md](DECISIONS.md)           | Every product decision, the post-cauldron questions, follow-ups and notes for the team                                                                                                            |
| [research/](research/)                 | What ReadMe does today: the reference parity spec, site atlas, live Markdown and machine files (`llms.txt`, MCP tools), the UX brief, designs and design-system tokens, and about 200 screenshots |

The rule when sources disagree: **the live site wins**, except where `DECISIONS.md` says otherwise (Roboto font, fixing the mobile hero gap, the Discord buttons).

This folder is planning material. When the portal ships, document the new app in `docs/agent_docs/`, and either delete this folder or keep only what's still useful.

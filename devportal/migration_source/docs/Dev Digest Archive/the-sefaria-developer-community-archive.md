---
title: The Sefaria Developer Community Archive
deprecated: false
hidden: false
metadata:
  robots: index
---
Sefaria hosts a Developer Community on Discord where folks can learn, build and collaborate on everything at the intersection of Torah and technology.&#x20;

[Join us inside!](https://sefaria.formstack.com/forms/sefaria_developer_discord_community)

***

# Archive

## October 5th, 2026: Weekly Review

### Notable Discussion

[Sefaria Frontend Toolkit](https://github.com/Arithmomaniac/sefaria-frontend-toolkit) Feedback - Previously, a developer shared a new Sefaria web components library, which generated valuable early feedback from other developers, including one who is building [Sefarim](https://sefarim.net) – an AI Q\&A system over the Sefaria library with multi-language support and cited sources.&#x20;

Key Requests/Issues Raised:&#x20;

1. **Language Fallback Support**: Components are currently fixed to Hebrew/English. Request for French language support with graceful fallback to English when translations unavailable.&#x20;
2. &#x20;**Licensing**: GPL-3.0 is incompatible with browser-bundled web apps. Request to consider more permissive licenses (MIT/Apache).&#x20;
3. **NPM Distribution**: GitHub Packages token requirements create friction for deployments. Request for standard npm registry publishing.

General consistency improvements and language fallback support are in scope, though language fallbacks may require composing lower-level components

- Documentation updates planned to clarify component composition patterns&#x20;
- Cannot comment on licensing/distribution plans yet – "stay tuned"&#x20;

Worth noting: This exchange highlights real adoption friction points for new open-source libraries: language i18n, license compatibility, and distribution convenience are blocking factors for potential users.

## September 25th, 2026: Weekly Review

### New Tools & Libraries&#x20;

**Sefaria Frontend Toolkit Alpha Released** - A developer announced an early alpha of the [Sefaria Frontend Toolkit](https://github.com/Arithmomaniac/sefaria-frontend-toolkit), a new project aimed at simplifying Sefaria integration.&#x20;

The toolkit consists of three components:&#x20;

1. **API Client** - Auto-generated from OpenAI definitions with enhancements&#x20;
2. **Text Processing Library** - Transforms inline tags to safe HTML and handles punctuation&#x20;
3. **Web Components** - Framework-agnostic components compatible with React, Alpine.js, and Vanilla JS&#x20;

**Status:** Early alpha with incomplete documentation. Developers interested in testing should grab the release and provide feedback. More details expected soon.&#x20;

This toolkit could be valuable for developers building Sefaria integrations, particularly those looking for a standardized way to handle Sefaria text rendering across different JavaScript frameworks. The framework-agnostic approach via Web Components is worth noting for teams with mixed tech stacks.

## September 18th, 2026: Weekly Review

### Community & Culture&#x20;

The Sefaria Developer Outreach Team shared a thoughtful Rosh Hashanah reflection on the community's recent accomplishments, highlighting shipped projects ranging from AI-powered study tools to offline apps and MCP integrations. The message emphasized the collaborative spirit developers have shown in helping each other and sharing institutional knowledge.&#x20;

### Notable Projects & Insights&#x20;

**Sefarim Demo** — A developer showcased an impressive project (demo.sefarim.net) built on the Sefaria API with hebcal integration for date/Shabbat calculations. Notably, it's running on a **Raspberry Pi with Cloudflare tunnel**, demonstrating that sophisticated Sefaria-powered applications don't require heavy infrastructure.&#x20;

**TTS Pronunciation Tip** — For developers working with text-to-speech, Kokoro (a 82M parameter TTS model) properly handles IPA syntax and correctly pronounces Sefaria as /səfˈɑːɹiə/.&#x20;

### Support Takeaway&#x20;

When building on Sefaria's APIs, consider pairing with complementary services like hebcal for calendar/timing features—it's a proven winning combination.&#x20;

### Call to Action&#x20;

A matching gift campaign is active through October 5, with a $5,000 community fundraising goal (1:1 match). Developers are invited to contribute to support Sefaria's free data and services. [Donate here](https://discord.com/channels/1240573950182817792/1240573950182817795/1556540700370141255).&#x20;

## September 11th, 2026: Weekly Review

### Notable Projects & Announcements&#x20;

- **Sefarim Demo Launch** – A community member announced the public release of [https://demo.sefarim.net](https://demo.sefarim.net), an LLM-powered application that generates Torah-related content with citation verification against primary sources. The demo includes a 5-question free tier and full app registration. Notably, extensive LLM model testing was conducted (Opus 5, Fable 5.1, GPT 6 Astra, GPT 5.6 Terra) before settling on Opus 4.8. This is a good example of rigorous model evaluation for Sefaria use cases.&#x20;
- **Phrase-Based Textual Connection Search** – Another developer is building a specialized search tool that identifies remmez-level (allusion) connections across the Tanach, with a companion tool for drosh/sod (homiletic/mystical) analysis leveraging Chassidic and Kabbalistic texts. The application targets Torah study groups and drosh preparers seeking to move beyond p'shat (literal) interpretation. An interesting use case for semantic search in Talmudic/Kabbalistic contexts.&#x20;

### Community Growth&#x20;

The Discord saw a surge of new members on September 7th, attributed to a _Sefaria Scoop_ email announcement. Worth monitoring engagement patterns as the community scales. --- **Recommendation**: The Sefarim project's approach to LLM citation verification could be valuable documentation for developers building AI-assisted Sefaria applications.

## September 4th, 2026: Weekly Review

### &#x20;🚨 Infrastructure Alert&#x20;

**API Rate Limiting Reminder**: The team reported a spike in traffic causing performance degradation. Developers are urged to implement self-imposed rate limiting and consider bulk-downloading via [Sefaria-Export](https://github.com/Sefaria/Sefaria-Export) instead of repeated API calls. Contact [developers@sefaria.org](mailto:developers@sefaria.org) with questions.&#x20;

### 🔧 Technical Improvements&#x20;

**OpenAPI Spec Validation**: Microsoft employees working on a Sefaria-oriented project in the hackathon completed a validation audit of the Sefaria OpenAPI specification and published a formal patch/overlay with corrections. See the [full audit and reproduction guide](https://gist.github.com/Arithmomaniac/9df021bd09c1b69289dc920d9940f448).&#x20;

### 📦 New Projects on Powered-by-Sefaria&#x20;

Six projects were added to the ecosystem:&#x20;

- **Lilmod** – AI-assisted reading and annotation workspace&#x20;
- **ASHAN** – Daily Zohar study app aligned to parashat hashavua&#x20;
- **Talmud Navigator** – Mobile tool with per-line sources and Bavli-Yerushalmi comparison&#x20;
- **Mekoros** – AI research engine providing hallucination-free sources&#x20;
- **Sefaria Translation Studio** – Local AI-assisted translation with human editorial review&#x20;
- **Torah MCP** – Claude integration via Model Context Protocol for grounded AI responses&#x20;
- **Notable submission**: AutoParashah – an AI-powered weekly publication with interpretive analysis of Rashi commentary, available in 4 languages (EN, PT, ES, FR).

  &#x20;[Submit your project here](https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form)&#x20;

### 💡 Community Insight&#x20;

Developers raised an interesting point: most ecosystem apps could benefit from MCP server implementations to enable interoperability and complementary use cases through AI assistants like Claude. **SeferAI** was highlighted as already offering this capability.

## August 28th, 2026: Weekly Review

### Notable Questions & Updates&#x20;

- **Kehati Commentary Status** - Community member inquired about availability of Kehati's commentary on the Mishnah (including English translation)&#x20;
- **Response:** Sefaria team confirmed it's on the roadmap for future release, though specific timeline wasn't provided. Underlying reasons (likely copyright-related) weren't detailed in the response.&#x20;

### Interesting Insights&#x20;

**Graph Data Opportunities**

- Discussion emerged around potential GraphQL/data analysis use cases&#x20;
- **Key insight:** Community identified valuable analytics opportunities around source sheet usage patterns: Most/least frequently used verses, verse co-occurrence patterns (which texts are used together), comparative analysis of popular vs. underutilized readings. This could provide interesting metrics for understanding how Jewish texts are being studied and taught on the platform&#x20;
- **Note:** This week's activity was relatively light with focused discussion on one feature request and exploratory data analysis ideas. No technical issues or bug reports were logged.

## August 21st, 2026: Weekly Review

### **New Community Project**:&#x20;

Developer shared an independent translation studio built on the Sefaria API that enables human-reviewed translation drafts without writing to the main library. This is a good reference implementation for developers building read-only applications on Sefaria data. The project is open for community feedback.&#x20;

### Community News&#x20;

**Developer Fundraising Initiative**: The Sefaria team launched a $5,000 fundraising goal (with 1:1 matching through October 5) specifically targeting the developer community. This supports the free API and data infrastructure that enables third-party tools. More details: [https://donate.sefaria.org/give/451346](https://donate.sefaria.org/give/451346)&#x20;

### Key Takeaway&#x20;

The week showcased both the generosity of Sefaria's free developer resources and an emerging ecosystem of specialized tools being built on top of the platform. The translation studio example demonstrates the potential for domain-specific applications that leverage Sefaria's core data without competing with the main library.

## August 14th, 2026: Weekly Review

### Notable Discussion: Graph Database for Sefaria Data&#x20;

**Question:** Developer raised an interesting architectural question about building a GraphDB for Sefaria's data as a community side project. While initially seeming like a good fit, they struggled to identify unique use cases during POC implementation.&#x20;

**Key Insight:** It was clarified that the distinction between graph databases and query languages, and pointed to an existing reference: the [yochai-kg project](https://github.com/lightning-learning-Studios/yochai-kg) from Lightning Studios, which demonstrates an open, read-only approach to knowledge graph implementations. This could serve as a template for thinking about a "slimmer open source alternative."&#x20;

**Takeaway:** Before investing in graph infrastructure, the community should first validate concrete use cases. The referenced yochai-kg project may provide a starting point for exploration.&#x20;

### Link Quality Issue Reported&#x20;

**Bug Report:** User identified a potential issue with automated linking where Likutei Halachot (Torah 1, Hilchot Kriyat Shema) incorrectly links to Shulchan Aruch chapter 65 instead of Likutei Moharan chapter 65. This suggests the automated linking system may need refinement for complex citation relationships.&#x20;

### Community Wins&#x20;

Four new projects were added to the **Powered-by-Sefaria page**:&#x20;

- **My Torah Quest:&#x20;**&#x47;amified Mishnah quiz using Sefaria API + AI&#x20;
- **Vehagita**: Torah social network built on Sefaria texts
- &#x20;**HolyScroll**: Open-source iPhone app for distraction-free study&#x20;
- **Kabbalah of Time** - Kabbalistic yearly cycle mapper&#x20;

Projects can be submitted via the [community submission form](https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form).

## August 7th, 2026: Weekly Review

### :sparkles:Notable Projects & Community Tools

**Sefaria Web Components Project Launch**&#x20;

A community developer employed at Microsoft announced an incubating project for Microsoft's Global Hackathon 2026: **Sefaria Web Components** — reusable, composable web components (e.g., `, `) that abstract common functionality like punctuation toggling, BIDI support, and link navigation.&#x20;

- **Key Value Proposition:** Eliminate wheel-reinvention across Sefaria API implementations by providing standardized, extracted components from existing web and mobile codebases, plus utility libraries like `@sefaria/ref`.&#x20;
- **Call for Feedback:** The team is actively seeking input on pain points and desired features. If you're building with the Sefaria API, this is a good time to share what standardized components would solve for you.&#x20;
- **Repository:** [https://github.com/Arithmomaniac/sefaria-web-components](https://github.com/Arithmomaniac/sefaria-web-components)&#x20;

### :handshake: Community Connection&#x20;

A developer inquired about connecting with the creator of vehagita.co.il (a Hebrew social network for Torah study). If you're the developer behind this project or know them, they're looking to connect in the community.

## July 31st, 2026: Weekly Review

### :sparkles:Notable Projects & Community Tools

- **Sefarim.net Launch**: Creator shared a semantic search project built on Sefaria's API, enabling multilingual Tanakh Q\&A with Claude-powered citation verification (English, French, Hebrew). The project demonstrates preference for use of [Sefaria-Export](https://github.com/Sefaria/Sefaria-Export) instead of API batch requests. Two new projects were added to the Powered-by-Sefaria page this week.&#x20;
- **Terminal-Based Kabbalah Tools**: Developer inquired about contributing Hebrew dictionary and gematria/cipher mapping applications to Sefaria.&#x20;

### :wrench:Key Technical Insights&#x20;

- **Patot Library Issues Resolved**: A developer identified and reported critical dependency problems in Patot's chunking module (undeclared `stanza` dependency, hardcoded machine-specific paths). The Sefaria Research Team confirmed these were fixed in v0.1.5 but the README still referenced older installation instructions—now updated.&#x20;
- **Disambiguator Project Impact**: The Sefaria Research Team clarified that the new Disambiguator project resolves ambiguous citations (like "ibid" references) to segment-level precision, making previously hidden cross-references visible in the UI. Future work may include detecting quotations without explicit citations using trained models rather than LLMs (cost/scale considerations).&#x20;

### 🎯Support & Best Practices&#x20;

- **Data Access Guidance**: The team consistently directed developers to use the [Sefaria-Export](https://github.com/Sefaria/Sefaria-Export) for bulk data needs rather than the API, which is simpler and more efficient than sequential API calls.&#x20;
- **Communication Culture**: Team encouraged public channel discussions over DMs to benefit the broader community.

## July 24th, 2026: Weekly Review

### :sparkles:Notable Projects & Community Tools&#x20;

#### **New Powered-by-Sefaria Projects:**&#x20;

- [**Yochai**](https://www.yochai.wiki/) ([Lightning Studios](https://www.lightningstudios.ai/)): A Socratic AI chevruta leveraging 1,000+ primary sources and 16M entity relationships&#x20;
- [**AI Torah**](https://aitorah.ai/): Instant answers on Jewish law and life using Sefaria's library&#x20;
- **Jastrow Dictionary Tool**: A game-changing Gemara learning tool enabling word lookup without prior lemmatization. The developer is crowdsourcing accuracy reviews at [https://daniepstein.com/gold-review/](https://daniepstein.com/gold-review/) and plans open-source release. The reasoning behind the development of a tool like this can be found [here](https://daniepstein.com/gold-review/why-not-just-sefaria.html).&#x20;
- [**Sefaria Links**](https://zakdev26.github.io/sefaria-links/): User-friendly tool for building source sheets, exporting to Kindle/Word/PDF with AI integration support&#x20;

### :wrench:Infrastructure & API Insights&#x20;

**High-Volume API Usage Alert**: The Sefaria team identified several high-volume automated clients and offered optimization alternatives:&#x20;

- Supabase Edge Functions: \~800k requests/day (33% erroring)&#x20;
- Google Apps Script: \~60k requests/day on `/api/sheets` endpoint&#x20;
- Node service: \~200k requests/day on `/api/search-wrapper/es8`&#x20;
- Bulk text corpus downloads: 100k-300k requests/day from various projects&#x20;

**Recommendation**: For bulk data needs, use [Sefaria-Export](http://github.com/Sefaria/Sefaria-Export) (structured JSON exports) instead of per-ref API calls—faster for developers, lighter on infrastructure.&#x20;

### 🎯 Support Questions & Answers

**Q: 504 errors on link endpoint for multiple verses**&#x20;

A: Use Sefaria-Export for bulk data; consider the [Sefaria Developers MCP](https://developers.sefaria.org/docs/the-sefaria-mcp) to optimize API calls.&#x20;

\-

**Q: Available language translations?**&#x20;

A: Sefaria has texts across 22 different languages. To learn more, see the API Reference: [get-translations endpoint](https://developers.sefaria.org/reference/get-translations)&#x20;

\-

**Q: Jastrow dictionary downloads for offline use?**&#x20;

A: Not in standard Sefaria-Export, but community member created [this exporter](https://gist.github.com/Arithmomaniac/924ef9e00ff2cabf72142d75c9263da0) (Mongo to JSONL/CSV)&#x20;

<br />

**Reminder:**

In addition to the Sefaria MCP, there's a separate MCP available for developers.sefaria.org to help your agent gain fluency in our docs and API. Learn more [here](https://developers.sefaria.org/docs/the-sefaria-mcp).&#x20;

<br />

**Policy Note&#x20;**

Sefaria maintains a community-first integration approach—excellent tools stay independent in the "[Powered by Sefaria](https://developers.sefaria.org/docs/powered-by-sefaria)" registry rather than direct adoption, balancing ecosystem growth with user autonomy.

## July 16th, 2026: Weekly Review

### &#x20;🎯 Key Support Questions & Answers

- **Source Sheet Creation via API** - A developer asked about creating sheets programmatically. The team clarified that POST The `api/sheets` endpoint is undocumented and discouraged because it requires developers to supply full text payloads. Instead, authenticated cookie-based requests are recommended for updating existing sheets, with a provided Python script template. However, this remains a friction point: developers want to reference Sefaria refs without pre-fetching text.
- **Text Update Tracking** - No dedicated API exists for checking if texts have been updated since a given date. The team pointed to workaround: `https://www.sefaria.org/activity/{index_name}/{lang}/{version}` accessible via GUI revision history. A developer requested a proper API for this (useful for offline readers like Stndr that need update checks). This appears to be a feature request worth considering.&#x20;
- **Data Dump Frequency** - The small MongoDB dump (`dump_small.tar.gz`) updates every 24 hours but lags live changes. Note it excludes edit history, private collections, and copyright-restricted texts.&#x20;

### 💡 Notable Insights

- **Language Code Inconsistency**: The team acknowledged a legacy issue where activity URLs use `en`/`he` codes regardless of actual language (ISO codes like the database's `actualLanguage` field would be preferable). A known limitation. &#x20;
- **Agent Skills for Source Sheets**: Proposal to add source sheet editing as an AI agent capability for power users—interesting direction for automation.&#x20;

## **July 9th, 2026: Weekly Review**

### :wrench: Project Highlights

- **IvritSuite**: Hebrew learning suite with worksheet generator, dictionary, Torah Trainer, and custom font creator&#x20;
- **Ruth**: Hebrew learning app targeting conversion-curious learners with TTS pronunciation&#x20;
- Idea for an app for Gemara Aramaic fluency using game-based learning and story connections rather than pure translation&#x20;
- **Jastrow\.app**: Making the Jastrow Dictionary more accessible&#x20;
- **SeferAI.org**: AI-powered shiurim generation using Claude + text-to-voice; seeking developers to scale
- **Derekh Learning**: AI-generated digestible lessons with multiple narrative voices; available as iOS app with Android port in progress
- **Rabbinic Reasoning Lab**: Interactive learning for Talmud and Midrash, trained on Pardes materials and academic research
- **Stndr**: Desktop UI for Sefaria with offline/online hybrid functionality and planned collaborative study features&#x20;
- **Sefaria Discord Bot**: French community tool supporting Bible questions in 3 languages; successfully tested with Chidon HaTanakh questions

### 💡 Technical Insights&#x20;

- **TTS Challenges**: Developers discussed training a custom Hebrew model with 11Labs due to lack of native Hebrew speech; now exploring Gemini TTS alternatives&#x20;
- **Data Opportunities**: Chidon HaTanakh questions identified as valuable sample dataset for testing Jewish text chatbots&#x20;

### &#x20;🤝 Collaboration Interests&#x20;

- Developer seeking developer partner for comprehensive Midrash app&#x20;
- **Multiple developers** expressing openness to partnerships and collaboration on overlapping projects&#x20;

# Spec (pre-SDD draft): Community QA for Machine Translations — POC

| | |
|---|---|
| **Status** | Draft for discussion. Not yet an SDD definition. |
| **Author** | Akiva Berger (TPM) |
| **Stakeholders** | Michael Fankhauser (product), Shmuel (current corrections owner), expert reviewer ("Rav Natav" in transcript, name to confirm), Panina (possible simulation participant) |
| **Source** | [Bi-weekly PM check-in, 2026-09-16](https://app.fireflies.ai/view/01M22ZTFN6T5T5P7YWNK5J35P2) |
| **Background** | Company investment area "Translation at scale." Earlier pitch: Akiva's "Operation Yitro" message to Mickey, Nov 20, 2025. |
| **Repos** | `Sefaria-Project` (reader UI, flag storage, dashboard) · `ai-chatbot` (LC Chatbot: L1 triage flow) |
| **Base branch (ai-chatbot)** | `chat-history-main`, which will soon become `main`. All L1 work branches from it, not from current `main`. |

---

## 1. Summary

We publish a machine translation of one well-studied text and label it clearly as **unverified ("buyer beware")**. Readers get a simple **Report an issue** control on each segment. It opens the site's existing AI chatbot, **LC Chatbot** (`ai-chatbot` repo, the `<lc-chatbot>` widget already embedded in `ReaderApp.jsx`), in a new **`report_issue` flow**. That flow is **L1**. Every report **starts a new chat**. On the chat-history branch conversations are saved and listed for the user, so each report shows up in their history as its own conversation with a clear title. The bot asks what's wrong, checks the claim against the commentators (pashtanim) and our translation methodology using its existing Sefaria tools, gives a cited verdict, and files a structured case. The reader then **accepts** (the case closes) or **rejects** (the case goes to a human **expert reviewer**, L2). An internal dashboard shows every case with a link to the full chat transcript and Braintrust trace, so we can audit how the bot performs.

The POC's job is to show that this loop works end to end with a few real people. It does not need to prove it works at scale.

## 2. Problem

- The only correction path today is the feedback modal's **"Report an issue with the text"** option (`content_issue` in `static/js/Misc.jsx`). It sends a free-text email to `corrections@sefaria.org` through `generate_feedback` (`sefaria/views.py:419`). Nothing is stored, there are no statuses and no dashboard, and one person reads and answers every email by hand.
- Machine translation makes producing a translation cheap. It does not make *trusting* one cheap. The bottleneck is human review.
- We face two risks. (1) **Data risk:** we endorse a wrong translation. (2) **Reputation risk:** people start to see Sefaria as a source of "AI slop."
- We have tried crowdsourced translation before, and it did not go well. The feedback channel has to be designed so it isn't flooded with noise or turned into an argument thread.
- We already run a production AI chatbot with Sefaria tool access, tracing and evals. Building a separate triage bot would duplicate it.

## 3. Goals (what the POC must prove)

| # | Hypothesis | How we know |
|---|---|---|
| H1 | Readers can flag a translation issue with very little effort while they study. | Internal testers flag issues without being guided. Time from click to first bot reply is under 30s. |
| H2 | LC Chatbot, in the `report_issue` flow, can resolve most flags without a human, and it grounds its answers in the commentators instead of hallucinating. | At least 60% of flags close at L1. An expert audit finds no hallucinated sources in a sample of at least 20. The existing `link_quote_accuracy` scorer passes on flow traces. |
| H3 | The bot can tell a **real error** from a **disagreement with our methodology**. | The expert agrees with the bot's classification in at least 80% of audited cases. |
| H4 | Escalations reach the expert with enough context to decide quickly. | The expert decides without contacting the flagger, in under 5 minutes per case. |
| H5 | The expert's workload stays manageable. | We project the POC's escalation rate onto realistic traffic (see §9.4). |

Thresholds are placeholders. We should agree on them before the build starts.

## 4. Non-goals (explicitly out of POC)

- **Organizations and institutional hierarchy in the identity model.** We have no org concept today, and adding one is heavy. The POC uses informal groups: a named cohort of individual accounts, or a Collection if we need a grouping.
- Gamification, leaderboards, school-by-school assignments, or "one institution from each community."
- Translating anything beyond a single text, and any language other than English (the design should not rule out others, e.g. French).
- Auto-applying corrections to the published version. Accepted fixes go into a queue. They do not change the text directly.
- A standalone triage bot or new chat UI. L1 **is** LC Chatbot.
- Mobile web and the mobile app. The chatbot is desktop-only today (see §9.3).
- Replacing the existing feedback modal for all texts.
- Any time spent choosing *which* text to translate. We pick a default and move on (§6).

## 5. Roles

| Role | In POC played by | Does |
|---|---|---|
| **Reader / flagger** | Mickey, Akiva, 2–5 internal staff, and optionally a staff member's kid | Studies the text, reports issues, and talks it through with the bot |
| **Institution** | Mickey, role-playing it | Simulates a school cohort: the invite, the methodology briefing, the shared credit line |
| **L1: LC Chatbot, `report_issue` flow** | `ai-chatbot` agent with a flow-specific prompt and a new filing tool | Asks clarifying questions, looks up commentators and dictionaries, gives a cited verdict and classification, and files the case |
| **L2 expert reviewer** | Rav Natav (to confirm) | Decides escalated cases and audits a sample of the cases the bot closed |
| **Translation owner** | Shmuel or Akiva | Applies accepted corrections to the version and maintains the methodology doc |

## 6. Scope

**Text (default, so we don't bikeshed):** Bartenura on Mishnah Berakhot. It's a commentary that schools study heavily, it's short, and it has plenty of commentators for the bot to check against. Rashi on a single Gemara chapter is the fallback. **Recommendation:** use a real AI translation, not an existing community translation, because the bot should be defending choices that were actually made on purpose.

**Methodology doc (required input):** a one-page public statement of the translation philosophy. Example: *peshat* as the author's intended meaning, in the Rashbam sense. It should also say how edge cases are handled, such as allegorical books like Shir HaShirim. Readers see it linked from the "unverified" label. It is also inserted into the `report_issue` prompt, which lives in Braintrust like the other chatbot prompts, so the bot judges every flag against the same document readers see.

## 7. User flow

1. The reader opens the text. The version header shows **"Machine translation, unverified"** with a link to the methodology.
2. On a segment, the reader clicks **Report an issue** (segment tools or text-selection menu).
3. **LC Chatbot opens a new chat in the `report_issue` flow.** The widget already on the page opens (or expands) and **starts a new conversation**. It never adds the report to the chat the reader was already in. That earlier chat stays in the history panel untouched. The new chat shows a short intro message, e.g. "What looks wrong in the translation of *Bartenura on Mishnah Berakhot 1:1*?" The segment ref, version and language are passed as flow context, so the reader doesn't have to say which text they mean. Once saved, the chat appears in history as **"Report: Bartenura on Mishnah Berakhot 1:1"**.
4. The reader describes the issue in their own words. They don't have to propose a fix, though they can.
5. **L1 conversation.** The bot:
   - loads the segment and its translation (`get_text`) and the connected commentators (`get_links_between_texts`), and checks words with `search_in_dictionaries` as needed;
   - asks follow-up questions if the claim is unclear;
   - replies with a **classification** (`translation_error` · `methodology_disagreement` · `style_or_wording` · `not_a_translation_issue` · `unclear`), cites sources, e.g. "Rashi and the Tosafot Yom Tov read it your way; Bartenura's own gloss supports the current rendering," and proposes corrected wording if it agrees there's an error;
   - runs `validate_response_links` on its citations before answering (existing tool);
   - asks the reader to **accept** or **escalate to a human reviewer**.
6. The reader answers. The bot calls **`file_translation_flag`**, which stores the case in Sefaria, and confirms, e.g. "Filed. You can follow its status in *My reports*."
7. The case appears on the dashboard. The expert handles escalations and samples closed cases. The translation owner applies accepted fixes.
8. Segments that were reviewed and found clean also count as signal ("reviewed, no issue").

**Implicit entry (secondary):** if a reader is already chatting and types something like "I think this translation is wrong," the chatbot router sends the message to the same `report_issue` flow (§9.2). The bot confirms which segment they mean before continuing.

### Triage decision matrix

| Bot's view | Reader's response | Result |
|---|---|---|
| Error, fix proposed | Accepts | `accepted_pending_apply`. This is a strong signal, so no L2 review is needed; it is only sampled. |
| No error (methodology/style) | Accepts | `closed_no_change` |
| No error | Escalates | `escalated`, goes to L2 |
| Error | Rejects the proposed fix | `escalated`, goes to L2 |
| `unclear` | Either | `escalated`, goes to L2 |
| `not_a_translation_issue` (e.g. a typo in the Hebrew source) | — | `rerouted`, sent to `corrections@` as today |
| Reader leaves mid-chat | — | No case filed. The abandoned session is logged in Braintrust for analysis. |

## 8. Functional requirements

**Reader (Sefaria-Project)**
- R1. A version-level "unverified machine translation" label that links to the methodology.
- R2. A segment-level "Report an issue" entry point, shown only on the POC version. It opens LC Chatbot in the `report_issue` flow with `{ref, versionTitle, language}`.
- R3. A "My reports" list showing the reader's own flags and the status of each (a simple page or a sidebar panel).

**L1: LC Chatbot `report_issue` flow (ai-chatbot)**
- R4. **Flow entry API on the widget.** The widget currently only *emits* `chatbot:*` DOM events (`opened`, `closed`, `message_sent`, …). Add an inbound event, e.g. `chatbot:start-flow` with `{flow: "report_issue", ref, versionTitle, language}`. On that event the widget opens, starts a new chat (R4a), shows the flow intro, and sends the flow context with every turn.
- R4a. **Every report is a new chat (required).** Built on `chat-history-main`.
  - Starting the flow goes through the branch's existing new-chat path (`handleNewChat()` → `getOrCreateSession(true)` in `LCChatbot.svelte`). It never adds messages to the active conversation, even if the reader is in the middle of a chat, and it doesn't reuse an existing report chat.
  - If a response is still streaming in the current chat, let it finish or cancel it using the existing stop/cancel behavior before switching. The earlier chat must stay intact in history.
  - Only the intro message is shown in the widget; nothing is saved yet. The server session and history entry are created on the reader's first message, as they are for any chat on this branch. A reader who clicks "Report an issue" and leaves doesn't leave an empty chat in their history.
  - If the history panel is open, the new chat appears at the top and is selected.
- R4b. **How report chats look in history.**
  - **Title:** the server sets `ChatSession.title` to "Report: {ref}" (64-character limit), replacing the default title rule (first 64 characters of the first message). Readers can still rename it.
  - **Label:** store the flow on the session (`ChatSession.current_flow = "report_issue"`) and include `flow` in the conversation summary (`_session_summary` in `server/chat/views.py`), so the history list can show a small "Report" badge. For the POC a title prefix alone is acceptable.
  - **Reopening:** store the flow context (`ref`, `versionTitle`, `language`, `flag_id` once filed) on the session. Reopening a report chat from history (`openConversation` → `GET /history/conversations/{session_id}`) restores the flow, so later messages still go to the `report_issue` prompt with the same segment.
  - **After filing:** a reopened report chat shows the filed case status (from the flag API) and doesn't offer to file again. New disagreements are added to the same case as follow-up notes.
  - **Deleting:** conversations on this branch are soft-deleted (`is_deleted`). If a reader deletes a report chat, it disappears from their history, but the filed flag and the staff transcript stay (R12).
- R5. **Flow context on the API.** `POST /api/v2/chat/stream` accepts `context.flow` and `context.flowContext`. When `flow` is set, the backend **skips the router** and uses `REPORT_ISSUE_PROMPT_SLUG`. This is needed because today a router result overrides the requested core prompt (`turn_orchestrator.py`). On the first turn the backend writes the flow and flow context to the session (R4b). On later turns, including after reopening from history, the stored session flow is used even if the client leaves it out.
- R6. **Router route (implicit entry).** Add a `report_issue` value to `RouteType` and a matching category in `prompts/prompt_text/router.md`, mapped to `REPORT_ISSUE_PROMPT_SLUG`.
- R7. **Prompt.** A new Braintrust prompt, `report-issue`, containing the methodology doc and these rules: consult commentators before giving a verdict; never cite a source it hasn't fetched; say when it's uncertain; always end with a classification and an accept/escalate question. The response-format fragment is reused.
- R8. **Tools.** Reuse `get_text`, `get_links_between_texts`, `get_english_translations`, `search_in_dictionaries`, `validate_refs` and `validate_response_links`. Add **`file_translation_flag`** with surface `agent` only (not MCP). Its inputs are `ref`, `versionTitle`, `language`, `reader_claim`, `classification`, `rationale`, `citations[]`, `proposed_translation?` and `reader_decision`. It posts to Sefaria as the logged-in user, the same way `create_source_sheet` does (`X-Session-ID`), and returns the case id.
- R9. **Guardrail check.** Confirm that the guardrail doesn't block reasonable criticism ("this translation is wrong / offensive"). If it does, adjust it for this flow.
- R10. **Tracing and evals.** Tag flow turns in Braintrust (`flow=report_issue`). Store the chat `session_id` and `trace_id` on the case. Run existing scorers (`link_quote_accuracy`, `sefaria_translation_scorer`) on flow traces, and add a classification-accuracy scorer that uses expert decisions as labels.

**Dashboard (Sefaria-Project, internal, staff-only)**
- R11. A case list filterable by status, classification, ref and flagger.
- R12. A case detail page with the segment, the bot result, the reader's decision, the transcript, and actions for expert decision and notes. The transcript comes from the chat-history data by `chat_session_id`. The reader-facing `/history/conversations/{id}` endpoint is scoped to the owning user and hides soft-deleted chats, so the dashboard needs either a staff-only transcript endpoint in ai-chatbot that ignores `is_deleted`, or a transcript snapshot saved on the flag when it is filed. **POC recommendation:** save a snapshot, which is simpler, keeps the transcript if the reader deletes the chat, and needs no cross-service staff auth. Link to the Braintrust trace as well.
- R13. The expert can mark whether the bot was right or wrong, which feeds H2/H3 and the R10 eval labels.
- R14. Optional: pull in existing `corrections@` emails for the same text so all corrections live in one place.

**Attribution**
- R15. `versionNotes` credit the translation to the model plus contributors, e.g. "Claude + Sefaria community (POC cohort)." Named-cohort credit ("Class of 2026, 7th grade") is only mocked up for the POC.

## 9. Technical design notes

### 9.1 Architecture

```text
Reader segment ──"Report an issue"──► document event chatbot:start-flow {flow, ref, version, lang}
                                              │
                                     <lc-chatbot> (Svelte widget)
                                              │ POST /api/v2/chat/stream  context.flow=report_issue
                                              ▼
                              ai-chatbot Django ─ guardrail ─ (router skipped) ─ report-issue prompt
                                              │  Claude Agent SDK + Sefaria tools
                                              │  file_translation_flag ─────────────┐
                                              ▼                                     ▼
                                   Braintrust trace + ChatSession      Sefaria-Project POST /api/translation-flags
                                                                                    │
                                                                   TranslationFlag (Mongo) ◄── Dashboard (staff)
```

### 9.2 ai-chatbot changes (small, mostly configuration)

| Area | Change | Where |
|---|---|---|
| Branch | Branch from `chat-history-main` (becomes `main` soon); rebase if it lands mid-POC | — |
| Widget | Inbound `chatbot:start-flow` listener; **new chat per report** via `handleNewChat()`; flow intro message; send `flow` in `context`; restore flow when reopening from history; "Report" badge in history list | `src/components/LCChatbot.svelte`, `src/lib/api.js` |
| API | Read `context.flow` / `context.flowContext`; persist flow, flow context and "Report: {ref}" title on the session | `server/chat/V2/views.py`, `server/chat/V2/services/chat_service.py` (title rule) |
| History | Add `flow` to the conversation summary and detail; migration for a `flow_context` JSON field on `ChatSession` | `server/chat/views.py`, `server/chat/models.py`, `server/chat/migrations/` |
| Orchestration | If `flow` is set, skip `run_router` and use the flow's prompt slug; add flow context to the prompt | `server/chat/V2/agent/turn_orchestrator.py`, `contracts.py` (`MessageContext.flow`) |
| Router | `RouteType.REPORT_ISSUE`, router prompt category, `REPORT_ISSUE_PROMPT_SLUG` setting | `server/chat/V2/router/router_service.py`, `prompts/prompt_text/router.md` |
| Tools | `file_translation_flag` schema, executor and client method | `tool_schemas.py`, `tool_executor.py`, `sefaria_client.py` |
| Prompt | `report-issue` prompt pushed through the existing prompt workflow | `prompts/`, `.github/workflows/push-prompts.yml` |
| Evals | Classification scorer and a small dataset of seeded flags (real errors and methodology disagreements) | `evals/scorers/` |

### 9.3 Sefaria-Project changes

- **Data:** a new `TranslationFlag` collection with `ref`, `versionTitle`, `language`, `uid`, `cohort?`, `reader_claim`, `bot_result{classification, rationale, citations[], proposed_translation}`, `reader_decision`, `status`, `chat_session_id`, `trace_id`, `expert_decision{}`, and timestamps. Keep it separate from `Version`. The transcript stays in the chatbot database; we store only the pointer.
- **API:** `POST /api/translation-flags` (authenticated user, called by the chatbot tool), `GET /api/translation-flags?mine=1`, and staff-only list, detail and update endpoints.
- **Version:** use the existing `Version` fields `method`, `status` and `versionNotes` to mark the POC version as machine-translated and unverified. No new `Version` schema.
- **Reader:** a "Report an issue" button dispatches `chatbot:start-flow`. Leave `generate_feedback` and the feedback modal unchanged.
- **Gating:** the chatbot renders only when `chatbot_enabled`, the reader has a chatbot user token (logged in), the page is desktop, and the page is in the library module (`ReaderApp.jsx:2573`). POC testers must be logged-in desktop users in the chatbot experiment. The "Report an issue" button appears only when the chatbot is displayed **and** the version is the POC version. Otherwise it falls back to the existing feedback modal.

### 9.4 Load sanity check (H5)

If 1,000 flags arrive per day and 20% escalate, that's 200 expert cases a day, far more than one reviewer can handle. The POC needs to measure the real L1 close rate and escalation rate so we can size L2 before any rollout. Cost per flag is tracked through the chatbot's existing per-session cost fields.

## 10. Table read (simulation to run before building)

Mickey asked for this: walk through the roles, like a table read in street clothes, and look for traps.

| Scenario | What to watch for |
|---|---|
| A. Mickey finds a real error, and the bot agrees and proposes a fix | Is the fix actually right? Who applies it, and when? |
| B. A reader trained on a midrashic reading flags a *methodology* disagreement | Does the bot explain the methodology without being condescending? Does the reader accept? |
| C. A stubborn reader: "you're just a machine" | Does escalation feel respectful? Does the expert see enough context? |
| D. The bot hallucinates a commentator | Does `validate_response_links` catch it? Does the expert audit? |
| E. Ten people flag the same segment with conflicting claims | Do we merge them into one case per segment? Does the bot tell a reader "3 others raised this"? |
| F. A flag is about the Hebrew source text, not the translation | Does the bot reroute to `corrections@`? |
| G. The expert is on vacation for two weeks | How big does the backlog get, and what does "My reports" show? |
| H. The reader is mid-conversation in a normal chat, then clicks "Report an issue" | A new chat opens, and the earlier one is still in history. Does the switch feel natural? Do they find their way back? |
| H2. The reader reopens a report chat from history a week later and argues again | Does the flow restore? Does it show the case status and add to the same case instead of filing a duplicate? |
| H3. The reader deletes the report chat | Is the flag still on the dashboard with its transcript? |
| I. The reader drifts off topic mid-flow ("what does Rashi say about X?") | Does the bot answer, redirect, or switch flows? |

Write down every gap found and either fold it into this spec or list it under Open Questions.

## 11. Success criteria / exit

The POC is done when 3–5 internal testers have each studied at least one chapter and filed real flags through the chatbot, the expert has reviewed every escalation and audited a sample of closed cases, and we have measured H1–H5. Then we decide on one of three paths: (a) scale with a real institution, (b) redesign L1 (prompt, tools or flow), or (c) stop.

## 12. Phasing

| Phase | Scope |
|---|---|
| **0. Table read** | Run the §10 scenarios with Mickey (and maybe Panina). Finalize the text and the methodology doc. Draft the `report-issue` prompt and test it in the Braintrust playground on hand-seeded flags. |
| **1. Skeletal POC** | AI-translate the text. ai-chatbot (branched from `chat-history-main`): R4–R10, including new chat per report (R4a) and history title and reopen (R4b; the badge is optional). Sefaria-Project: R1–R2, the flag API, and a basic dashboard (R11–R12). Internal cohort only, on a chatbot preview version (`chatbot_version` already supports per-branch preview hosts). |
| **2. Measure** | 2–3 weeks of use, expert audit, eval readout. Add R3, R13 and the implicit router entry (R6) if L1 is holding up. |
| **3. Pilot (post-POC)** | One real partner institution with an informal cohort. Only after this do we evaluate an org concept, gamification, mobile, and more languages. |

## 13. Decisions

**From the meeting**
- Informal user groups, **no organization model**, in the POC.
- A chatbot is the L1 gatekeeper, with human expert escalation as L2.
- Mickey plays the institution, so we don't need a real partnership for the POC.
- Ship something skeletal fast, and get buy-in on the methodology after there's something to show ("code is cheap").
- Don't burn time choosing the text.
- Keep POC definition separate from broad brainstorming. Schedule the follow-up POC-definition meeting about 2 weeks after the next POC session.

**After the meeting**
- **L1 is LC Chatbot** (`ai-chatbot`), in a dedicated `report_issue` flow. No separate triage bot. (Akiva, 2026-09-16)
- **Build on `chat-history-main`**, since chat history is now kept and conversations are visible to users. **Each report opens a new chat** that appears in the reader's history. (Akiva, 2026-09-16)

## 14. Open questions

1. Is "buyer beware" acceptable to Sefaria as an organization for a published machine translation? This is a leadership decision.
2. Who is the L2 expert, and how many hours a week can they give?
3. Should the POC version be public, or visible only to logged-in allowlisted users? (The chatbot gating already restricts L1 to logged-in desktop users.)
4. Merge flags per segment (one case, many voices) or keep one case per flag?
5. Where does the methodology doc live, and who signs off on it? Should Shmuel be involved from the start?
6. Do accepted fixes change the version's status (e.g. "community-reviewed")? At what threshold?
7. Should we bring existing `corrections@` email into the dashboard (R14) now or later?
8. Does the board's direction on user groups and institutions change the non-goal in §4?
9. Accept/escalate: plain chat replies for the POC, or quick-reply buttons in the widget? (The widget has none today; plain chat is cheaper.)
10. ~~Fresh session or continue the current chat?~~ **Decided:** a new chat per report (§13).
10a. Should report chats be listed with regular chats, or can the history panel filter them ("My reports", which could double as R3)?
10b. Transcript for the dashboard: snapshot on the flag (recommended) or a staff-only history endpoint in ai-chatbot?
10c. Do we need to tell readers that report transcripts are shared with Sefaria reviewers, given that chat history is now kept?
11. Which model runs this flow: the default `AGENT_MODEL`, or a stronger one given the fine-grained textual judgment involved?
12. Is the chatbot team (ai-chatbot owners) available for R4–R10 in the POC window?

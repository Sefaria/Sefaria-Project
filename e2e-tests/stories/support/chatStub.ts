// BINDING LAYER. A fake Library Assistant chat server, so stories about *when* an
// answer arrives (red dot, spinner, free-answer limit) are deterministic, fast and
// free. It intercepts the browser's calls to the chat API; the app is unchanged.
//
// Protocol observed on production (chat.sefaria.org, 2026-10-13), not taken from
// the chatbot source:
//   GET  <api>/history?userId=...&sessionId=...   -> JSON {"messages":[],"hasMore":false,"session":null}
//   POST <api>/chat/stream          -> text/event-stream:
//        event: progress  data: {"type":"status","text":"Thinking..."}
//        event: message   data: {"messageId","sessionId","timestamp","markdown"(HTML),"status":"success",...}
//   request body: {"userId","sessionId","messageId","timestamp","text","context":{...},"promptSlugs":{...}}
//   GET  <api>/history/conversations?userId=...&limit=20&offset=0
//        -> {"conversations":[{sessionId,title,createdAt,lastActivity,messageCount,turnCount}],"hasMore","total","limit","offset"}
//   GET  <api>/history/conversations/<sessionId>?userId=...
//        -> {"conversation":{...same fields...},"messages":[{messageId,sessionId,userId,role,content(HTML for
//            the assistant),timestamp,processingState,status,pageUrl,responseMessageId,appetizerData,toolCalls}],
//            "session":{"turnCount","totalTokens"}}
import { BrowserContext, Request } from '@playwright/test';
import { SeamMissing } from './seams';

export type ChatRequest = { text: string; sessionId?: string; body: any; receivedAt: number };

type StubMessage = { role: 'user' | 'assistant'; content: string };
type StubConversation = { sessionId: string; title: string; createdAt: string; lastActivity: string; messages: StubMessage[] };

const corsHeaders = (request: Request, contentType: string) => ({
  'content-type': contentType,
  'access-control-allow-origin': request.headers()['origin'] ?? '*',
  'access-control-allow-credentials': 'true',
});

export class ChatStub {
  /** How long the fake server waits before sending the answer (when answers aren't held). */
  answerDelayMs = 1500;
  /** HTML of the next answers. */
  answerHtml = '<p class="response-generic">This is a test answer from the stubbed chat server.</p>';
  /** Every question the browser sent, in order. */
  readonly questions: ChatRequest[] = [];
  /** How many answers the fake server has sent. */
  answered = 0;
  /** Saved messages returned by /history (the current-session restore); empty by default. */
  historyMessages: any[] = [];
  /**
   * While true, answers wait until releaseAnswers(). Steps use this to make "the answer
   * arrives" a moment the test chooses (e.g. after the visitor closed the assistant).
   */
  holdAnswers = false;
  /** Session ids whose saved-chat request the browser made, in order. */
  readonly chatLoads: string[] = [];
  /** How many times the browser asked for the chat-history list. */
  historyListLoads = 0;

  private installed = false;
  private pendingAnswers: Array<() => void> = [];
  private conversations = new Map<string, StubConversation>();
  private heldChats = new Map<string, { promise: Promise<void>; release: () => void }>();

  /** Release every answer that is being held, and stop holding. */
  releaseAnswers() {
    this.holdAnswers = false;
    this.pendingAnswers.splice(0).forEach(release => release());
  }

  /** Answers the browser is still waiting for. */
  get pending() { return this.questions.length - this.answered; }

  /** A saved chat the account already has. Returns its session id. */
  addSavedChat(title: string, messages: StubMessage[], ageMinutes = 60): string {
    const sessionId = `sess_stub_saved_${this.conversations.size + 1}`;
    const at = new Date(Date.now() - ageMinutes * 60_000).toISOString();
    this.conversations.set(sessionId, { sessionId, title, createdAt: at, lastActivity: at, messages });
    return sessionId;
  }

  /** Delay the server's reply for one saved chat until releaseChat(). */
  holdChat(sessionId: string) {
    if (this.heldChats.has(sessionId)) return;
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    this.heldChats.set(sessionId, { promise, release });
  }

  releaseChat(sessionId: string) {
    this.heldChats.get(sessionId)?.release();
    this.heldChats.delete(sessionId);
  }

  /** Give a chat a new title on the server (so a test can tell server-sent titles from local ones). */
  renameChat(sessionId: string, title: string) {
    const c = this.conversations.get(sessionId);
    if (!c) throw new Error(`no chat ${sessionId} on the fake server`);
    c.title = title;
  }

  /**
   * From the next question on, refuse questions the way the real server refuses a
   * logged-out visitor who has used up their free answers, so the app shows the login
   * prompt. The real response has never been observed (production has no limit yet),
   * so its shape is unknown: until it is documented, this throws SeamMissing.
   * Implementers: once the shape is known, make the /chat/stream route answer with it
   * while `this.needsLogin` is true.
   */
  refuseAsNeedingLogin(): void {
    throw new SeamMissing(
      'Needs the chat server\'s "needs login" (free-answer limit reached) response shape, so the fake server ' +
      'can send it (support/chatStub.ts refuseAsNeedingLogin). Alternatively a test knob for the limit.');
  }

  /** Session ids of chats the server knows about (saved, plus any started during the test). */
  get sessionIds() { return [...this.conversations.keys()]; }
  conversation(sessionId: string) { return this.conversations.get(sessionId); }

  async install(context: BrowserContext) {
    if (this.installed) return;
    this.installed = true;

    await context.route(/\/api\/chat\/stream(\?|$)/, async route => {
      const request: Request = route.request();
      let body: any = {};
      try { body = request.postDataJSON(); } catch { /* non-JSON body */ }
      this.questions.push({ text: body?.text, sessionId: body?.sessionId, body, receivedAt: Date.now() });
      const sessionId = body?.sessionId ?? 'sess_stub';
      const now = new Date().toISOString();
      const convo = this.conversations.get(sessionId)
        ?? { sessionId, title: body?.text ?? '', createdAt: now, lastActivity: now, messages: [] };
      convo.messages.push({ role: 'user', content: body?.text ?? '' });
      this.conversations.set(sessionId, convo);

      if (this.holdAnswers) await new Promise<void>(resolve => this.pendingAnswers.push(resolve));
      else await new Promise(resolve => setTimeout(resolve, this.answerDelayMs));

      const message = {
        messageId: `msg_stub_${this.questions.length}`,
        sessionId,
        timestamp: new Date().toISOString(),
        markdown: this.answerHtml,
        toolCalls: [],
        session: { turnCount: convo.messages.filter(m => m.role === 'user').length },
        recovered: false,
        status: 'success',
      };
      try {
        await route.fulfill({
          status: 200,
          headers: corsHeaders(request, 'text/event-stream'),
          body:
            'event: progress\ndata: {"type": "status", "text": "Thinking..."}\n\n' +
            `event: message\ndata: ${JSON.stringify(message)}\n\n`,
        });
      } catch { return; /* page closed while the answer was held */ }
      convo.messages.push({ role: 'assistant', content: this.answerHtml });
      convo.lastActivity = new Date().toISOString();
      this.answered++;
    });

    await context.route(/\/api\/history(\?|$)/, async route => {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(route.request(), 'application/json'),
        body: JSON.stringify({ messages: this.historyMessages, hasMore: false, session: null }),
      });
    });

    await context.route(/\/api\/history\/conversations(\?|$)/, async route => {
      this.historyListLoads++;
      const conversations = [...this.conversations.values()]
        .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
        .map(c => this.summary(c));
      await route.fulfill({
        status: 200,
        headers: corsHeaders(route.request(), 'application/json'),
        body: JSON.stringify({ conversations, hasMore: false, total: conversations.length, limit: 20, offset: 0 }),
      });
    });

    await context.route(/\/api\/history\/conversations\/[^/?]+(\?|$)/, async route => {
      const sessionId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
      this.chatLoads.push(sessionId);
      const held = this.heldChats.get(sessionId);
      if (held) await held.promise;
      const convo = this.conversations.get(sessionId);
      if (!convo) {
        await route.fulfill({ status: 404, headers: corsHeaders(route.request(), 'application/json'), body: '{"detail":"Not found"}' }).catch(() => {});
        return;
      }
      const messages = convo.messages.map((m, i) => ({
        messageId: `msg_stub_${sessionId}_${i}`,
        sessionId,
        userId: 'stub-user',
        role: m.role,
        content: m.content,
        timestamp: new Date(Date.parse(convo.createdAt) + i * 1000).toISOString(),
        processingState: m.role === 'user' ? 'completed' : '',
        status: 'success',
        pageUrl: '',
        responseMessageId: null,
        appetizerData: null,
        toolCalls: m.role === 'user' ? null : [],
      }));
      await route.fulfill({
        status: 200,
        headers: corsHeaders(route.request(), 'application/json'),
        body: JSON.stringify({ conversation: this.summary(convo), messages, session: { turnCount: messages.length / 2, totalTokens: 0 } }),
      }).catch(() => { /* page closed while the chat was held */ });
    });
  }

  private summary(c: StubConversation) {
    const turns = c.messages.filter(m => m.role === 'user').length;
    return { sessionId: c.sessionId, title: c.title, createdAt: c.createdAt, lastActivity: c.lastActivity, messageCount: c.messages.length, turnCount: turns };
  }
}

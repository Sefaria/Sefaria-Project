import { BrowserContext, Route, expect } from '@playwright/test';
import { MODULE_URLS } from '../constants';
import { t } from '../globals';

/**
 * A fake Library Assistant chat server for Playwright tests.
 *
 * The `<lc-chatbot>` widget talks to its chat server (whatever Sefaria passes
 * as the `api-base-url` attribute — e.g. https://chat-dev.sefaria.org/api or
 * http://localhost:8001/api). This class intercepts those requests inside the
 * browser and answers them itself, so the tests:
 *   - need no AI backend and finish in seconds instead of 10–20 s per answer;
 *   - can choose the exact answer text (e.g. an answer with a link to Shabbat 23b);
 *   - can choose WHEN the answer arrives (hold it, close the assistant, then
 *     release it) — which the answer-ready-notification stories depend on.
 *
 * The response shapes copy ai-chatbot `main` (server/chat/urls.py,
 * server/chat/views.py, server/chat/V2/views.py and src/lib/api.js):
 *   POST {api}/chat/stream and {api}/v2/chat/stream → text/event-stream with
 *        `event: progress` and a final `event: message`
 *   GET  {api}/history                              → this session's messages
 *   GET  {api}/history/conversations                → saved chats list
 *   GET  {api}/history/conversations/<sessionId>    → one saved chat
 *   {api}/v2/chat/{recover,cancel,client-event,feedback}, {api}/v2/prompts/defaults
 *
 * Install it on the BrowserContext BEFORE the first navigation
 * (i.e. before goToPageWithUser), because the widget asks for history as soon
 * as it opens.
 */

export interface SavedChat {
  sessionId: string;
  title: string;
  question: string;
  answerMarkdown: string;
}

interface HistoryMessage {
  messageId: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  processingState: string;
  status: string;
  pageUrl: string;
  responseMessageId: string | null;
  appetizerData: null;
  toolCalls: unknown[];
}

const DEFAULT_ANSWER = 'This is an answer from the test chat server.';

// Requests to Sefaria itself are never the chat server, even if a path looks similar.
const SEFARIA_ORIGINS = new Set(
  [MODULE_URLS.EN.LIBRARY, MODULE_URLS.HE.LIBRARY, MODULE_URLS.EN.VOICES, MODULE_URLS.HE.VOICES]
    .map((u) => { try { return new URL(u).origin; } catch { return ''; } }),
);

const STREAM_PATH = /\/api\/(v2\/)?chat\/stream\/?$/;
const HISTORY_PATH = /\/api\/history\/?$/;
const CONVERSATIONS_PATH = /\/api\/history\/conversations\/?$/;
const CONVERSATION_DETAIL_PATH = /\/api\/history\/conversations\/([^/]+)\/?$/;
const MISC_V2_PATH = /\/api\/v2\/(chat\/(recover|cancel|client-event|feedback)|prompts\/defaults)\/?$/;

// The chat server lives on another origin, so the browser enforces CORS on our fake responses too.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export class ChatServerMock {
  /** The text of every question the widget has sent, in order. */
  readonly questions: string[] = [];

  private readonly sessions = new Map<string, HistoryMessage[]>();
  private readonly savedChats: SavedChat[];
  private readonly queuedAnswers: string[] = [];
  private holding = false;
  private heldAnswers: Array<() => void> = [];
  private counter = 0;

  private constructor(savedChats: SavedChat[]) {
    this.savedChats = savedChats;
    for (const chat of savedChats) {
      this.sessions.set(chat.sessionId, this.buildTurn(chat.sessionId, '', chat.question, chat.answerMarkdown, ''));
    }
  }

  static async install(context: BrowserContext, options: { savedChats?: SavedChat[] } = {}): Promise<ChatServerMock> {
    const mock = new ChatServerMock(options.savedChats ?? []);
    await context.route((url) => mock.isChatServerUrl(url), (route) => mock.handle(route));
    return mock;
  }

  /** The next question gets this answer (markdown). Call several times to queue several answers. */
  answerNextWith(markdown: string): void {
    this.queuedAnswers.push(markdown);
  }

  /** From now on, answers wait until releaseAnswers() is called. */
  holdAnswers(): void {
    this.holding = true;
  }

  /** Send every held answer now, and stop holding new ones. */
  releaseAnswers(): void {
    this.holding = false;
    const release = this.heldAnswers;
    this.heldAnswers = [];
    release.forEach((send) => send());
  }

  /** Wait until the widget has sent at least `count` questions. */
  async waitForQuestion(count = 1): Promise<void> {
    await expect.poll(() => this.questions.length, { timeout: t(15000) }).toBeGreaterThanOrEqual(count);
  }

  // ---------------------------------------------------------------------------

  private isChatServerUrl(url: URL): boolean {
    if (SEFARIA_ORIGINS.has(url.origin)) return false;
    return [STREAM_PATH, HISTORY_PATH, CONVERSATIONS_PATH, CONVERSATION_DETAIL_PATH, MISC_V2_PATH]
      .some((re) => re.test(url.pathname));
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_mock_${this.counter}`;
  }

  private buildTurn(sessionId: string, userId: string, question: string, answer: string, pageUrl: string): HistoryMessage[] {
    const now = new Date().toISOString();
    const userMessageId = this.nextId('msg');
    const answerMessageId = this.nextId('msg');
    const base = { sessionId, userId, timestamp: now, pageUrl, appetizerData: null, toolCalls: [] };
    return [
      { ...base, messageId: userMessageId, role: 'user', content: question, processingState: 'completed', status: 'success', responseMessageId: answerMessageId },
      { ...base, messageId: answerMessageId, role: 'assistant', content: answer, processingState: 'completed', status: 'success', responseMessageId: null },
    ];
  }

  private async json(route: Route, body: unknown, status = 200): Promise<void> {
    await route.fulfill({ status, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(body) });
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
      } else if (STREAM_PATH.test(url.pathname)) {
        await this.handleStream(route);
      } else if (HISTORY_PATH.test(url.pathname)) {
        const messages = this.sessions.get(url.searchParams.get('sessionId') ?? '') ?? [];
        await this.json(route, { messages, hasMore: false, session: { turnCount: messages.length / 2, totalTokens: 0 } });
      } else if (CONVERSATIONS_PATH.test(url.pathname)) {
        const conversations = this.savedChats.map((chat) => this.summary(chat));
        await this.json(route, { conversations, hasMore: false, total: conversations.length, limit: 20, offset: 0 });
      } else if (CONVERSATION_DETAIL_PATH.test(url.pathname)) {
        const sessionId = decodeURIComponent(url.pathname.match(CONVERSATION_DETAIL_PATH)![1]);
        const chat = this.savedChats.find((c) => c.sessionId === sessionId);
        if (!chat) {
          await this.json(route, { error: 'conversation_not_found' }, 404);
        } else if (request.method() === 'DELETE') {
          await this.json(route, { success: true });
        } else {
          const messages = this.sessions.get(sessionId) ?? [];
          await this.json(route, { conversation: this.summary(chat), messages, session: { turnCount: messages.length / 2, totalTokens: 0 } });
        }
      } else if (url.pathname.includes('/v2/chat/cancel')) {
        await this.json(route, { status: 'cancelled', processingState: 'cancelled' });
      } else if (url.pathname.includes('/v2/chat/recover')) {
        await this.json(route, { status: 'failed', error: 'mock chat server: nothing to recover' });
      } else if (url.pathname.includes('/v2/prompts/defaults')) {
        await this.json(route, { corePromptSlug: '', labs: false });
      } else {
        await this.json(route, { success: true });
      }
    } catch {
      // The page was closed while a held answer was waiting — nothing left to answer.
    }
  }

  private summary(chat: SavedChat) {
    const now = new Date().toISOString();
    return { sessionId: chat.sessionId, title: chat.title, createdAt: now, lastActivity: now, messageCount: 2, turnCount: 1 };
  }

  private async handleStream(route: Route): Promise<void> {
    const body = route.request().postDataJSON() ?? {};
    const question: string = body.text ?? '';
    const sessionId: string = body.sessionId ?? 'sess_mock';
    this.questions.push(question);
    const answer = this.queuedAnswers.shift() ?? DEFAULT_ANSWER;

    if (this.holding) {
      await new Promise<void>((resolve) => this.heldAnswers.push(resolve));
    }

    const turn = this.buildTurn(sessionId, body.userId ?? '', question, answer, body.context?.pageUrl ?? '');
    this.sessions.set(sessionId, [...(this.sessions.get(sessionId) ?? []), ...turn]);
    const reply = turn[1];
    const message = {
      messageId: reply.messageId,
      sessionId,
      timestamp: reply.timestamp,
      markdown: answer,
      traceId: this.nextId('trace'),
      toolCalls: [],
      session: { turnCount: (this.sessions.get(sessionId)?.length ?? 2) / 2 },
      stats: {},
      recovered: false,
      status: 'success',
    };
    // Server-sent events: an `event:` line, a single-line `data:` JSON line, then a blank line.
    const sse =
      `event: progress\ndata: ${JSON.stringify({ type: 'status', text: 'Searching the library' })}\n\n` +
      `event: message\ndata: ${JSON.stringify(message)}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sse,
    });
  }
}

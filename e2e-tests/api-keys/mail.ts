import { request as playwrightRequest } from '@playwright/test';
import { LOCAL_PORTS, TargetName } from './env';

/**
 * Reads mail the local stack sent, through Mailpit's API. The cauldron sends real mail and has no
 * mailbox, so specs that need one skip there (target.hasMailbox).
 */

export const CONFIRMATION_LINK = /https?:\/\/\S+\/settings\/developer\/confirm-email\/\S+/;

export function mailpitUrl(target: TargetName): string | undefined {
  if (target !== 'local') return undefined;
  return (process.env.APIKEYS_MAILPIT_URL || `http://127.0.0.1:${LOCAL_PORTS.mailpit}`).replace(/\/+$/, '');
}

type MailpitSummary = { ID: string; Created: string; Subject: string; To: { Address: string }[] };

export type Message = { id: string; created: string; subject: string; text: string; html: string };

async function withMailpit<T>(target: TargetName, fn: (base: string, ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>) => Promise<T>) {
  const base = mailpitUrl(target);
  if (!base) throw new Error('No mailbox on this target; skip with target.hasMailbox.');
  if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(base)) throw new Error(`Refusing a non-local Mailpit URL: ${base}`);
  const ctx = await playwrightRequest.newContext();
  try {
    return await fn(base, ctx);
  } finally {
    await ctx.dispose();
  }
}

/** Messages to `email`, newest first. */
export async function messagesTo(target: TargetName, email: string): Promise<Message[]> {
  return withMailpit(target, async (base, ctx) => {
    const search = await ctx.get(`${base}/api/v1/search`, { params: { query: `to:"${email}"`, limit: 50 } });
    if (!search.ok()) throw new Error(`Mailpit search failed: HTTP ${search.status()}`);
    const summaries: MailpitSummary[] = (await search.json()).messages || [];
    summaries.sort((a, b) => b.Created.localeCompare(a.Created));
    const out: Message[] = [];
    for (const s of summaries) {
      const full = await ctx.get(`${base}/api/v1/message/${s.ID}`);
      if (!full.ok()) continue;
      const m = await full.json();
      out.push({ id: s.ID, created: s.Created, subject: s.Subject, text: m.Text || '', html: m.HTML || '' });
    }
    return out;
  });
}

export async function countMessagesTo(target: TargetName, email: string): Promise<number> {
  return (await messagesTo(target, email)).length;
}

/**
 * The confirmation link in the newest message to `email` that arrived after `since` (an ISO time
 * or Date; omit to accept any). Polls until one arrives.
 */
export async function latestConfirmationLink(
  target: TargetName,
  email: string,
  { since, timeoutMs = 15000 }: { since?: Date | string; timeoutMs?: number } = {},
): Promise<string> {
  const floor = since ? new Date(since).getTime() : 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await messagesTo(target, email);
    for (const m of messages) {
      if (new Date(m.created).getTime() < floor) continue;
      const match = m.text.match(CONFIRMATION_LINK) || m.html.replace(/&amp;/g, '&').match(CONFIRMATION_LINK);
      if (match) return match[0].replace(/[">)\].,]+$/, '');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`No confirmation link for ${email} arrived within ${timeoutMs} ms.`);
}

/**
 * The browser-usable form of a link from the mail. Locally Django builds it from the request host,
 * which is already www.gateway.test:10080; this only guards against a link that points elsewhere.
 */
export function linkPath(link: string): string {
  const url = new URL(link);
  return url.pathname + url.search;
}

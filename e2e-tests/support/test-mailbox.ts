/**
 * Read back an email the server sent to a test address, through the test mailbox
 * (GET /api/test-mailbox/latest, powered_by/e2e_mailbox.py).
 *
 * The deployment under test must have TEST_MAILBOX_ENABLED=true and TEST_MAILBOX_TOKEN set,
 * and the address must match its TEST_MAILBOX_ADDRESS_REGEX (by default @sefaria-e2e.test,
 * the domain support/throwaway-user.js registers with). The Playwright run needs the same
 * token in TEST_MAILBOX_TOKEN.
 *
 *   const since = new Date();
 *   // ...click "Send confirmation email"...
 *   const link = await waitForConfirmationLink(request, baseURL, email, { since });
 *   await page.goto(link);
 */

import { APIRequestContext, expect } from '@playwright/test';
import { t } from '../globals';

export type MailboxMessage = {
  to: string;
  subject: string;
  sent_at: string;
  links: string[];
  body: string;
};

/** Why the mailbox cannot be used in this run, or null when it can. For test.skip. */
export function testMailboxPrerequisitesMissing(): string | null {
  return process.env.TEST_MAILBOX_TOKEN ? null : 'TEST_MAILBOX_TOKEN is not set for the Playwright run';
}

/**
 * Poll until a message for `address` arrives (sent at or after `since`, when given), and return it.
 * `since` compares the server's clock with this machine's; a fresh throwaway address per test
 * avoids needing it at all.
 * Fails after `timeout` ms, so a disabled mailbox or a wrong token (both 404) shows up as a
 * clear failure rather than a silent skip.
 */
export async function waitForEmail(
  request: APIRequestContext,
  baseURL: string,
  address: string,
  { since, timeout = t(30000), interval = t(1000) }: { since?: Date; timeout?: number; interval?: number } = {}
): Promise<MailboxMessage> {
  const token = process.env.TEST_MAILBOX_TOKEN;
  if (!token) throw new Error('waitForEmail needs TEST_MAILBOX_TOKEN in the Playwright environment');
  // A leading "/" replaces the base's whole path, so a SANDBOX_URL ending in /texts still works.
  const url = new URL('/api/test-mailbox/latest', baseURL);
  url.searchParams.set('to', address);

  let found: MailboxMessage | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(url.href, { headers: { 'X-Test-Mailbox-Token': token } });
        if (!response.ok()) return false;
        const message: MailboxMessage = await response.json();
        if (since && new Date(message.sent_at) < since) return false;
        found = message;
        return true;
      },
      {
        timeout,
        intervals: [interval],
        message: `No email for ${address}. Is the test mailbox enabled on this deployment, and TEST_MAILBOX_TOKEN right?`,
      }
    )
    .toBe(true);
  return found!;
}

/** The Developer Settings confirmation link (/settings/developer/confirm-email/<key>) emailed to `address`. */
export async function waitForConfirmationLink(
  request: APIRequestContext,
  baseURL: string,
  address: string,
  options: { since?: Date; timeout?: number } = {}
): Promise<string> {
  const message = await waitForEmail(request, baseURL, address, options);
  const link = message.links.find((l) => l.includes('/settings/developer/confirm-email/'));
  if (!link) throw new Error(`The latest email to ${address} ("${message.subject}") has no confirmation link`);
  return link;
}

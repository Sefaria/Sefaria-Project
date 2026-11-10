import { AccountSession } from '../fixtures';

type OpenAccount = (suite: string, role: string) => Promise<AccountSession>;

/**
 * Opens a seeded account, waiting while another run's apikeys-setup is rewriting the shared
 * storage states (the files disappear for the length of its logins).
 */
export async function openAccount(account: OpenAccount, suite: string, role: string, waitMs = 180000): Promise<AccountSession> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      return await account(suite, role);
    } catch (error) {
      const message = String((error as Error).message || error);
      if (!/^No session for /.test(message) || Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Ids for follow sessions (docs/READER_STATE_API.md, "The share URL and tokens"). A session id is the join capability — whoever has it
 * can open the room — so it is treated like a password: 256 random bits from the platform's CSPRNG, never Math.random. Base62 keeps it
 * URL-safe without escaping (`follow=<id>` sits in an ordinary query string).
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 62^43 > 2^256, so 43 base62 digits hold any 256-bit value; ids are left-padded to that fixed length. */
const SESSION_ID_BYTES = 32;
const SESSION_ID_LENGTH = 43;
/** 62^22 > 2^128. A participant id is not a secret, only unique within a room. */
const PARTICIPANT_ID_BYTES = 16;
const PARTICIPANT_ID_LENGTH = 22;

function randomBase62(bytes: number, length: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(length, "0");
}

/** A new session id: 256 random bits, base62, 43 characters. */
export function newSessionId(): string {
  return randomBase62(SESSION_ID_BYTES, SESSION_ID_LENGTH);
}

/** A new participant id: 128 random bits, base62, 22 characters. */
export function newParticipantId(): string {
  return randomBase62(PARTICIPANT_ID_BYTES, PARTICIPANT_ID_LENGTH);
}

const SESSION_ID_RE = /^[0-9A-Za-z]{43}$/;

/** Is this string shaped like a session id? (A `follow` parameter is untrusted input; anything else is ignored, not sent to a room.) */
export function isSessionId(s: unknown): s is string {
  return typeof s === "string" && SESSION_ID_RE.test(s);
}

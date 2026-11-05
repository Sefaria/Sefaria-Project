// @feature PRM-014
import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyCookie, promoStorageKeys, readState, recordMaybeLater, sessionLengthSeconds, shouldHide, updateSessionCounter } from "./promo-backoff";

const C = "signup_promo_banner_dismissed";
const DAY = 24 * 60 * 60;

describe("promo back-off (the old SiteWideBanner)", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the old storage keys", () => {
    expect(promoStorageKeys(C)).toEqual({ state: `promo_backoff_${C}_state`, sessionCounter: `promo_backoff_${C}_session_counter`, lastSessionAtSec: `promo_backoff_${C}_last_session_at_sec` });
  });

  it("counts a new session only after the session length has passed", () => {
    expect(updateSessionCounter(localStorage, C, 1800, 1000)).toBe(1);
    expect(updateSessionCounter(localStorage, C, 1800, 2000)).toBe(1);
    expect(updateSessionCounter(localStorage, C, 1800, 2800)).toBe(2);
  });

  it("a bad configured length falls back to 30 minutes", () => {
    expect(sessionLengthSeconds("x")).toBe(1800);
    expect(sessionLengthSeconds(-5)).toBe(1800);
    expect(sessionLengthSeconds(600)).toBe(600);
  });

  it("shows with no history; after one Maybe later waits for 2 sessions AND 7 days", () => {
    expect(shouldHide(readState(localStorage, C), 1)).toBe(false);
    recordMaybeLater(localStorage, C, 1, 0);
    const s = readState(localStorage, C);
    expect(s).toMatchObject({ maybeLaterCount: 1, sessionCountAtLastDismissal: 1, dismissedForever: false });
    expect(shouldHide(s, 3, undefined, 6 * DAY)).toBe(true); // sessions yes, days no
    expect(shouldHide(s, 2, undefined, 8 * DAY)).toBe(true); // days yes, sessions no
    expect(shouldHide(s, 3, undefined, 7 * DAY)).toBe(false);
  });

  it("the third Maybe later hides it for good", () => {
    recordMaybeLater(localStorage, C, 1, 0);
    recordMaybeLater(localStorage, C, 2, 0);
    expect(recordMaybeLater(localStorage, C, 3, 0)).toMatchObject({ maybeLaterCount: 3, dismissedForever: true });
    expect(shouldHide(readState(localStorage, C), 100, undefined, 1000 * DAY)).toBe(true);
  });

  it("a dismissal from the old close button counts as one Maybe later from long ago", () => {
    migrateLegacyCookie(localStorage, C, `foo=1; ${C}=1`);
    expect(readState(localStorage, C)).toEqual({ maybeLaterCount: 1, lastDismissalTime: 0, sessionCountAtLastDismissal: 0, dismissedForever: false });
    migrateLegacyCookie(localStorage, "other", "foo=1");
    expect(readState(localStorage, "other")).toEqual({});
  });
});

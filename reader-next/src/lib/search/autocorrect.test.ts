import { describe, expect, it } from "vitest";
import { decideAutocorrect, NO_AUTOCORRECT } from "./autocorrect";

// @feature SRC-111 — master's searchAutocorrect.test.js rules (#3724)
describe("decideAutocorrect", () => {
  const fix = { corrected_query: "berakhot", suggested_queries: null };
  it("waits for the service, and treats its failure as no correction", () => {
    expect(decideAutocorrect({}, [0, 0, 0, 0])).toEqual({ pending: true });
    expect(decideAutocorrect({ error: true }, [0, 0, 0, 0])).toEqual(NO_AUTOCORRECT);
  });
  it("passes suggestions straight through, whatever the counts", () => {
    expect(decideAutocorrect({ data: { corrected_query: null, suggested_queries: ["shabbat", "shevat"] } }, [5, undefined])).toEqual({ pending: false, corrected: null, suggested: ["shabbat", "shevat"] });
  });
  it("corrects only when every tab found nothing for the query as typed", () => {
    expect(decideAutocorrect({ data: fix }, [0, 0, 0, 0])).toEqual({ pending: false, corrected: "berakhot", suggested: null });
    expect(decideAutocorrect({ data: fix }, [0, 3, 0, 0])).toEqual(NO_AUTOCORRECT);
  });
  it("decides as soon as one tab has results, and waits while the rest may", () => {
    expect(decideAutocorrect({ data: fix }, [undefined, 2, undefined, undefined])).toEqual(NO_AUTOCORRECT);
    expect(decideAutocorrect({ data: fix }, [0, undefined, 0, 0])).toEqual({ pending: true });
  });
  it("a failed or non-numeric count means searching the query as typed", () => {
    expect(decideAutocorrect({ data: fix }, [0, "error", 0, 0])).toEqual(NO_AUTOCORRECT);
    expect(decideAutocorrect({ data: fix }, [0, Number.NaN, 0, 0])).toEqual(NO_AUTOCORRECT);
  });
});

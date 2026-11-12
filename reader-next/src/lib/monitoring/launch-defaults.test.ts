import { describe, expect, it } from "vitest";
import { LABS, labEnabled, parseLabs } from "~/lib/labs";
import { vitalsEnabled } from "~/lib/analytics/web-vitals";
import { killSwitchOn } from "~/features/shell/reader-choice";
import { ErrorReporter } from "./error-reporter";

// docs/DECISIONS.md D-8, D-10 and the reader-choice and web-vitals switches: what a deployment with nothing configured does
describe("launch defaults", () => {
  it("D-10: PUBLIC_LABS unset and no remote-config keys: every lab is off", () => {
    expect(parseLabs(undefined)).toEqual([]);
    for (const lab of LABS) expect(labEnabled(lab, {}, parseLabs(undefined))).toBe(false);
  });
  it("D-8: no PUBLIC_ERROR_ENDPOINT: no error reports", () => {
    expect(new ErrorReporter({ endpoint: undefined, release: null }).enabled).toBe(false);
  });
  it("no remote-config row: no web vitals, kill switch off", () => {
    expect(vitalsEnabled({})).toBe(false);
    expect(killSwitchOn({})).toBe(false);
  });
});

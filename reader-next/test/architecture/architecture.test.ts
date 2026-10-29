// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collect, ROOT, RULES, type Violations } from "./rules";

/**
 * Architecture rules, enforced (CODE_REVIEW §3.1). Today's violations are in baseline.json and tolerated; anything new fails, and a
 * fixed violation must be removed from the baseline (run `node scripts/architecture-baseline.mjs`), so the debt only goes down.
 */
const baseline = JSON.parse(readFileSync(join(ROOT, "test/architecture/baseline.json"), "utf8")) as Violations;
const now = collect();

describe("architecture rules", () => {
  for (const rule of RULES) {
    describe(`${rule.id}: ${rule.why}`, () => {
      const was = baseline[rule.id] ?? {};
      const is = now[rule.id] ?? {};
      it("no new violations", () => {
        const added: string[] = [];
        for (const [file, v] of Object.entries(is)) {
          const before = was[file] ?? [];
          // colours and lang-without-dir are a count per file: it may not grow
          if (rule.counted) {
            if (parseInt(v[0]!) > parseInt(before[0] ?? "0")) added.push(`${file}: ${v[0]} (baseline ${before[0] ?? "none"})`);
          } else for (const x of v) if (!before.includes(x)) added.push(`${file}: ${x}`);
        }
        expect(added, `new violations of ${rule.id}`).toEqual([]);
      });
      it("the baseline holds no violation that has been fixed", () => {
        const stale: string[] = [];
        for (const [file, v] of Object.entries(was)) {
          const after = is[file] ?? [];
          if (rule.counted) {
            if (parseInt(after[0] ?? "0") < parseInt(v[0]!)) stale.push(`${file}: now ${after[0] ?? "0"}`);
          } else for (const x of v) if (!after.includes(x)) stale.push(`${file}: ${x}`);
        }
        expect(stale, "fixed: run node scripts/architecture-baseline.mjs to shrink the baseline").toEqual([]);
      });
    });
  }
});

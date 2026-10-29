// Writes today's architecture-rule violations to test/architecture/baseline.json (CODE_REVIEW §3.1). Run it only to SHRINK the
// baseline after fixing violations; the test fails on anything new.  Usage: node scripts/architecture-baseline.mjs
import { writeFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { collect, ROOT } = await jiti.import("../test/architecture/rules.ts");
const v = collect();
writeFileSync(`${ROOT}/test/architecture/baseline.json`, JSON.stringify(v, null, 2) + "\n");
for (const [rule, files] of Object.entries(v)) console.log(`${rule.padEnd(22)} ${Object.keys(files).length} file(s)`);

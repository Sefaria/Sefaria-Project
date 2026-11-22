#!/usr/bin/env node
// The surface manifest's JSON Schema, generated from its zod schema (contract/surface-manifest.v1.ts) with zod's own z.toJSONSchema,
// so the two cannot disagree. A surface's release validates the manifest it writes against the JSON file.
//
//   node --experimental-strip-types scripts/surface-manifest-schema.mjs           write contract/surface-manifest.v1.schema.json
//   node --experimental-strip-types scripts/surface-manifest-schema.mjs --check   exit 1 if that file is stale
//
// The unit test src/lib/surfaces/manifest-schema.test.ts makes the same comparison, so `npm test` fails on a stale file too.
// JSON Schema cannot say "every css path is listed in files" (a zod refinement): the reader checks that at run time.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "contract/surface-manifest.v1.schema.json");

export async function build() {
  const { surfaceManifestSchema } = await import("../contract/surface-manifest.v1.ts");
  const schema = { $id: "https://www.sefaria.org/reader/contract/surface-manifest.v1.schema.json", title: "Sefaria reader surface manifest, v1", ...z.toJSONSchema(surfaceManifestSchema, { unrepresentable: "any" }) };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const file = await build();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {}
    if (current !== file) {
      console.error("surface-manifest-schema: contract/surface-manifest.v1.schema.json is stale. Run: node --experimental-strip-types scripts/surface-manifest-schema.mjs");
      process.exit(1);
    }
    console.log("surface-manifest-schema: contract/surface-manifest.v1.schema.json is up to date");
  } else {
    writeFileSync(OUT, file);
    console.log("surface-manifest-schema: wrote contract/surface-manifest.v1.schema.json");
  }
}

// @vitest-environment node
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importTarget, ROOT, RULES } from "./rules";

/** Each new rule fails when it should: a violation planted in a file that does not exist is reported. */
const rule = (id: string) => RULES.find((r) => r.id === id)!;
const at = (path: string) => join(ROOT, path);

describe("surface-boundary", () => {
  const check = (path: string, src: string) => rule("surface-boundary").check(at(path), src);

  it("flags a reader file that imports surface code, by alias, relative path or dynamic import", () => {
    expect(check("src/features/reader/TextPanel.tsx", `import { getSurface } from "~/lib/surfaces/load";`)).toEqual(["~/lib/surfaces/load"]);
    expect(check("src/features/reader/TextPanel.tsx", `import { SurfacePage } from "../surfaces/SurfaceMount";`)).toEqual(["../surfaces/SurfaceMount"]);
    expect(check("src/lib/reader/x.ts", `import type { Surface } from "../../../contract/surface-host.v1";`)).toEqual(["../../../contract/surface-host.v1"]);
    expect(check("src/routes/texts.index.tsx", `const m = import("~/features/surfaces/SurfaceMount");`)).toEqual(["~/features/surfaces/SurfaceMount"]);
    expect(check("src/lib/x.ts", `import entry from "../../e2e/fixtures/social-surface/entry.js";`)).toEqual(["../../e2e/fixtures/social-surface/entry.js"]);
  });

  it("allows the loader itself and the shell", () => {
    const src = `import { getSurface } from "~/lib/surfaces/load";\nimport type { Surface } from "../../../contract/surface-host.v1";`;
    for (const p of ["src/lib/surfaces/host.ts", "src/features/surfaces/SurfaceMount.tsx", "src/routes/__root.tsx", "src/routes/social.index.tsx", "src/routes/social.$.tsx"]) expect(check(p, src), p).toEqual([]);
  });

  it("does not mistake a name that only starts like it", () => {
    expect(check("src/features/reader/x.tsx", `import { a } from "~/lib/surfacesque";\nimport { b } from "~/features/surfaces-old/x";`)).toEqual([]);
  });
});

describe("reader-state-core-pure", () => {
  const check = (src: string, path = "src/lib/reader-state/core/api.ts") => rule("reader-state-core-pure").check(at(path), src);

  it("flags app, React, router, vendored and out-of-folder imports in the core", () => {
    expect(check(`import { x } from "~/lib/config";`)).toEqual(["~/lib/config"]);
    expect(check(`import { useState } from "react";`)).toEqual(["react"]);
    expect(check(`import { createRoot } from "react-dom/client";`)).toEqual(["react-dom/client"]);
    expect(check(`import type { AnyRouter } from "@tanstack/react-router";`)).toEqual(["@tanstack/react-router"]);
    expect(check(`import { c } from "@vendor/sefaria-toolkit/client";`)).toEqual(["@vendor/sefaria-toolkit/client"]);
    expect(check(`import { acceptsUrl } from "../sefaria/safe-url";`)).toEqual(["../sefaria/safe-url"]);
  });

  it("allows the core's own files and plain packages", () => {
    expect(check(`import type { ReaderHost } from "./types";\nimport { z } from "zod";\nimport { w } from "./transports/memory";`)).toEqual([]);
  });

  it("applies to the core only", () => {
    expect(check(`import { useState } from "react";`, "src/lib/reader-state/sefaria/host.ts")).toEqual([]);
  });
});

describe("importTarget", () => {
  it("resolves aliases and relative paths from the reader-next root", () => {
    expect(importTarget(at("src/a/b.ts"), "~/lib/x")).toBe("src/lib/x");
    expect(importTarget(at("src/a/b.ts"), "../c/d")).toBe("src/c/d");
    expect(importTarget(at("src/a/b.ts"), "zod")).toBeNull();
  });
});

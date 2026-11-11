import { describe, expect, it } from "vitest";
import { pageKindCss, type BundleChunk } from "../../vite-plugins/page-kind-css";

/** A client bundle's chunks as Rollup hands them to generateBundle (the parts the plugin reads). */
const chunk = (fileName: string, facadeModuleId: string | null, imports: string[], css: string[]): BundleChunk => ({ type: "chunk", fileName, facadeModuleId, imports, viteMetadata: { importedCss: new Set(css) } });

// v-exits F-2: the reader's own stylesheet (the Workspace chunk) was not in the server-rendered head
describe("each page kind's stylesheets, from the client bundle", () => {
  const bundle: Record<string, BundleChunk> = {
    "assets/Workspace-a.js": chunk("assets/Workspace-a.js", "/repo/reader-next/src/features/workspace/Workspace.tsx", ["assets/SearchPage-b.js", "assets/shared-c.js"], ["assets/Workspace-CKvE1TEM.css"]),
    "assets/SearchPage-b.js": chunk("assets/SearchPage-b.js", null, ["assets/shared-c.js"], ["assets/SearchPage-x.css"]),
    "assets/shared-c.js": chunk("assets/shared-c.js", null, ["assets/SearchPage-b.js"], ["assets/Button-y.css"]),
    "assets/BookRoute-d.js": chunk("assets/BookRoute-d.js", "/repo/reader-next/src/features/book/BookRoute.tsx", ["assets/shared-c.js"], ["assets/BookRoute-z.css"]),
    "assets/Workspace.css": { type: "asset", fileName: "assets/Workspace-CKvE1TEM.css" },
  };

  // @feature PLT-003
  it("lists a kind's CSS and that of the chunks it imports (dependencies first, each once, cycles followed once)", () => {
    expect(pageKindCss(bundle)).toEqual({
      text: ["/assets/Button-y.css", "/assets/SearchPage-x.css", "/assets/Workspace-CKvE1TEM.css"],
      book: ["/assets/SearchPage-x.css", "/assets/Button-y.css", "/assets/BookRoute-z.css"],
    });
  });

  it("puts the base path in front", () => {
    expect(pageKindCss(bundle, undefined, "/static")).toMatchObject({ book: ["/static/assets/SearchPage-x.css", "/static/assets/Button-y.css", "/static/assets/BookRoute-z.css"] });
  });

  it("leaves out a kind whose chunk is not in the bundle (the plugin then fails the build)", () => {
    expect(pageKindCss({ "assets/BookRoute-d.js": bundle["assets/BookRoute-d.js"]!, "assets/shared-c.js": bundle["assets/shared-c.js"]!, "assets/SearchPage-b.js": bundle["assets/SearchPage-b.js"]! })).not.toHaveProperty("text");
  });

  it("leaves out what the page links anyway: the client entry's static graph and the root and $ route chunks'", () => {
    const withShell: Record<string, BundleChunk> = {
      ...bundle,
      "assets/index-e.js": { ...chunk("assets/index-e.js", "/repo/reader-next/node_modules/.virtual/client-entry.js", ["assets/shared-c.js"], ["assets/tokens.css"]), isEntry: true },
      "assets/$-f.js": chunk("assets/$-f.js", "/repo/reader-next/src/routes/$.tsx?tsr-split=component", [], ["assets/SearchPage-x.css"]),
    };
    expect(pageKindCss(withShell)).toEqual({ text: ["/assets/Workspace-CKvE1TEM.css"], book: ["/assets/BookRoute-z.css"] });
  });
});

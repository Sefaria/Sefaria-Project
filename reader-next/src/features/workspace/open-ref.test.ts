import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { indexMetaQueryOptions, type CommentaryMeta } from "~/lib/text/commentary";
import { panelForRef } from "./open-ref";

const rashi: CommentaryMeta = { title: "Rashi on Genesis", dependence: "Commentary", base_text_titles: ["Genesis"], base_text_mapping: "many_to_one", collectiveTitle: "Rashi" };

describe("panelForRef", () => {
  it("opens in the language it is given", async () => {
    const qc = makeQueryClient();
    expect(await panelForRef(qc, "Exodus 12:2", { lang: "he" })).toEqual({ kind: "text", ref: "Exodus 12:2", versions: {}, lang: "he" });
  });
  it("a comment opened as its base text keeps that language", async () => {
    const qc = makeQueryClient();
    qc.setQueryData(indexMetaQueryOptions("Rashi on Genesis").queryKey, rashi);
    expect(await panelForRef(qc, "Rashi on Genesis 1:1:4", { lang: "bi" })).toEqual({
      kind: "text", ref: "Genesis 1:1", versions: {}, lang: "bi", asides: [{ kind: "connections", view: "Rashi" }],
    });
  });
  it("without a language, the panel follows the reader's default", async () => {
    const qc = makeQueryClient();
    expect(await panelForRef(qc, "Exodus 12:2")).toEqual({ kind: "text", ref: "Exodus 12:2", versions: {} });
  });
});

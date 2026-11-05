// @feature SHL-066 @feature RTE-049 @feature RTE-043
import { describe, expect, it } from "vitest";
import { urlToRef } from "~/lib/ref/url";
import { parseSearch } from "~/lib/reader/search-serializer";
import { workspaceHref } from "~/features/workspace/navigation";
import { decodeWorkspace } from "./url";
import { LEGACY_URLS } from "./legacy-urls";

const roundTrip = (url: string) => {
  const [path, qs = ""] = url.split("?");
  const ws = decodeWorkspace(urlToRef(path!.slice(1)), parseSearch(`?${encodeURIComponent(qs).replace(/%3D/g, "=").replace(/%26/g, "&")}`));
  return decodeURIComponent(workspaceHref(ws)).replace(/\+/g, " ");
};

describe("legacy multi-panel URLs are read and written back exactly (owner decision 2026-10-06)", () => {
  for (const c of LEGACY_URLS) {
    // a case still to build is a todo (listed, not run): `it.fails` also "passed" when the code merely crashed (CODE_REVIEW R-33)
    if (c.todo) it.todo(`${c.layout} — ${c.how} (todo — ${c.todo})`);
    else
      it(`${c.layout} — ${c.how}`, () => {
        expect(roundTrip(c.url)).toBe(c.url);
      });
  }
});

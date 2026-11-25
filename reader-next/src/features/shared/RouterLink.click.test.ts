import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { fullLoadOnClick } from "./RouterLink";

/** A plain left click, recording whether the router's own handler would be skipped (defaultPrevented). */
function click(init: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) {
  let prevented = false;
  const e = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  } as unknown as MouseEvent<HTMLAnchorElement>;
  return e;
}

function onHost(host: string) {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, host, hostname: host.replace(/:\d+$/, ""), assign });
  return assign;
}

afterEach(() => vi.unstubAllGlobals());

describe("RouterLink: a link to a page this client does not serve on this host loads it from the server", () => {
  it("on the Voices host, a Library-only page (/topics…) is a full page load: Django answers it there", () => {
    const assign = onHost("voices.sefaria.org");
    const e = click();
    fullLoadOnClick("/topics/rashi")(e);
    expect(e.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith("/topics/rashi");
  });

  it("on the Library host the same link stays in the app (the router handles the click)", () => {
    const assign = onHost("www.sefaria.org");
    const e = click();
    fullLoadOnClick("/topics/rashi")(e);
    expect(e.defaultPrevented).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a Django page is a full page load on any host", () => {
    const assign = onHost("www.sefaria.org");
    const e = click();
    fullLoadOnClick("/settings/account")(e);
    expect(assign).toHaveBeenCalledWith("/settings/account");
  });

  it("a modified or middle click, or a handler that already prevented it, is left alone", () => {
    const assign = onHost("voices.sefaria.org");
    for (const e of [click({ metaKey: true }), click({ ctrlKey: true }), click({ button: 1 })]) fullLoadOnClick("/topics/rashi")(e);
    const prevented = click();
    fullLoadOnClick("/topics/rashi", (ev) => ev.preventDefault())(prevented);
    expect(assign).not.toHaveBeenCalled();
  });
});

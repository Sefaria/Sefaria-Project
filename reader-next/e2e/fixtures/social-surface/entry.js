// A tiny reference surface for the reader's end-to-end tests (e2e/social-surface.spec.ts): the smallest thing that honours the
// SurfaceHost v1 contract (contract/surface-host.v1.ts). Plain ES modules, no build: the spec serves these files, with a manifest
// whose integrity hashes it computes, from an allowed origin.
//
// The page mount shows where the reader is and offers three moves: open a ref in a room context through host.navigate, apply a
// snapshot through the reader state API, and build a link through host.href. The persistent mount renders nothing until the reader
// is in a context (ctx), then shows it with a "Leave" button. Both expose their host on window.__socialHost for the spec.
import { CTX, describeContext } from "./chunk.js";

const el = (tag, attrs, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
};

function mountPage(root, host) {
  window.__socialHost = host;
  if (host.contract.major !== 1) {
    root.replaceChildren(el("p", {}, "Please reload the page."));
    return () => root.replaceChildren();
  }
  const where = el("p", { "data-testid": "surface-where" });
  const viewer = el("p", { "data-testid": "surface-viewer" });
  const render = () => {
    const loc = host.location.get();
    where.textContent = `at ${loc.pathname}${loc.search}`;
    const v = host.viewer.get();
    viewer.textContent = v ? `signed in as ${v.name}` : "signed out";
  };
  const roomHref = `/Genesis.1?lang=bi&ctx=${CTX}`;
  const link = el("a", { href: host.href(roomHref), "data-testid": "surface-room-link" }, "Room link");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    host.navigate(roomHref);
  });
  root.replaceChildren(
    el(
      "section",
      { "data-testid": "reference-surface", "data-lang": host.ui.interfaceLang, "data-theme": host.ui.theme },
      el("h1", {}, "Reference surface"),
      where,
      viewer,
      el("button", { type: "button", "data-testid": "surface-open-room", onclick: () => host.navigate(roomHref) }, "Open Genesis 1 in the room"),
      // contract 1.1: a text beside the page (an older reader has no openBeside: navigate instead)
      el("button", { type: "button", "data-testid": "surface-open-beside", onclick: () => (host.openBeside ? host.openBeside("/Genesis.1.3?lang=bi") : host.navigate("/Genesis.1.3?lang=bi")) }, "Open Genesis 1:3 beside"),
      el("input", { "data-testid": "surface-kept", "aria-label": "Something typed on the page" }),
      el(
        "button",
        {
          type: "button",
          "data-testid": "surface-apply",
          onclick: () => void host.reader.state.applySnapshot({ v: 1, url: "/Genesis.2?lang=bi", nav: {}, slices: {} }, { origin: "external", persist: false }),
        },
        "Apply a snapshot",
      ),
      link,
    ),
  );
  render();
  const offLoc = host.location.subscribe(render);
  const offViewer = host.viewer.subscribe(render);
  host.report({ kind: "event", name: "reference_mounted", data: { mount: "page" } });
  return () => {
    offLoc();
    offViewer();
    root.replaceChildren();
  };
}

function mountPersistent(root, host) {
  window.__socialHost = host;
  const render = () => {
    const ctx = host.reader.context.get();
    if (!ctx) return root.replaceChildren();
    root.replaceChildren(
      el(
        "div",
        { "data-testid": "surface-persistent" },
        el("span", { "data-testid": "surface-ctx" }, describeContext(ctx)),
        el(
          "button",
          {
            type: "button",
            "data-testid": "surface-persistent-apply",
            onclick: () => void host.reader.state.applySnapshot({ v: 1, url: "/Genesis.2?lang=bi", nav: {}, slices: {} }, { origin: "follow", persist: false }),
          },
          "Follow to Genesis 2",
        ),
        el("button", { type: "button", "data-testid": "surface-leave", onclick: () => host.navigate("/social") }, "Leave"),
      ),
    );
  };
  render();
  const off = host.reader.context.subscribe(render);
  return () => {
    off();
    root.replaceChildren();
  };
}

export default { id: "social", contract: 1, mountPage, mountPersistent };

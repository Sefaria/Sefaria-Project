/**
 * The script an asset inlines to talk to the reader (LINKED_PANELS_AND_ASSETS_PLAN.md §5.4). This copy is the reference: the MCP's skill
 * ships the same text (ai-chatbot server/skills_catalog/skills/sefaria-linked-asset/references/shim.js), and the sample asset inlines it
 * (a test keeps them equal).
 *
 *   SefariaLink.onPlace(function (place) { … })   place = { ref, segments, cause: "init" | "user" | "link" | "replay" }
 *   SefariaLink.setPlace("Genesis 1:6")            only on the viewer's own scroll or click
 *   SefariaLink.open("Psalms 104:19")              take the linked text panel to another text
 *
 * Outside the reader (Claude's preview, a plain tab) no one answers, and the asset works on its own. Calls made while a place is being
 * handled, or repeating the place the asset is already at, are not sent, so the two sides never chase each other.
 *
 * @feature SHL-094 Asset protocol
 */
export const SHIM_SOURCE = `(function () {
  var port = null, handling = false, listeners = [], last = null, tries = 0;
  function deliver(p, cause) {
    last = p.ref;
    handling = true;
    try { for (var i = 0; i < listeners.length; i++) listeners[i]({ ref: p.ref, segments: p.segments || [], cause: cause }); }
    finally { setTimeout(function () { handling = false; }, 0); }
  }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (port || e.source !== window.parent || !d || d.type !== "sefaria:connect" || d.v !== 1 || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = function (ev) {
      var m = ev.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "init") { api.context = m; if (m.place) deliver(m.place, "init"); }
      else if (m.type === "place" && typeof m.ref === "string") deliver(m, m.cause || "link");
    };
  });
  var api = {
    context: null,
    connected: function () { return !!port; },
    onPlace: function (cb) { if (typeof cb === "function") listeners.push(cb); },
    setPlace: function (ref) {
      if (!port || handling || !ref || ref === last) return;
      last = String(ref);
      port.postMessage({ type: "place", ref: last });
    },
    open: function (ref) { if (port && ref) port.postMessage({ type: "open", ref: String(ref) }); }
  };
  window.SefariaLink = api;
  function hello() {
    if (port || window.parent === window || tries++ > 4) return;
    window.parent.postMessage({ type: "sefaria:ready", v: 1 }, "*");
    setTimeout(hello, 400 * tries);
  }
  hello();
})();`;

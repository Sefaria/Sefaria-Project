/**
 * The script an asset inlines to talk to the reader (LINKED_PANELS_AND_ASSETS_PLAN.md §5.4). This copy is the reference: the MCP's skill
 * ships the same text (ai-chatbot server/skills_catalog/skills/sefaria-linked-asset/references/shim.js), and the sample asset inlines it
 * (a test keeps them equal).
 *
 *   SefariaLink.onPlace(function (place) { … })   place = { ref, segments, cause } (cause "link" | "replay"; none on arrival)
 *   SefariaLink.setPlace("Genesis 1:6")            only on the viewer's own scroll or click
 *   SefariaLink.open("Psalms 104:19")              take the linked text panel to another text
 *   SefariaLink.info                               the init message (theme, dir, context…), or null
 *
 * Outside the reader (Claude's preview, a plain tab) no one answers, and the asset works on its own. setPlace calls made while a place
 * is handled and for half a second after (a smooth scroll the handler started), or repeating the last place, are not sent, so the two
 * sides never chase each other.
 *
 * @feature SHL-094 Asset protocol
 */
export const SHIM_SOURCE = `/* SefariaLink v1: links this page to the Sefaria reader. Paste it, unchanged, in a <script>
   before your own code. Outside the reader it does nothing and the page works on its own. */
(function (w) {
  var port = null, handlers = [], quietUntil = 0, tries = 0, last = null;
  var parent = w.parent !== w ? w.parent : null;
  function deliver(place) {
    // Moves caused by the reader must not be sent back: quiet while handling, and for
    // half a second after, so a smooth scroll the handler starts is not echoed.
    quietUntil = Date.now() + 500;
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](place); } catch (e) { console.error(e); }
    }
    quietUntil = Date.now() + 500;
  }
  function onPort(e) {
    var m = e.data || {};
    if (m.type === "init") {
      w.SefariaLink.info = m;
      if (m.place && m.place.ref) deliver(m.place);
    } else if (m.type === "place" && m.ref) {
      last = m.ref;
      deliver({ ref: m.ref, segments: m.segments || [], cause: m.cause });
    }
  }
  function send(type, ref) {
    if (port && typeof ref === "string" && ref) port.postMessage({ type: type, ref: ref });
  }
  w.SefariaLink = {
    info: null,
    connected: function () { return !!port; },
    onPlace: function (fn) { if (typeof fn === "function") handlers.push(fn); },
    setPlace: function (ref) {
      if (Date.now() < quietUntil || ref === last) return;
      last = ref;
      send("place", ref);
    },
    open: function (ref) { send("open", ref); }
  };
  if (!parent) return;
  w.addEventListener("message", function (e) {
    var m = e.data;
    if (port || e.source !== parent || !m || m.type !== "sefaria:connect" || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = onPort;
  });
  (function ready() {
    if (port || tries++ > 3) return;
    parent.postMessage({ type: "sefaria:ready", v: 1 }, "*");
    setTimeout(ready, 400 * tries);
  })();
})(window);`;

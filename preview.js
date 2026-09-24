(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./game.js") : root.Wildwood);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GamePreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (G) {
  "use strict";
  const REVISION = "20260924-preview1";
  function fingerprint(value) {
    let hash = 2166136261;
    for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16);
  }
  function resolve(href) {
    const url = new URL(href);
    if (!url.searchParams.has("preview")) return null;
    if (url.searchParams.get("preview") !== "mimir-opoly") throw new Error("Unknown preview link. Use ?preview=mimir-opoly.");
    const fragment = new URLSearchParams(url.hash.slice(1));
    let config = G.clone(G.eventConfig);
    if (fragment.has("setup")) {
      const encoded = fragment.get("setup");
      if (!encoded || encoded.length > 200000) throw new Error("Invalid or oversized preview setup.");
      try {
        const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        config = G.validateConfig(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      } catch (error) { throw new Error(`Invalid preview setup: ${error.message}`); }
    }
    G.start(config, "demo");
    return { config, key: `mimir-opoly-preview-v1:${fingerprint(config)}` };
  }
  function makeLink(config, href) {
    const snapshot = G.validateConfig(config);
    delete snapshot.hostNotes;
    G.start(snapshot, "demo");
    const url = new URL(href);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    url.search = ""; url.hash = "";
    url.searchParams.set("preview", "mimir-opoly");
    url.searchParams.set("v", REVISION);
    const encoded = btoa(Array.from(new TextEncoder().encode(JSON.stringify(snapshot)), byte => String.fromCharCode(byte)).join(""))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (encoded.length > 200000) throw new Error("This setup is too large for a preview link. Use setup export/import instead.");
    url.hash = new URLSearchParams({ setup: encoded }).toString();
    return url.href;
  }
  return { REVISION, resolve, makeLink };
});

// Thin, cached wrappers over the public Sefaria APIs (same origin by default).

const CFG = window.GEM_CONFIG || {};
const BASE = (CFG.apiBase || "").replace(/\/$/, "");
export const SEFARIA = (CFG.sefariaBase || "https://www.sefaria.org").replace(/\/$/, "");

const memo = new Map();

function enc(ref) {
  return encodeURIComponent(ref.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%3A/gi, ":");
}

async function getJSON(path, { cache = true, ttl = 0 } = {}) {
  const url = BASE + path;
  if (cache && memo.has(url)) return memo.get(url);
  const p = fetch(url, { credentials: "same-origin" }).then(async (r) => {
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} for ${path}`);
      err.status = r.status;
      throw err;
    }
    const j = await r.json();
    if (j && typeof j === "object" && !Array.isArray(j) && j.error) {
      const err = new Error(j.error);
      err.api = true;
      throw err;
    }
    return j;
  });
  if (cache) {
    memo.set(url, p);
    p.catch(() => memo.delete(url));
  }
  return p;
}

// Persisted cache (localStorage) for slow-changing catalog data.
async function getJSONPersisted(path, key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t < maxAgeMs) return v;
    }
  } catch (e) { /* storage unavailable */ }
  const v = await getJSON(path);
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* quota */ }
  return v;
}

export const api = {
  text(ref) {
    return getJSON(`/api/v3/texts/${enc(ref)}?version=hebrew&version=english`);
  },
  links(ref) {
    return getJSON(`/api/links/${enc(ref)}?with_text=0&category=Commentary`);
  },
  shape(corpus) {
    const cat = corpus === "yerushalmi" ? "Yerushalmi" : "Bavli";
    return getJSONPersisted(`/api/shape/${cat}`, `gem:shape:${cat}:v1`, 7 * 864e5);
  },
  index(title) {
    return getJSONPersisted(`/api/v2/raw/index/${enc(title)}`, `gem:index:${title}:v1`, 7 * 864e5);
  },
  words(word, lookupRef) {
    const q = lookupRef ? `?lookup_ref=${encodeURIComponent(lookupRef)}` : "";
    return getJSON(`/api/words/${encodeURIComponent(word)}${q}`);
  },
  completion(word) {
    return getJSON(`/api/words/completion/${encodeURIComponent(word)}`);
  },
  name(q) {
    return getJSON(`/api/name/${encodeURIComponent(q)}?limit=8`);
  },
  calendars() {
    // Ask for the reader's local calendar date explicitly so the server's timezone is irrelevant.
    const d = new Date();
    return getJSON(`/api/calendars?year=${d.getFullYear()}&month=${d.getMonth() + 1}&day=${d.getDate()}`);
  },
  /**
   * Full-text search. `body` follows /api/search-wrapper's contract (see sefaria/helper/search.py).
   * Falls back to the nginx Elasticsearch passthrough (GET + ?source=) if the wrapper fails.
   */
  async search(body, signal) {
    const key = "search|" + JSON.stringify(body);
    if (memo.has(key)) return memo.get(key);
    const p = (async () => {
      try {
        const r = await fetch(`${BASE}/api/search-wrapper/es8`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(body),
          signal,
        });
        if (!r.ok) throw new Error(`search ${r.status}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        return j;
      } catch (e) {
        if (signal && signal.aborted) throw e;
        const es = buildESQuery(body);
        const url = `${BASE}/api/search/${body.type || "text"}/_search?source_content_type=application/json&source=${encodeURIComponent(JSON.stringify(es))}`;
        const r = await fetch(url, { signal });
        if (!r.ok) throw new Error(`search ${r.status}`);
        return r.json();
      }
    })();
    memo.set(key, p);
    p.catch(() => memo.delete(key));
    return p;
  },
};

/** Mirrors sefaria.helper.search.get_query_obj for the passthrough fallback. */
export function buildESQuery(b) {
  const query = b.query.replace(/(\S)"(\S)/g, "$1\u05f4$2");
  const core = { match_phrase: { [b.field]: { query, slop: b.slop || 0 } } };
  let inner = core;
  if (b.filters && b.filters.length) {
    const should = b.filters.map((f) => {
      const p = f.replace(/\/$/, "").replace(/[.?+*|{}[\]()"\\#@&<>~]/g, "\\$&");
      return { regexp: { path: `${p}|${p}/.*` } };
    });
    inner = { bool: { must: core, filter: { bool: { must: [{ bool: { should } }] } } } };
  }
  const es = { from: b.start || 0, size: b.size || 20, _source: true };
  if (b.sort_method === "score" && b.sort_fields && b.sort_fields.length === 1) {
    es.query = { function_score: { query: inner, field_value_factor: { field: b.sort_fields[0], missing: b.sort_score_missing || 0 } } };
  } else {
    es.query = inner;
    if (b.sort_fields && b.sort_fields.length) es.sort = b.sort_fields.map((f) => ({ [f]: { order: b.sort_reverse ? "desc" : "asc" } }));
  }
  if (b.aggs && b.aggs.length) {
    es.aggs = {};
    for (const a of b.aggs) es.aggs[a] = { terms: { field: a, size: 10000 } };
  }
  es.highlight = { pre_tags: ["<b>"], post_tags: ["</b>"], fields: { [b.field]: { fragment_size: 200 } } };
  return es;
}

export function sefariaUrl(ref) {
  return `${SEFARIA}/${enc(ref).replace(/:/g, ".").replace(/%20/g, "_")}`;
}

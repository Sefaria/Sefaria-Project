// Per-viewer reading memory: last position and which amudim have been opened.

const VISITED = "gem:visited:v1";
const LAST = "gem:last:v1";

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

let visited = read(VISITED, {});

export function markVisited(book, key) {
  const list = visited[book] || (visited[book] = []);
  if (!list.includes(key)) {
    list.push(key);
    write(VISITED, visited);
  }
}
export function visitedSet(book) {
  return new Set(visited[book] || []);
}

export function saveLast(corpus, ref) {
  const v = read(LAST, {});
  v[corpus] = ref;
  v.corpus = corpus;
  write(LAST, v);
}
export function getLast(corpus) {
  const v = read(LAST, {});
  return corpus ? v[corpus] || null : v;
}

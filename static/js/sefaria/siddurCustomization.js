// Per-device siddur customization. A reader unchecks sections of a siddur in a
// tree; unchecked sections are dropped from the book's table of contents and
// skipped while scrolling the reader. Stored in localStorage only, so no account
// is needed. Hidden sections are stored as schema leaf refs, composed the same
// way the book TOC composes them ("<title>, <node>, <node>").

export const CUSTOMIZABLE_SIDDURIM = ["The Koren Shalem Siddur; Ashkenaz"];
export const STORAGE_KEY = "siddur.hiddenSections";
export const CHANGE_EVENT = "sefaria:siddurCustomizationChange";

export const isCustomizableSiddur = title => CUSTOMIZABLE_SIDDURIM.includes(title);

const storage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
};

const readAll = ls => {
  try {
    const all = JSON.parse(ls.getItem(STORAGE_KEY) || "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch (e) {
    return {};
  }
};

export function getHiddenRefs(title) {
  const ls = storage();
  if (!ls) { return []; }
  const refs = readAll(ls)[title];
  return Array.isArray(refs) ? refs : [];
}

export function setHiddenRefs(title, refs) {
  const ls = storage();
  if (!ls) { return; }
  const all = readAll(ls);
  if (refs.length) { all[title] = refs; } else { delete all[title]; }
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {detail: {title}}));
}

export function subscribeHiddenRefs(title, callback) {
  // Calls back with the title's hidden refs now and whenever they change, here
  // or in another tab. Returns an unsubscribe function. Call after mount only:
  // server renders always see no hidden refs.
  if (!isCustomizableSiddur(title) || typeof window === "undefined") { return () => {}; }
  const onChange = () => callback(getHiddenRefs(title));
  const onStorage = e => { if (e.key === STORAGE_KEY) { onChange(); } };
  onChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function buildTree(schema, title) {
  // [{ref, en, he, depth, contentCounts, children}] for the nodes of an index schema.
  const walk = (nodes, path) => nodes.map(node => {
    const ref = node.default ? path : `${path}, ${node.title}`;
    return {
      ref,
      en: node.title,
      he: node.heTitle,
      depth: node.depth,
      contentCounts: node.content_counts,
      children: node.nodes ? walk(node.nodes, ref) : [],
    };
  });
  return schema && schema.nodes ? walk(schema.nodes, title) : [];
}

export const leavesOf = node => node.children.length ? node.children.flatMap(leavesOf) : [node];

export const flattenLeaves = tree => tree.flatMap(leavesOf);

export function isRefHidden(ref, hiddenRefs) {
  // True if `ref` (a leaf, section or segment ref) falls inside a hidden leaf.
  // Requires a digit after the leaf ref so that "..., Hoshanot" doesn't hide
  // its sibling "..., Hoshanot for Hoshana Raba".
  return !!ref && hiddenRefs.some(h =>
    ref === h || (ref.startsWith(h + " ") && /^\d/.test(ref.slice(h.length + 1))));
}

export function pruneSchema(schema, title, hiddenRefs) {
  // Copy of `schema` without hidden leaves or nodes whose leaves are all hidden.
  if (!hiddenRefs.length || !schema || !schema.nodes) { return schema; }
  const hidden = new Set(hiddenRefs);
  const prune = (node, path) => {
    if (!node.nodes) { return hidden.has(path) ? null : node; }
    const nodes = node.nodes
      .map(child => prune(child, child.default ? path : `${path}, ${child.title}`))
      .filter(Boolean);
    return nodes.length ? {...node, nodes} : null;
  };
  return prune(schema, title) || {...schema, nodes: []};
}

const countIsEmpty = count => typeof count === "number" ? count === 0 : !count.some(c => !countIsEmpty(c));

export function leafSectionRefs(leaf) {
  // Section refs of a leaf, in order. A depth-1 leaf is a single section.
  const counts = leaf.contentCounts;
  if (!leaf.depth || leaf.depth <= 1) {
    return counts === 0 ? [] : [leaf.ref];
  }
  if (!Array.isArray(counts)) { return [`${leaf.ref} 1`]; }
  const refs = [];
  const walk = (level, address, depth) => level.forEach((count, i) => {
    const addr = address ? `${address}:${i + 1}` : `${i + 1}`;
    if (depth === 2) {
      if (!countIsEmpty(count)) { refs.push(`${leaf.ref} ${addr}`); }
    } else if (Array.isArray(count)) {
      walk(count, addr, depth - 1);
    }
  });
  walk(counts, "", leaf.depth);
  return refs;
}

export function firstVisibleSectionRef(leaves, hiddenRefs) {
  for (const leaf of leaves) {
    if (isRefHidden(leaf.ref, hiddenRefs)) { continue; }
    const sections = leafSectionRefs(leaf);
    if (sections.length) { return sections[0]; }
  }
  return null;
}

export function skipHidden(rawRef, dir, leaves, hiddenRefs) {
  // Given the API's next/prev section ref, returns the nearest section in
  // direction `dir` ("next" | "prev") that isn't hidden, or null if none is left.
  if (!rawRef || !isRefHidden(rawRef, hiddenRefs)) { return rawRef; }
  let i = leaves.findIndex(leaf => isRefHidden(rawRef, [leaf.ref]));
  if (i < 0) { return rawRef; }
  const step = dir === "prev" ? -1 : 1;
  for (i += step; i >= 0 && i < leaves.length; i += step) {
    if (isRefHidden(leaves[i].ref, hiddenRefs)) { continue; }
    const sections = leafSectionRefs(leaves[i]);
    if (sections.length) { return step > 0 ? sections[0] : sections[sections.length - 1]; }
  }
  return null;
}

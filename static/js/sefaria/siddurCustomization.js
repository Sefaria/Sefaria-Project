// Per-device siddur customization. A reader unchecks sections of a siddur in a
// tree; unchecked sections are dropped from the book's table of contents and
// skipped while scrolling the reader. Stored in localStorage only, so no account
// is needed. Hidden sections are stored as schema leaf refs, composed the same
// way the book TOC composes them ("<title>, <node>, <node>"), or, inside the
// leaves listed in siddurSubsections.json, as paragraph ranges ("<leaf ref> 8-12").
// The sub-section map is hand-curated from the text's bold headings; within each
// leaf, a node's children cover its whole range.

import SUBSECTIONS from './siddurSubsections.json';

export const CUSTOMIZABLE_SIDDURIM = ["The Koren Shalem Siddur; Ashkenaz"];
export const STORAGE_KEY = "siddur.hiddenSections";
export const OPTIONS_KEY = "siddur.displayOptions";
export const DEFAULT_OPTIONS = {showInstructions: true, showHints: false};
export const CHANGE_EVENT = "sefaria:siddurCustomizationChange";

export const isCustomizableSiddur = title => CUSTOMIZABLE_SIDDURIM.includes(title);

const storage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
};

const readAll = (ls, key = STORAGE_KEY) => {
  try {
    const all = JSON.parse(ls.getItem(key) || "{}");
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

export function getDisplayOptions(title) {
  const ls = storage();
  const options = ls ? readAll(ls, OPTIONS_KEY)[title] : null;
  return {...DEFAULT_OPTIONS, ...(options && typeof options === "object" ? options : {})};
}

export function setDisplayOptions(title, options) {
  const ls = storage();
  if (!ls) { return; }
  const all = readAll(ls, OPTIONS_KEY);
  all[title] = {...DEFAULT_OPTIONS, ...options};
  try {
    ls.setItem(OPTIONS_KEY, JSON.stringify(all));
  } catch (e) {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {detail: {title}}));
}

export function subscribeCustomization(title, callback) {
  // Calls back with the title's hidden refs and display options now and whenever
  // they change, here or in another tab. Returns an unsubscribe function. Call
  // after mount only: server renders always see the defaults.
  if (!isCustomizableSiddur(title) || typeof window === "undefined") { return () => {}; }
  const onChange = () => callback(getHiddenRefs(title), getDisplayOptions(title));
  const onStorage = e => { if (e.key === STORAGE_KEY || e.key === OPTIONS_KEY) { onChange(); } };
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

const segmentRangeRef = (leafRef, from, to) => `${leafRef} ${from === to ? from : `${from}-${to}`}`;

const subsectionNodes = (items, leafRef) => items.map(item => ({
  ref: segmentRangeRef(leafRef, item.from, item.to),
  en: item.en,
  he: item.he,
  from: item.from,
  to: item.to,
  children: item.children ? subsectionNodes(item.children, leafRef) : [],
}));

export function buildCustomizeTree(schema, title) {
  // buildTree, with each leaf's sub-sections from the curated map as children.
  const subsections = SUBSECTIONS[title] || {};
  const attach = nodes => nodes.map(node => {
    if (node.children.length) { return {...node, children: attach(node.children)}; }
    const items = subsections[node.ref.slice(title.length + 2)];
    return items ? {...node, children: subsectionNodes(items, node.ref)} : node;
  });
  return attach(buildTree(schema, title));
}

export function normalizeHiddenRefs(tree, hiddenRefs) {
  // Hidden refs as the tree's leaves, in tree order. A ref saved for a node that
  // has since gained children stands for all of them; refs not in the tree drop.
  const hidden = new Set(hiddenRefs);
  const walk = (node, inherited) => {
    const isHidden = inherited || hidden.has(node.ref);
    return node.children.length ? node.children.flatMap(child => walk(child, isHidden)) : (isHidden ? [node.ref] : []);
  };
  return tree.flatMap(node => walk(node, false));
}

const resolved = new WeakMap();

export function resolveHidden(title, hiddenRefs) {
  // Splits stored refs into schema leaves to skip entirely and paragraph ranges
  // to hide within leaves that stay visible: {leafRefs, segments: {leafRef: [{from, to, en, he}]}}.
  if (resolved.has(hiddenRefs)) { return resolved.get(hiddenRefs); }
  const hidden = new Set(hiddenRefs);
  const leafRefs = [];
  const segments = {};
  const claimed = new Set();
  const isHidden = node => node.children.length ? node.children.every(isHidden) : hidden.has(node.ref);
  const hiddenRanges = nodes => nodes.flatMap(node =>
    isHidden(node) ? [{from: node.from, to: node.to, en: node.en, he: node.he}] : hiddenRanges(node.children));
  Object.entries(SUBSECTIONS[title] || {}).forEach(([path, items]) => {
    const leafRef = `${title}, ${path}`;
    const nodes = subsectionNodes(items, leafRef);
    claimed.add(leafRef);
    nodes.flatMap(leavesOf).forEach(node => claimed.add(node.ref));
    if (hidden.has(leafRef) || nodes.every(isHidden)) {
      leafRefs.push(leafRef);
      return;
    }
    const ranges = hiddenRanges(nodes);
    if (ranges.length) { segments[leafRef] = ranges; }
  });
  hiddenRefs.filter(ref => !claimed.has(ref)).forEach(ref => leafRefs.push(ref));
  const result = {leafRefs, segments};
  resolved.set(hiddenRefs, result);
  return result;
}

export function hiddenSegmentsFor(sref, segments) {
  // The hidden paragraph ranges of the leaf that section ref `sref` is in.
  const leafRef = Object.keys(segments).find(leaf => isRefHidden(sref, [leaf]));
  return leafRef ? segments[leafRef] : null;
}

export function hintGroups(ranges) {
  // Hidden paragraph ranges, with adjacent ones merged into a single note: [{from, to, names: [{en, he}]}].
  const groups = [];
  [...ranges].sort((a, b) => a.from - b.from).forEach(range => {
    const last = groups[groups.length - 1];
    if (last && range.from === last.to + 1) {
      last.to = range.to;
      last.names.push({en: range.en, he: range.he});
    } else {
      groups.push({from: range.from, to: range.to, names: [{en: range.en, he: range.he}]});
    }
  });
  return groups;
}

export function hiddenRun(rawRef, dir, leaves, hiddenRefs) {
  // The hidden leaves from rawRef's leaf up to the next visible one in direction
  // `dir` ("next" | "prev"), in book order.
  if (!rawRef || !isRefHidden(rawRef, hiddenRefs)) { return []; }
  let i = leaves.findIndex(leaf => isRefHidden(rawRef, [leaf.ref]));
  if (i < 0) { return []; }
  const step = dir === "prev" ? -1 : 1;
  const run = [];
  for (; i >= 0 && i < leaves.length && isRefHidden(leaves[i].ref, hiddenRefs); i += step) { run.push(leaves[i].ref); }
  return step > 0 ? run : run.reverse();
}

export function namesFor(tree, refs) {
  // The largest nodes made up only of the leaves in `refs`, as [{en, he}] in book order.
  const set = new Set(refs);
  const walk = node => leavesOf(node).every(leaf => set.has(leaf.ref)) ?
    [{en: node.en, he: node.he}] : node.children.flatMap(walk);
  return tree.flatMap(walk);
}

const INSTRUCTION_RE = /<i class=["']instruction["']>[\s\S]*?<\/i>/g;

export function stripInstructions(html) {
  // Removes the siddur's instruction elements and the line breaks they leave behind.
  if (!html || html.indexOf("instruction") === -1) { return html; }
  return html.replace(INSTRUCTION_RE, "")
    .replace(/(?:<br\s*\/?>\s*){2,}/g, "<br>")
    .replace(/^((?:\s|<(?:small|b|span)[^>]*>)*)(?:<br\s*\/?>\s*)+/, "$1")
    .replace(/(?:\s*<br\s*\/?>)+((?:\s|<\/(?:small|b|span)>)*)$/, "$1");
}

export const isBlankHtml = html => !html || !html.replace(/<[^>]+>|&nbsp;|\s/g, "");

export function visibleSegments(segments, hiddenRanges, hideInstructions) {
  // Drops paragraphs in hidden ranges and, if asked, instructions; paragraphs
  // that were only instructions drop entirely.
  let visible = segments.filter(s => !hiddenRanges.some(r => s.number >= r.from && s.number <= r.to));
  if (hideInstructions) {
    visible = visible
      .map(s => ({...s, en: stripInstructions(s.en), he: stripInstructions(s.he)}))
      .filter(s => !isBlankHtml(s.en) || !isBlankHtml(s.he));
  }
  return visible;
}

export function interleaveHints(segments, elements, groups, makeHint) {
  // Inserts makeHint(group) before the first visible paragraph after each group.
  const out = [];
  let g = 0;
  segments.forEach((segment, i) => {
    while (g < groups.length && groups[g].to < segment.number) { out.push(makeHint(groups[g++])); }
    out.push(elements[i]);
  });
  return out.concat(groups.slice(g).map(makeHint));
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

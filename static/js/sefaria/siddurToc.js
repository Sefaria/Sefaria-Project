// Flatten and filter a book's schema for the siddur TOC overlay. Pure functions, Jest-tested.

export function flattenSiddurToc(schema, title) {
  // Depth-first list of titled schema nodes: {ref, en, he, depth, parent, isLeaf}, where
  // `parent` is the index of the enclosing item (null at top level). Default nodes have no title of their own.
  const items = [];
  const walk = (nodes, refPath, depth, parent) => {
    (nodes || []).forEach(node => {
      if (node.default) { return; }
      const ref = `${refPath}, ${node.title}`;
      const index = items.length;
      items.push({ref, en: node.title, he: node.heTitle || node.title, depth, parent, isLeaf: !node.nodes});
      if (node.nodes) { walk(node.nodes, ref, depth + 1, index); }
    });
  };
  walk(schema && schema.nodes, title, 0, null);
  return items;
}

export function normalizeTocQuery(s) {
  // Case-, nikud- and punctuation-insensitive so "maariv" finds "Ma'ariv" and "שחרית" finds "שַׁחֲרִית".
  return (s || "")
      .toLowerCase()
      .replace(/[֑-ׇ]/g, "")
      .replace(/['"`‘’׳״]/g, "")
      .replace(/\s+/g, " ")
      .trim();
}

export function filterSiddurToc(items, query) {
  // Keep matching items, everything inside a matching section, and the ancestors of every kept item.
  const q = normalizeTocQuery(query);
  if (!q) { return items; }
  const keep = items.map(item =>
      normalizeTocQuery(item.en).includes(q) || normalizeTocQuery(item.he).includes(q));
  // Items come parents-first, so one forward pass pulls in descendants of matches.
  items.forEach((item, i) => { if (item.parent !== null && keep[item.parent]) { keep[i] = true; } });
  items.forEach((item, i) => {
    if (!keep[i]) { return; }
    for (let p = item.parent; p !== null && !keep[p]; p = items[p].parent) { keep[p] = true; }
  });
  return items.filter((item, i) => keep[i]);
}

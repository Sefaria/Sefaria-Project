/**
 * The cross-references graph model: raw `/api/links/<ref>?with_text=0` rows → connected books
 * grouped by category, laid out radially around the selected ref. Pure geometry; the component
 * draws the SVG. Jest-covered.
 */
import { groupConnections } from '../../reader/textData';

export const GRAPH_SIZE = 320;

/**
 * `{ total, shown, hidden, categories: [{ category, count, startAngle, endAngle }], nodes: [{ id, title,
 * heTitle, category, count, targetRef, x, y, r, angle }] }`. Books are placed on a ring, sectors
 * proportional to each category's share of the shown books; `maxBooks` keeps the picture readable.
 */
export function graphModel(links, { maxBooks = 18, size = GRAPH_SIZE } = {}) {
  const grouped = groupConnections(links);
  const all = [];
  grouped.categories.forEach(cat => cat.books.forEach(book => all.push({ ...book, category: cat.category })));
  if (grouped.citedBy) { grouped.citedBy.books.forEach(book => all.push({ ...book, category: grouped.citedBy.category })); }
  const picked = all.slice().sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, maxBooks);
  // keep category order from groupConnections so sectors stay in a familiar order
  const order = [...grouped.categories.map(c => c.category), grouped.citedBy ? grouped.citedBy.category : null].filter(Boolean);
  picked.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.count - a.count);

  const cx = size / 2, cy = size / 2;
  const ring = size * 0.36;
  const maxCount = Math.max(1, ...picked.map(b => b.count));
  const step = picked.length ? (Math.PI * 2) / picked.length : 0;
  const nodes = picked.map((book, i) => {
    const angle = -Math.PI / 2 + i * step;
    const r = 6 + 12 * Math.sqrt(book.count / maxCount);
    const first = book.links[0] || {};
    return {
      id: `${book.category}:${book.title}`,
      title: book.title,
      heTitle: book.heTitle || book.title,
      category: book.category,
      count: book.count,
      targetRef: first.sourceRef || first.ref || book.indexTitle || book.title,
      angle,
      x: cx + ring * Math.cos(angle),
      y: cy + ring * Math.sin(angle),
      r,
    };
  });
  const categories = [];
  nodes.forEach((node, i) => {
    const last = categories[categories.length - 1];
    if (last && last.category === node.category) { last.count += node.count; last.books += 1; last.endAngle = node.angle + step / 2; return; }
    categories.push({ category: node.category, count: node.count, books: 1, startAngle: node.angle - step / 2, endAngle: node.angle + step / 2 });
  });
  return { total: grouped.total, shown: nodes.length, hidden: all.length - nodes.length, categories, nodes, size, cx, cy, ring };
}

/** Where a label sits for a node: outside the ring, anchored away from the centre. */
export function labelPosition(node, { cx, cy, ring }) {
  const lx = cx + (ring + node.r + 8) * Math.cos(node.angle);
  const ly = cy + (ring + node.r + 8) * Math.sin(node.angle);
  const cos = Math.cos(node.angle);
  const anchor = cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle';
  return { x: lx, y: ly, anchor };
}

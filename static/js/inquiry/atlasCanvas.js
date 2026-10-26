// Canvas rendering stays imperative; React owns the page chrome and polling.
// The "map" is a treemap of the library's categories; every book has a fixed spot in it.
// Circles are sized by recent reads, a halo pulses on each read, and a dot travels
// between books when a reader moves from one to another.
import * as d3 from './vendor/d3.v7.min';

const PULSE_MS = 1700;
const TRAVEL_MS = 1500;
const TRAIL_LINGER_MS = 3500;
const MAX_ANIMATIONS = 400;

function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withAlpha(color, alpha) {
  const c = d3.color(color);
  if (!c) return color;
  c.opacity = alpha;
  return c.formatRgb();
}

const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createAtlasMap(canvas, catalog, {onHover} = {}) {
  const ctx = canvas.getContext('2d');
  const books = catalog.books.map((b, id) => ({id, title: b[0], cat: b[1]}));
  const categories = catalog.categories;
  const size = new Float64Array(books.length);       // reads among the baseline records
  const readers = new Float64Array(books.length);    // people on this book right now
  const radius = new Float64Array(books.length);     // displayed radius, eased toward target
  let width = 800, height = 560, transform = d3.zoomIdentity;
  let regions = [], subregions = [], positions = [];
  let pulses = [], travels = [], trails = [];
  let hover = null, focused = null, frame = null, disposed = false;
  let seen = new Set(), firstUpdate = true;
  const timers = new Set();
  let colors = readColors();

  function readColors() {
    return {
      dot: token('--atlas-dot', '#3b6fd4'),
      land: token('--atlas-land', '#eceff3'),
      landAlt: token('--atlas-land-alt', '#e4e8ee'),
      water: token('--atlas-water', '#fbfcfd'),
      border: token('--atlas-border', '#ffffff'),
      label: token('--atlas-label', '#5b6573'),
      text: token('--atlas-text', '#1f2933'),
      speck: token('--atlas-speck', '#c3cad4'),
    };
  }

  function layout() {
    const tree = {name: 'Library', children: []};
    books.forEach(book => {
      let parent = tree;
      const path = categories[book.cat]?.length ? categories[book.cat] : ['Uncategorized'];
      path.forEach(part => {
        let next = parent.children.find(d => d.name === part && d.book === undefined);
        if (!next) parent.children.push(next = {name: part, children: []});
        parent = next;
      });
      parent.children.push({name: book.title, book: book.id});
    });
    const root = d3.hierarchy(tree).sum(n => (n.book !== undefined ? 1 : 0))
      .sort((a, b) => b.value - a.value || a.data.name.localeCompare(b.data.name));
    d3.treemap().size([width, height]).tile(d3.treemapSquarify.ratio(1.3))
      .paddingInner(n => (n.depth === 0 ? 3 : 0))
      .paddingTop(n => (n.depth === 1 ? Math.min(18, (n.y1 - n.y0) * .1) : 0))(root);
    regions = root.children || [];
    subregions = root.descendants().filter(n => n.depth === 2 && n.children);
    positions = Array(books.length);
    root.leaves().forEach(n => {
      positions[n.data.book] = {x: (n.x0 + n.x1) / 2, y: (n.y0 + n.y1) / 2};
    });
  }

  // Area grows with reads, so radius grows with the square root.
  function targetRadius(id) {
    const reads = size[id], now = readers[id];
    if (!reads && !now) return 0;
    return Math.min(44, 3 + 3.1 * Math.sqrt(reads + now));
  }
  const zoomBoost = () => Math.pow(transform.k, .15);
  const sx = id => transform.applyX(positions[id].x);
  const sy = id => transform.applyY(positions[id].y);

  function curve(a, b) {
    const [x0, y0, x1, y1] = [sx(a), sy(a), sx(b), sy(b)];
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy) || 1;
    const bend = Math.min(120, dist * .25);
    return {x0, y0, x1, y1, cx: (x0 + x1) / 2 - dy / dist * bend, cy: (y0 + y1) / 2 + dx / dist * bend};
  }
  const pointOn = (c, t) => ({
    x: (1 - t) * (1 - t) * c.x0 + 2 * (1 - t) * t * c.cx + t * t * c.x1,
    y: (1 - t) * (1 - t) * c.y0 + 2 * (1 - t) * t * c.cy + t * t * c.y1,
  });
  function strokeCurve(c, from, to) {
    ctx.beginPath();
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const p = pointOn(c, from + (to - from) * i / steps);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function label(occupied, text, x, y, {font = '12px system-ui, sans-serif', color = colors.text, halo = true} = {}) {
    ctx.font = font;
    const w = ctx.measureText(text).width, h = 14;
    if (x < 2 || y < 2 || x + w > width - 2 || y + h > height - 2) return false;
    const box = {x: x - 2, y: y - 1, w: w + 4, h: h + 2};
    if (occupied.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) return false;
    occupied.push(box);
    if (halo) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = withAlpha(colors.water, .9);
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return true;
  }

  function draw(now) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.water;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'top';

    // Land: one block per top-level corpus, subtle borders for subcategories when zoomed.
    regions.forEach((r, i) => {
      ctx.fillStyle = i % 2 ? colors.landAlt : colors.land;
      ctx.fillRect(transform.applyX(r.x0), transform.applyY(r.y0), (r.x1 - r.x0) * transform.k, (r.y1 - r.y0) * transform.k);
    });
    if (transform.k > 2) {
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      subregions.forEach(n => ctx.strokeRect(transform.applyX(n.x0), transform.applyY(n.y0), (n.x1 - n.x0) * transform.k, (n.y1 - n.y0) * transform.k));
    }
    if (transform.k >= 4) {
      ctx.fillStyle = colors.speck;
      positions.forEach((p, id) => {
        const x = sx(id), y = sy(id);
        if (x < 0 || y < 0 || x > width || y > height || radius[id] > 0) return;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      });
    }

    // Circles: eased toward their target size, biggest drawn first so small ones stay visible.
    const boost = zoomBoost();
    const active = [];
    for (let id = 0; id < books.length; id++) {
      const target = targetRadius(id);
      radius[id] += (target - radius[id]) * .08;
      if (Math.abs(target - radius[id]) < .05) radius[id] = target;
      if (radius[id] > .3) active.push(id);
    }
    active.sort((a, b) => radius[b] - radius[a]);
    for (const id of active) {
      const x = sx(id), y = sy(id), r = radius[id] * boost;
      if (x < -r || y < -r || x > width + r || y > height + r) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(colors.dot, hover === id || focused === id ? .6 : .38);
      ctx.fill();
      ctx.lineWidth = hover === id || focused === id ? 2 : 1;
      ctx.strokeStyle = withAlpha(colors.dot, .85);
      ctx.stroke();
    }

    // Lingering paths from completed moves fade out.
    trails = trails.filter(t => now - t.end < TRAIL_LINGER_MS);
    ctx.lineCap = 'round';
    for (const t of trails) {
      ctx.strokeStyle = withAlpha(colors.dot, .35 * (1 - (now - t.end) / TRAIL_LINGER_MS));
      ctx.lineWidth = 1.5;
      strokeCurve(curve(t.from, t.to), 0, 1);
    }

    // Travelling dots: a short tail behind a solid head.
    const arrived = [];
    travels = travels.filter(t => {
      const raw = (now - t.start) / TRAVEL_MS;
      if (raw < 0) return true;
      if (raw >= 1) { arrived.push(t); return false; }
      const p = easeInOut(raw), c = curve(t.from, t.to);
      ctx.strokeStyle = withAlpha(colors.dot, .25);
      ctx.lineWidth = 1.5;
      strokeCurve(c, 0, p);
      ctx.strokeStyle = withAlpha(colors.dot, .8);
      ctx.lineWidth = 2.5;
      strokeCurve(c, Math.max(0, p - .18), p);
      const head = pointOn(c, p);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.dot;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors.water;
      ctx.stroke();
      return true;
    });
    for (const t of arrived) {
      trails.push({from: t.from, to: t.to, end: now});
      pulses.push({book: t.to, start: now});
    }

    // Halos: a ring expanding out of the circle each time someone reads the book.
    pulses = pulses.filter(p => {
      const t = (now - p.start) / PULSE_MS;
      if (t < 0) return true;
      if (t >= 1) return false;
      const base = Math.max(radius[p.book] * boost, 4);
      ctx.beginPath();
      ctx.arc(sx(p.book), sy(p.book), base + 4 + 22 * d3.easeCubicOut(t), 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(colors.dot, .7 * (1 - t));
      ctx.lineWidth = 2.5 * (1 - t) + .5;
      ctx.stroke();
      return true;
    });

    // Numbers and names appear as you zoom in.
    const occupied = [];
    for (const id of active) {
      const x = sx(id), y = sy(id), r = radius[id] * boost, count = readers[id];
      if (x < 0 || y < 0 || x > width || y > height) continue;
      if (count && (r >= 15 || (transform.k >= 2.5 && r >= 8))) {
        const fontSize = Math.max(10, Math.min(16, r * .7));
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.text;
        ctx.fillText(String(count), x, y + .5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
      if (transform.k >= 3 || id === focused) {
        const text = count ? `${books[id].title} · ${count}` : books[id].title;
        label(occupied, text, x + r + 4, y - 7);
      }
    }
    regions.forEach(r => {
      const w = (r.x1 - r.x0) * transform.k;
      if (w > 60) label(occupied, r.data.name, transform.applyX(r.x0) + 5, transform.applyY(r.y0) + 3,
        {font: '600 11px system-ui, sans-serif', color: colors.label});
    });
    if (transform.k > 2.5) {
      subregions.forEach(n => {
        if ((n.x1 - n.x0) * transform.k > 80) label(occupied, n.data.name, transform.applyX(n.x0) + 4, transform.applyY(n.y0) + 3,
          {font: '11px system-ui, sans-serif', color: colors.label});
      });
    }
  }

  function loop(now) {
    if (disposed) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function zoomTo(k, x, y) {
    d3.select(canvas).transition().duration(650)
      .call(zoom.transform, d3.zoomIdentity.translate(width / 2 - k * x, height / 2 - k * y).scale(k));
  }

  function hitTest(event) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left, my = event.clientY - rect.top, boost = zoomBoost();
    let best = null, bestDistance = Infinity;
    for (let id = 0; id < books.length; id++) {
      if (radius[id] <= .3) continue;
      const d = Math.hypot(sx(id) - mx, sy(id) - my);
      if (d <= Math.max(radius[id] * boost, 6) && d < bestDistance) { best = id; bestDistance = d; }
    }
    return {id: best, x: mx, y: my};
  }

  const zoom = d3.zoom().scaleExtent([1, 60])
    .on('zoom', event => { transform = event.transform; });
  d3.select(canvas).call(zoom).on('dblclick.zoom', null);

  canvas.addEventListener('mousemove', event => {
    if (event.buttons) return;
    const hit = hitTest(event);
    hover = hit.id;
    canvas.style.cursor = hit.id !== null ? 'pointer' : 'grab';
    onHover?.(hit.id === null ? null : {id: hit.id, x: hit.x, y: hit.y});
  });
  canvas.addEventListener('mouseleave', () => { hover = null; onHover?.(null); });
  canvas.addEventListener('click', event => {
    const hit = hitTest(event);
    if (hit.id !== null) return api.focus(hit.id);
    if (transform.k < 1.5) {
      const [x, y] = transform.invert([hit.x, hit.y]);
      const region = regions.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
      if (region) {
        const k = Math.min(width / (region.x1 - region.x0), height / (region.y1 - region.y0)) * .92;
        zoomTo(k, (region.x0 + region.x1) / 2, (region.y0 + region.y1) / 2);
      }
    }
  });

  function resize() {
    width = canvas.clientWidth || width;
    height = canvas.clientHeight || height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    layout();
    zoom.translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]]);
    d3.select(canvas).call(zoom.transform, d3.zoomIdentity);
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { colors = readColors(); };
  scheme.addEventListener('change', onScheme);
  frame = requestAnimationFrame(loop);

  function later(ms, fn) {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms);
    timers.add(timer);
  }

  const api = {
    // Apply a snapshot: new sizes/reader counts, plus animations for reads not seen before.
    update(snapshot, pollSeconds) {
      size.fill(0);
      readers.fill(0);
      for (const [id, n] of snapshot.sizes || []) if (id < books.length) size[id] = n;
      for (const [id, n] of snapshot.readers || []) if (id < books.length) readers[id] = n;
      const events = snapshot.events || [];
      const fresh = events.filter(e => !seen.has(e.id) && e.book < books.length);
      seen = new Set(events.map(e => e.id));
      // Replay reads with their original spacing, delayed by one poll so they arrive smoothly.
      const horizon = snapshot.generated_at - pollSeconds;
      const playable = firstUpdate ? fresh.filter(e => e.t >= horizon) : fresh;
      firstUpdate = false;
      if (document.hidden) return;
      for (const e of playable.slice(-MAX_ANIMATIONS)) {
        const delay = Math.max(0, Math.min(pollSeconds, e.t - horizon)) * 1000;
        later(delay, () => {
          const now = performance.now();
          if (e.from !== null && e.from !== undefined && e.from < books.length) {
            if (travels.length < MAX_ANIMATIONS) travels.push({from: e.from, to: e.book, start: now});
            pulses.push({book: e.from, start: now - PULSE_MS * .6});
          } else if (pulses.length < MAX_ANIMATIONS) {
            pulses.push({book: e.book, start: now});
          }
        });
      }
    },
    focus(id) {
      focused = id;
      const p = positions[id];
      if (p) zoomTo(Math.max(transform.k, 8), p.x, p.y);
    },
    reset() {
      focused = null;
      d3.select(canvas).transition().duration(650).call(zoom.transform, d3.zoomIdentity);
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
      d3.select(canvas).on('.zoom', null);
    },
  };
  return api;
}

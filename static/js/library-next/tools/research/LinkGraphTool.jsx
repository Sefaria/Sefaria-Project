/**
 * Scholar: a radial graph of the works connected to the passage (`Sefaria.getLinks`, i.e.
 * `/api/links/<ref>?with_text=0`), grouped by category, node size by link count. Clicking a work
 * opens the first linked text. Counts are live data and labelled so.
 */
import React, { useEffect, useState } from 'react';
import Sefaria from '../../../sefaria/sefaria';
import { useT } from '../../i18n';
import { navigate } from '../../router';
import { refToPath } from '../../reader/refKind';
import { graphModel, labelPosition } from './linkGraph';

const color = (category) => {
  try { return (Sefaria.palette && Sefaria.palette.categoryColor(category)) || 'currentColor'; } catch (e) { return 'currentColor'; }
};

export function LinkGraph({ model, selection, close }) {
  const { t, lang } = useT();
  const { size, cx, cy, ring } = model;
  const open = (node) => { navigate(refToPath(node.targetRef)); if (close) { close(); } };
  const arc = (c) => {
    const r = ring + 26;
    const large = c.endAngle - c.startAngle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(c.startAngle), y1 = cy + r * Math.sin(c.startAngle);
    const x2 = cx + r * Math.cos(c.endAngle), y2 = cy + r * Math.sin(c.endAngle);
    return model.nodes.length === 1 ? null : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <svg className="ln-graph" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('research.graph.graphLabel', { ref: lang === 'he' ? selection.heRef : selection.ref })}>
      {model.categories.map(c => { const d = arc(c); return d ? <path key={c.category} d={d} className="ln-graph-arc" style={{ stroke: color(c.category) }} /> : null; })}
      {model.nodes.map(node => <line key={`l-${node.id}`} x1={cx} y1={cy} x2={node.x} y2={node.y} className="ln-graph-edge" style={{ stroke: color(node.category), strokeWidth: 0.5 + 2.5 * Math.sqrt(node.count / Math.max(1, model.nodes[0].count)) }} />)}
      <g className="ln-graph-center">
        <circle cx={cx} cy={cy} r={22} />
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle">{model.total}</text>
      </g>
      {model.nodes.map(node => {
        const label = labelPosition(node, model);
        const title = lang === 'he' ? node.heTitle : node.title;
        return (
          <g key={node.id} className="ln-graph-node" tabIndex={0} role="button" aria-label={t('research.graph.open', { title, n: node.count })}
             onClick={() => open(node)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(node); } }}>
            <title>{t('research.graph.open', { title, n: node.count })}</title>
            <circle cx={node.x} cy={node.y} r={node.r} style={{ fill: color(node.category) }} />
            <text x={label.x} y={label.y} dy="0.35em" textAnchor={label.anchor} className="ln-graph-label">{title.length > 18 ? `${title.slice(0, 17)}…` : title}</text>
            <text x={node.x} y={node.y} dy="0.35em" textAnchor="middle" className="ln-graph-count">{node.count}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function LinkGraphTool({ selection, close }) {
  const { t } = useT();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    Sefaria.getLinks(selection.ref)
      .then(links => { if (live) { setState({ loading: false, model: graphModel(links) }); } })
      .catch(() => { if (live) { setState({ loading: false, error: true }); } });
    return () => { live = false; };
  }, [selection.ref]);
  if (state.loading) { return <div className="ln-tool-body"><p className="ln-muted">{t('research.graph.loading')}</p></div>; }
  if (state.error) { return <div className="ln-tool-body"><p className="ln-muted">{t('research.graph.error')}</p></div>; }
  const { model } = state;
  if (!model.nodes.length) { return <div className="ln-tool-body"><p className="ln-muted">{t('research.graph.none')}</p></div>; }
  return (
    <div className="ln-tool-body ln-stack ln-linkgraph">
      <p className="ln-small ln-muted ln-graph-live" data-live="true">{t('research.graph.live', { n: model.total, books: model.shown + model.hidden })}</p>
      <LinkGraph model={model} selection={selection} close={close} />
      <ul className="ln-graph-legend">
        {model.categories.map(c => (
          <li key={c.category} className="ln-graph-legend-item"><span className="ln-cat-dot" style={{ '--cat': color(c.category), background: color(c.category) }} />{c.category} <span className="ln-muted">({c.count})</span></li>
        ))}
      </ul>
      <p className="ln-small ln-muted">{t('research.graph.hint')}{model.hidden > 0 ? ` · ${t('research.graph.more', { n: model.hidden })}` : ''}</p>
    </div>
  );
}

import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

// d3 is loaded globally via the template's <script> tag
const d3 = window.d3;

const CATEGORY_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

function colorForSlug(slug, colorMap) {
  if (!colorMap.has(slug)) {
    colorMap.set(slug, CATEGORY_COLORS[colorMap.size % CATEGORY_COLORS.length]);
  }
  return colorMap.get(slug);
}

function TopicBubbleChart({ topics, selectedTopic, onBubbleClick, interfaceLang, height }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const colorMap = useRef(new Map());

  useEffect(() => {
    if (!d3 || !topics || topics.length === 0 || !svgRef.current) return;

    const W = wrapRef.current ? wrapRef.current.clientWidth || 600 : 600;
    const H = height || Math.max(400, Math.min(W * 0.75, 560));

    const svg = d3.select(svgRef.current)
      .attr('width', W)
      .attr('height', H);

    svg.selectAll('*').remove();

    const root = d3.hierarchy({ children: topics })
      .sum(d => d.count || 1)
      .sort((a, b) => b.value - a.value);

    d3.pack()
      .size([W - 4, H - 4])
      .padding(3)(root);

    const node = svg.selectAll('g')
      .data(root.leaves())
      .enter()
      .append('g')
      .attr('transform', d => `translate(${d.x + 2},${d.y + 2})`)
      .style('cursor', 'pointer')
      .on('click', d => onBubbleClick(d.data));

    node.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => colorForSlug(d.data.slug, colorMap.current))
      .attr('fill-opacity', d =>
        selectedTopic && d.data.slug === selectedTopic.slug ? 1.0 : 0.72)
      .attr('stroke', d =>
        selectedTopic && d.data.slug === selectedTopic.slug ? '#333' : 'none')
      .attr('stroke-width', 2);

    node.filter(d => d.r > 18)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', d => Math.max(9, Math.min(13, d.r / 3.2)) + 'px')
      .style('fill', '#fff')
      .style('font-family', '"adobe-garamond-pro", Georgia, serif')
      .text(d => {
        const label = interfaceLang === 'hebrew' ? d.data.he : d.data.en;
        // Truncate if bubble is too small for the full label
        if (d.r < 32 && label.length > 8) return label.slice(0, 7) + '…';
        if (d.r < 48 && label.length > 14) return label.slice(0, 13) + '…';
        return label;
      });

    node.append('title')
      .text(d => {
        const label = interfaceLang === 'hebrew' ? d.data.he : d.data.en;
        return `${label} (${d.data.count})`;
      });

  }, [topics, selectedTopic, height, interfaceLang]);

  if (!topics || topics.length === 0) return null;

  return (
    <div className="topicBubbleWrap" ref={wrapRef}>
      <svg className="topicBubbleSvg" ref={svgRef} />
    </div>
  );
}

TopicBubbleChart.propTypes = {
  topics: PropTypes.arrayOf(PropTypes.shape({
    slug: PropTypes.string.isRequired,
    en: PropTypes.string.isRequired,
    he: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  })),
  selectedTopic: PropTypes.object,
  onBubbleClick: PropTypes.func.isRequired,
  interfaceLang: PropTypes.string,
  height: PropTypes.number,
};

export default TopicBubbleChart;

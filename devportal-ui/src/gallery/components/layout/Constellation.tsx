import styles from './Constellation.module.css';

// A decorative network of linked nodes, evoking Sefaria's linked texts.
// Exact coordinates don't matter. 17 nodes, 25 edges; nodes 2, 8 and 13 are hubs.
const NODES: ReadonlyArray<readonly [number, number]> = [
  [60, 90],
  [170, 40],
  [260, 120],
  [380, 60],
  [470, 150],
  [590, 70],
  [700, 130],
  [90, 230],
  [210, 250],
  [330, 200],
  [450, 290],
  [570, 220],
  [690, 280],
  [140, 380],
  [290, 360],
  [430, 430],
  [600, 400],
];
const HUBS = new Set([2, 8, 13]);
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [0, 7],
  [1, 8],
  [2, 9],
  [3, 9],
  [4, 10],
  [5, 11],
  [6, 12],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [7, 13],
  [8, 14],
  [9, 14],
  [10, 15],
  [11, 16],
  [13, 14],
  [14, 15],
];

const at = (i: number): readonly [number, number] => NODES[i] ?? [0, 0];

export function Constellation() {
  return (
    <svg
      className={styles.root}
      viewBox="0 0 760 480"
      preserveAspectRatio="xMaxYMin slice"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="#fff" strokeWidth="1.5" strokeOpacity="0.2" fill="none">
        {EDGES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={at(a)[0]} y1={at(a)[1]} x2={at(b)[0]} y2={at(b)[1]} />
        ))}
      </g>
      <g fill="#fff" fillOpacity="0.4">
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={HUBS.has(i) ? 6 : 3} />
        ))}
      </g>
    </svg>
  );
}

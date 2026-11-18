// Interface icons as live draws them (24×24 stroke icons, `currentColor`), and the language icons of the
// language picker. Decorative: every icon is aria-hidden; the control around it carries the name.
import type { ReactElement } from 'react';

const STROKE: Record<string, string[]> = {
  copy: [
    'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z',
    'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  ],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-up-down': ['m6 16 6 6 6-6M18 8l-6-6-6 6'],
  tag: ['M7 7h.01m13.58 6.41-7.17 7.17a1.998 1.998 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z'],
  key: [
    'm21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  ],
  anchor: ['M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 22V8M5 12H2a10 10 0 0 0 20 0h-3'],
  'more-vertical': [
    'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  ],
  x: ['M18 6 6 18M6 6l12 12'],
  plus: ['M12 5v14M5 12h14'],
  'external-link': ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3'],
  check: ['M20 6 9 17l-5-5'],
  'help-circle': [
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  ],
  'alert-circle': ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 8v4M12 16h.01'],
};

export type IconName = keyof typeof STROKE;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(STROKE[name] ?? []).map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      ))}
    </svg>
  );
}

/**
 * Sefaria's 3×3 dot grid in white. Live's custom CSS draws it in place of ReadMe's `more-vertical` icon, which is why
 * the "More Languages" button shows nothing until it is hovered, focused or open (it gets a tinted background then).
 */
export function DotGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      {[3.375, 9, 14.625].flatMap((y) =>
        [3.375, 9, 14.625].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.875} fill="#fff" />)
      )}
    </svg>
  );
}

/** Small brand-neutral language marks (16×16), in the colors of live's language icons. */
const LANGUAGE_ICONS: Record<string, ReactElement> = {
  shell: (
    <g stroke="#6b5bd2" strokeWidth={1.6} strokeLinecap="round">
      <path d="M7.5 3.5 4 12.5M12 3.5 8.5 12.5" />
      <circle cx="2.5" cy="6" r="0.6" fill="#6b5bd2" />
      <circle cx="2.5" cy="10" r="0.6" fill="#6b5bd2" />
    </g>
  ),
  node: (
    <g>
      <path d="M8 1.2 13.8 4.6v6.8L8 14.8 2.2 11.4V4.6Z" fill="#68a063" />
      <path d="M8 4.6 10.9 6.3v3.4L8 11.4 5.1 9.7V6.3Z" fill="#fff" opacity="0.85" />
    </g>
  ),
  ruby: (
    <g>
      <path d="M4 2.5h8l2.5 3.5L8 14 1.5 6Z" fill="#d91404" />
      <path d="M4 2.5 8 14l4-11.5" fill="none" stroke="#fff" strokeWidth={0.7} opacity="0.6" />
    </g>
  ),
  php: (
    <text
      x="8"
      y="10.5"
      textAnchor="middle"
      fontSize="7"
      fontStyle="italic"
      fontWeight="700"
      fill="#7a86b8"
      fontFamily="Arial, sans-serif"
    >
      php
    </text>
  ),
  python: (
    <g>
      <path
        d="M7.9 1.2c-3 0-2.8 1.3-2.8 1.3v1.4H8v.5H3.9S2 4.2 2 7.2s1.7 2.9 1.7 2.9h1V8.7s0-1.7 1.7-1.7h2.9s1.6 0 1.6-1.6V2.8S11.1 1.2 7.9 1.2Z"
        fill="#3c78aa"
      />
      <path
        d="M8.1 14.8c3 0 2.8-1.3 2.8-1.3v-1.4H8v-.5h4.1S14 11.8 14 8.8s-1.7-2.9-1.7-2.9h-1v1.4s0 1.7-1.7 1.7H6.7s-1.6 0-1.6 1.6v2.6s-.2 1.6 3 1.6Z"
        fill="#fdd343"
      />
    </g>
  ),
  robot: (
    <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" fill="none">
      <rect x="2.5" y="5" width="11" height="8.5" rx="2.5" />
      <path d="M8 2.2V5M6.6 11h2.8" />
      <circle cx="5.8" cy="8.4" r="0.9" />
      <circle cx="10.2" cy="8.4" r="0.9" />
    </g>
  ),
};

const LETTER_COLORS: Record<string, [string, string]> = {
  c: ['C', '#5c6bc0'],
  csharp: ['C#', '#68217a'],
  cplusplus: ['C++', '#00599c'],
  clojure: ['clj', '#5881d8'],
  crystal: ['Cr', '#333'],
  go: ['Go', '#00acd7'],
  http: ['HTTP', '#666b79'],
  java: ['J', '#e76f00'],
  javascript: ['JS', '#c9a400'],
  json: ['{ }', '#666b79'],
  kotlin: ['K', '#7f52ff'],
  objectivec: ['OC', '#438eff'],
  ocaml: ['ml', '#ec6813'],
  powershell: ['PS', '#2671be'],
  r: ['R', '#276dc3'],
  rust: ['Rs', '#a72145'],
  swift: ['Sw', '#f05138'],
};

export function LanguageIcon({ name, className }: { name: string; className?: string }) {
  const known = LANGUAGE_ICONS[name];
  const letters = LETTER_COLORS[name];
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {known ??
        (letters !== undefined ? (
          <text
            x="8"
            y="11"
            textAnchor="middle"
            fontSize={letters[0].length > 2 ? 5.5 : 8}
            fontWeight="700"
            fill={letters[1]}
            fontFamily="Arial, sans-serif"
          >
            {letters[0]}
          </text>
        ) : null)}
    </svg>
  );
}

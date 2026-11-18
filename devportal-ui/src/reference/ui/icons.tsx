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

// Language marks of the picker, matched to live's at 16px (pixel harness, v3_default languagePicker):
// - node: Simple Icons "nodedotjs" (CC0 1.0, https://simpleicons.org), in live's #8fd636;
// - ruby: Devicon "ruby-plain" (MIT, https://devicon.dev, Copyright (c) 2015 konpa);
// - python: Devicon "python-original" (MIT, as above), with its two gradients flattened to the Python
//   Software Foundation's blue and yellow and its drop shadow left out;
// - shell and php: drawn here, in live's colors.
// Trademarks belong to their owners; the marks only name the language of each code sample.
const LANGUAGE_ICONS: Record<string, ReactElement> = {
  shell: (
    <g stroke="#484c58" strokeWidth={1.6} strokeLinecap="round">
      <path d="M7.5 3.5 4 12.5M12 3.5 8.5 12.5" />
      <circle cx="2.5" cy="6" r="0.6" fill="#484c58" />
      <circle cx="2.5" cy="10" r="0.6" fill="#484c58" />
    </g>
  ),
  node: (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path
        fill="#8fd636"
        d="M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z"
      />
    </svg>
  ),
  ruby: (
    <svg width="16" height="16" viewBox="0 0 128 128">
      <path
        fill="#d91404"
        d="m35.971 111.33 81.958 11.188c-9.374-15.606-18.507-30.813-27.713-46.144Zm89.71-86.383L93.513 73.339c-.462.696-1.061 1.248-.41 2.321 8.016 13.237 15.969 26.513 23.942 39.777 1.258 2.095 2.53 4.182 4.157 6.192l4.834-96.58zM16.252 66.22c.375.355 1.311.562 1.747.347 7.689-3.779 15.427-7.474 22.948-11.564 2.453-1.333 4.339-3.723 6.452-5.661 6.997-6.417 13.983-12.847 20.966-19.278.427-.395.933-.777 1.188-1.275 2.508-4.902 4.973-9.829 7.525-14.898-3.043-1.144-5.928-2.263-8.849-3.281-.396-.138-1.02.136-1.449.375-6.761 3.777-13.649 7.353-20.195 11.472-3.275 2.061-5.943 5.098-8.843 7.743-4.674 4.266-9.342 8.542-13.948 12.882a24.011 24.011 0 0 0-3.288 3.854c-3.15 4.587-6.206 9.24-9.402 14.025 1.786 1.847 3.41 3.613 5.148 5.259zm28.102-6.271-11.556 48.823 54.3-34.987zm76.631-34.846-46.15 7.71 15.662 38.096zM44.996 56.644l41.892 13.6c-5.25-12.79-10.32-25.133-15.495-37.737ZM16.831 75.643 2.169 110.691l27.925-.825Zm13.593 26.096.346-.076c3.353-13.941 6.754-27.786 10.177-42.272L18.544 71.035c3.819 9.926 7.891 20.397 11.88 30.704zm84.927-78.897c-4.459-1.181-8.918-2.366-13.379-3.539-6.412-1.686-12.829-3.351-19.237-5.052-.801-.213-1.38-.352-1.851.613-2.265 4.64-4.6 9.245-6.901 13.868-.071.143-.056.328-.111.687l41.47-6.285zM89.482 12.288l36.343 10.054-6.005-17.11-30.285 6.715ZM33.505 114.007c-4.501-.519-9.122-.042-13.687.037-3.75.063-7.5.206-11.25.323-.386.012-.771.09-1.156.506 31.003 2.866 62.005 5.732 93.007 8.6l.063-.414-29.815-4.07c-12.384-1.691-24.747-3.551-37.162-4.982ZM2.782 99.994c3.995-9.27 7.973-18.546 11.984-27.809.401-.929.37-1.56-.415-2.308-1.678-1.597-3.237-3.318-5.071-5.226-2.479 12.24-4.897 24.177-7.317 36.113l.271.127c.185-.297.411-.578.548-.897zm78.74-90.153c6.737-1.738 13.572-3.097 20.367-4.613.44-.099.87-.244 1.303-.368l-.067-.332-29.194 3.928c2.741 1.197 4.853 2.091 7.591 1.385z"
      />
    </svg>
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
    <svg width="16" height="16" viewBox="0 0 128 128">
      <g transform="translate(0 10.26)">
        <path
          fill="#3776ab"
          d="M63.391 1.988c-4.222.02-8.252.379-11.8 1.007-10.45 1.846-12.346 5.71-12.346 12.837v9.411h24.693v3.137H29.977c-7.176 0-13.46 4.313-15.426 12.521-2.268 9.405-2.368 15.275 0 25.096 1.755 7.311 5.947 12.519 13.124 12.519h8.491V67.234c0-8.151 7.051-15.34 15.426-15.34h24.665c6.866 0 12.346-5.654 12.346-12.548V15.833c0-6.693-5.646-11.72-12.346-12.837-4.244-.706-8.645-1.027-12.866-1.008zM50.037 9.557c2.55 0 4.634 2.117 4.634 4.721 0 2.593-2.083 4.69-4.634 4.69-2.56 0-4.633-2.097-4.633-4.69-.001-2.604 2.073-4.721 4.633-4.721z"
        />
        <path
          fill="#ffd43b"
          d="M91.682 28.38v10.966c0 8.5-7.208 15.655-15.426 15.655H51.591c-6.756 0-12.346 5.783-12.346 12.549v23.515c0 6.691 5.818 10.628 12.346 12.547 7.816 2.297 15.312 2.713 24.665 0 6.216-1.801 12.346-5.423 12.346-12.547v-9.412H63.938v-3.138h37.012c7.176 0 9.852-5.005 12.348-12.519 2.578-7.735 2.467-15.174 0-25.096-1.774-7.145-5.161-12.521-12.348-12.521h-9.268zM77.809 87.927c2.561 0 4.634 2.097 4.634 4.692 0 2.602-2.074 4.719-4.634 4.719-2.55 0-4.633-2.117-4.633-4.719 0-2.595 2.083-4.692 4.633-4.692z"
        />
      </g>
    </svg>
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

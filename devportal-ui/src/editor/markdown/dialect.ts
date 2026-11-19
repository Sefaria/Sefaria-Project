// The C4 dialect's tables and small rules, mirrored from the Python renderer (devportal/markdown/). The editor
// needs them to parse the same constructs and to show the canvas as the public page renders it. Kept equal to the
// Python tables by devportal/tests/pure/editor_golden_test.py (scripts/roundtrip-corpus.ts writes these out).

/** Emoji shortcodes (devportal/markdown/emoji.py SHORTCODES). Unknown names stay as typed. */
export const SHORTCODES: Readonly<Record<string, string>> = {
  '+1': '👍',
  '-1': '👎',
  bangbang: '‼️',
  book: '📖',
  books: '📚',
  bookmark: '🔖',
  bug: '🐛',
  bulb: '💡',
  calendar: '📆',
  chart_with_upwards_trend: '📈',
  check: '✔️',
  heavy_check_mark: '✔️',
  white_check_mark: '✅',
  clap: '👏',
  computer: '💻',
  construction: '🚧',
  dart: '🎯',
  email: '📧',
  envelope: '✉️',
  eyes: '👀',
  fire: '🔥',
  gear: '⚙️',
  globe_with_meridians: '🌐',
  handshake: '🤝',
  hammer: '🔨',
  hammer_and_wrench: '🛠️',
  heart: '❤️',
  information_source: 'ℹ️',
  interrobang: '⁉️',
  key: '🔑',
  link: '🔗',
  lock: '🔒',
  mag: '🔍',
  memo: '📝',
  pencil: '📝',
  pencil2: '✏️',
  no_entry: '⛔',
  exclamation: '❗',
  heavy_exclamation_mark: '❗',
  question: '❓',
  package: '📦',
  pushpin: '📌',
  raised_hands: '🙌',
  rocket: '🚀',
  rotating_light: '🚨',
  smile: '😄',
  smiley: '😃',
  sparkles: '✨',
  star: '⭐',
  stop_sign: '🛑',
  tada: '🎉',
  thumbsup: '👍',
  thumbsdown: '👎',
  warning: '⚠️',
  wave: '👋',
  wrench: '🔧',
  x: '❌',
  zap: '⚡',
  blue_book: '📘',
  scroll: '📜',
  speech_balloon: '💬',
  trophy: '🏆',
  '100': '💯',
};
export const SHORTCODE_RE = /:([a-z0-9_+-]+):/g;

/** Code-tab labels when the info string has no title (renderer.py LANG_LABELS). */
export const LANG_LABELS: Readonly<Record<string, string>> = {
  bash: 'Bash',
  c: 'C',
  clojure: 'Clojure',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  curl: 'cURL',
  dart: 'Dart',
  docker: 'Docker',
  dockerfile: 'Dockerfile',
  go: 'Go',
  graphql: 'GraphQL',
  html: 'HTML',
  http: 'HTTP',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  markdown: 'Markdown',
  md: 'Markdown',
  node: 'Node',
  objectivec: 'Objective-C',
  php: 'PHP',
  powershell: 'PowerShell',
  py: 'Python',
  python: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scala: 'Scala',
  scss: 'SCSS',
  sh: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  text: 'Text',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};

/** Blockquote callouts: first-line emoji → theme (renderer.py CALLOUT_EMOJI, live's table). */
export const CALLOUT_EMOJI: Readonly<Record<string, CalloutTheme>> = {
  '📘': 'info',
  ℹ️: 'info',
  '🚧': 'warn',
  '⚠️': 'warn',
  '⚠': 'warn',
  '👍': 'okay',
  '✅': 'okay',
  '❗️': 'error',
  '❗': 'error',
  '🛑': 'error',
  '⁉️': 'error',
  '‼️': 'error',
};
export const CALLOUT_EMOJI_ORDER = Object.keys(CALLOUT_EMOJI).sort((a, b) => b.length - a.length);
export const CALLOUT_THEMES = ['default', 'info', 'warn', 'error', 'okay'] as const;
export type CalloutTheme = (typeof CALLOUT_THEMES)[number];
export const THEME_ALIASES: Readonly<Record<string, CalloutTheme>> = {
  success: 'okay',
  warning: 'warn',
  danger: 'error',
};
export const THEME_ICONS: Readonly<Record<CalloutTheme, string>> = {
  default: '📘',
  info: '📘',
  warn: '🚧',
  error: '❗️',
  okay: '👍',
};

export const ALIGNS = ['left', 'center', 'right'] as const;
export type Align = (typeof ALIGNS)[number];
export const WIDTH_RE = /^\d+(\.\d+)?(px|%)?$/;
export const YOUTUBE_RE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/;

/** The callout theme a component's `theme` attribute resolves to. */
export function resolveTheme(theme: unknown): CalloutTheme {
  const raw = typeof theme === 'string' ? theme : 'default';
  const aliased = THEME_ALIASES[raw] ?? raw;
  return (CALLOUT_THEMES as readonly string[]).includes(aliased) ? (aliased as CalloutTheme) : 'default';
}

export function codeLabel(lang: string, title: string): string {
  return title || LANG_LABELS[lang.toLowerCase()] || lang;
}

// --- links (devportal/markdown/links.py rewrite_link) ---------------------------------------------------------

const PREFIXES: ReadonlyArray<[string, string]> = [
  ['doc:', '/docs/'],
  ['ref:', '/reference/'],
  ['page:', '/page/'],
];
const DEV_HOST = /^https?:\/\/developers\.sefaria\.org(?=\/|$|\?|#)/i;

/** doc:/ref:/page: and absolute developers.sefaria.org URLs become portal paths; anything else is unchanged. */
export function rewriteLink(url: string): string {
  const stripped = url.trim();
  for (const [prefix, target] of PREFIXES) {
    if (stripped.startsWith(prefix)) {
      const rest = stripped.slice(prefix.length);
      const malformed = rest.startsWith(' ') || rest.startsWith('%20') || (rest.split('#', 1)[0] ?? '').includes('/');
      return rest && !malformed ? target + rest : url;
    }
  }
  const m = DEV_HOST.exec(stripped);
  if (m) {
    const rest = stripped.slice(m[0].length);
    return rest.startsWith('/') ? rest : '/' + rest;
  }
  return url;
}

// --- front matter (devportal/markdown/frontmatter.py) ---------------------------------------------------------

/** `[frontMatter, body]`: the raw block including both `---` fences (as it appears in the source), and the rest. */
export function splitFrontMatter(text: string): [string | null, string] {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return [null, text];
  const start = text.indexOf('\n');
  const close = /\n---(\n|$)/g;
  close.lastIndex = start;
  const m = close.exec(text);
  if (m === null) return [null, text];
  const end = m.index + m[0].length;
  return [text.slice(0, end), text.slice(end)];
}

// --- heading ids (devportal/markdown/slugger.py, github-slugger) ----------------------------------------------

const KEEP = /[\p{L}\p{M}\p{N}\p{Pc} -]/u;

export function slugify(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) if (KEEP.test(ch)) out += ch;
  return out.replace(/ /g, '-');
}

export class Slugger {
  private occurrences = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text);
    let result = base;
    while (this.occurrences.has(result)) {
      const n = (this.occurrences.get(base) ?? 0) + 1;
      this.occurrences.set(base, n);
      result = `${base}-${n}`;
    }
    this.occurrences.set(result, 0);
    return result;
  }
}

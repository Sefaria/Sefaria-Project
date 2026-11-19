// tech_used_raw is free prose, so matching is a case-insensitive substring
// search. "claude code" is counted on its own and stripped first so it doesn't
// also count toward the generic Claude/Anthropic API bucket.
const CLAUDE_CODE = 'claude code';

interface Technology {
  label: string;
  patterns: readonly string[];
}

export const KNOWN_TECHNOLOGIES: readonly Technology[] = [
  { label: 'Claude/Anthropic API', patterns: ['claude', 'anthropic'] },
  { label: 'React', patterns: ['react'] },
  { label: 'Next.js', patterns: ['next.js', 'nextjs'] },
  { label: 'Vercel', patterns: ['vercel'] },
  { label: 'Python', patterns: ['python'] },
  // The pattern matches any MCP, not just Sefaria's, so the label is generic.
  { label: 'MCP', patterns: ['mcp'] },
  { label: 'Supabase', patterns: ['supabase'] },
  { label: 'Deepgram', patterns: ['deepgram'] },
  { label: '.NET', patterns: ['.net'] },
  { label: 'C#', patterns: ['c#'] },
  { label: 'Avalonia', patterns: ['avalonia'] },
  { label: 'LiteDB', patterns: ['litedb'] },
  { label: 'GitHub', patterns: ['github'] },
  { label: 'ChatGPT', patterns: ['chatgpt'] },
  { label: 'Gemini', patterns: ['gemini'] },
  { label: 'Base44', patterns: ['base44'] },
  { label: 'Discord', patterns: ['discord'] },
  { label: 'Spring Boot', patterns: ['springboot', 'spring boot'] },
  { label: 'GCP', patterns: ['gcp'] },
  { label: 'Lovable', patterns: ['lovable'] },
  { label: 'Llama Index', patterns: ['llama index', 'llamaindex'] },
  { label: 'Gradio', patterns: ['gradio'] },
  { label: 'OpenAI', patterns: ['openai'] },
  { label: 'Google Colab', patterns: ['colab'] },
  { label: 'Flask', patterns: ['flask'] },
  { label: 'PostgreSQL', patterns: ['postgres'] },
  { label: 'Drizzle ORM', patterns: ['drizzle'] },
  { label: 'Tiptap', patterns: ['tiptap'] },
  { label: 'Google Sheets API', patterns: ['google sheets'] },
  { label: 'Umami', patterns: ['umami'] },
  { label: 'Hebcal', patterns: ['hebcal'] },
];

/** Technology labels mentioned in a project's free-text stack description. */
export function parseTech(raw: string | null | undefined): string[] {
  let text = (raw ?? '').toLowerCase();
  if (!text.trim()) return [];
  const found: string[] = [];
  if (text.includes(CLAUDE_CODE)) {
    found.push('Claude Code');
    text = text.replaceAll(CLAUDE_CODE, '');
  }
  for (const { label, patterns } of KNOWN_TECHNOLOGIES) {
    if (patterns.some((p) => text.includes(p))) found.push(label);
  }
  return found;
}

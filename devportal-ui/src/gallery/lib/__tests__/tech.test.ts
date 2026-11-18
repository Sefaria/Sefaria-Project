import { describe, expect, it } from 'vitest';
import { parseTech } from '../tech';

describe('parseTech', () => {
  it('returns [] for empty input', () => {
    expect(parseTech(null)).toEqual([]);
    expect(parseTech('   ')).toEqual([]);
  });

  it('matches case-insensitively on substrings', () => {
    expect(parseTech('Built with PYTHON and Flask on Vercel')).toEqual(['Vercel', 'Python', 'Flask']);
  });

  it('counts Claude Code on its own, not as the Claude API', () => {
    expect(parseTech('Claude Code')).toEqual(['Claude Code']);
    expect(parseTech('Claude Code plus the Claude API')).toEqual(['Claude Code', 'Claude/Anthropic API']);
  });

  it('labels any MCP generically as MCP', () => {
    expect(parseTech('a custom mcp server')).toEqual(['MCP']);
  });

  it('supports alternative spellings', () => {
    expect(parseTech('Spring Boot')).toEqual(['Spring Boot']);
    expect(parseTech('springboot')).toEqual(['Spring Boot']);
    expect(parseTech('NextJS')).toEqual(['Next.js']);
  });
});

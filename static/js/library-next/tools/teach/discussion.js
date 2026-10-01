/**
 * Discussion-question helpers for the educator tool: the template questions come from
 * my-library's `questions` module (shared, not forked); here only the assistant prompt that
 * quotes the selected text. Pure; jest-covered.
 */
import { plainText } from '../../reader/textData';

export const QUOTE_LIMIT = 500;

/** The selection's English (or Hebrew) text, trimmed for a prompt. */
export function quoteFor(selection, limit = QUOTE_LIMIT) {
  const segments = selection.segments || [];
  const en = segments.map(s => plainText(s.en)).filter(Boolean).join(' ');
  const he = segments.map(s => plainText(s.he)).filter(Boolean).join(' ');
  const text = en || he;
  return text.length > limit ? `${text.slice(0, limit).replace(/\s+\S*$/, '')}…` : text;
}

/** The prompt handed to the assistant: the ref, its category and the quoted text, in the interface language. */
export function discussionPrompt({ selection, book, lang = 'en', current = [] }) {
  const quote = quoteFor(selection);
  const category = book.primaryCategory || '';
  const have = current.filter(Boolean);
  if (lang === 'he') {
    return [
      `אני מלמד/ת את ${selection.heRef || selection.ref}${category ? ` (${category})` : ''}. הטקסט:`,
      `"${quote}"`,
      have.length ? `יש לי כבר את השאלות האלה: ${have.map((q, i) => `(${i + 1}) ${q}`).join(' ')}` : null,
      'הצע/י שלוש שאלות דיון טובות יותר לכיתה, מהקלה אל הקשה, והסבר/י במשפט מה כל שאלה בודקת.',
    ].filter(Boolean).join('\n');
  }
  return [
    `I am teaching ${selection.ref}${category ? ` (${category})` : ''}. The text:`,
    `"${quote}"`,
    have.length ? `I already have these questions: ${have.map((q, i) => `(${i + 1}) ${q}`).join(' ')}` : null,
    'Suggest three better classroom discussion questions, from accessible to demanding, and say in one sentence what each one tests.',
  ].filter(Boolean).join('\n');
}

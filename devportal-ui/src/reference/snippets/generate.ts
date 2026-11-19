// Code samples (PLAN Phase 2 "Code samples"): @readme/httpsnippet for every language but "Agent Prompt", which is
// our own small generator. Options mirror live's output (tests compare with samples captured from live).
import { HTTPSnippet } from '@readme/httpsnippet';
import type { HarRequest } from '../request/request';
import type { Language, Library } from './languages';

/** Per-target options that make httpsnippet's output equal live's. */
const TARGET_OPTIONS: Record<string, Record<string, unknown>> = {
  'shell:curl': { indent: '     ' },
};

const AGENT_INTRO =
  'Write code that makes the HTTP request described below. Use my preferred programming language and HTTP client ' +
  "library — if I haven't told you what those are, ask me before writing any code.";
const AGENT_OUTRO =
  'The request the code makes must match the method, URL, headers, and body exactly as described above.';

interface PreparedRequest {
  method: string;
  fullUrl: string;
  headers: { name: string; value: string }[];
  postData?: { mimeType?: string; text?: string };
}

/** "Agent Prompt": a plain-language description of the request for an AI coding agent, as live words it. */
export function agentPrompt(request: PreparedRequest): string {
  const parts = [AGENT_INTRO, `Method: ${request.method}\nURL: ${request.fullUrl}`];
  if (request.headers.length > 0) {
    parts.push(`Headers:\n${request.headers.map((h) => `  ${h.name}: ${h.value}`).join('\n')}`);
  }
  if (request.postData?.text !== undefined && request.postData.text !== '') {
    parts.push(`Body (${request.postData.mimeType ?? 'text/plain'}):\n${request.postData.text}`);
  }
  parts.push(AGENT_OUTRO);
  return parts.join('\n\n');
}

/** "JSON": the request body, pretty-printed, or live's note when there is none. */
function jsonBody(har: HarRequest): string {
  const text = har.postData?.text;
  if (text === undefined || text === '') return 'No JSON body';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The sample for one language and library. Line endings are `\n`, as CodeMirror shows them. */
export function generateSnippet(har: HarRequest, language: Language, library: Library): string {
  if (language.id === 'json') return jsonBody(har);
  // httpsnippet's own HarRequest type requires postData; it accepts requests without one at run time.
  const snippet = new HTTPSnippet(har as unknown as ConstructorParameters<typeof HTTPSnippet>[0]);
  let code: string;
  if (library.target === 'agent') {
    // fullUrl is the URL with the query string encoded the way every other sample shows it.
    const prepared = snippet.init().requests[0] as unknown as PreparedRequest;
    code = agentPrompt({ method: har.method, fullUrl: prepared.fullUrl, headers: har.headers, postData: har.postData });
  } else {
    const options = TARGET_OPTIONS[`${library.target}:${library.client}`];
    const result = snippet.convert(library.target as Parameters<HTTPSnippet['convert']>[0], library.client, options)[0];
    code = typeof result === 'string' ? result : '';
  }
  return code.replace(/\r\n?/g, '\n');
}

// Test data for the search tests: search documents shaped like the C3 file.
import type { SearchDocument } from '../contracts';

function page(id: number, section: 'docs' | 'page' | 'reference', title: string, body: string): SearchDocument {
  return {
    id: `page:${id}`,
    section,
    kind: 'page',
    title,
    path: `/${section}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    method: null,
    excerpt: '',
    headings: [],
    body,
    params: [],
    responses: [],
  };
}

function endpoint(
  opId: string,
  method: 'get' | 'post',
  title: string,
  apiPath: string,
  extra: Partial<SearchDocument> = {}
): SearchDocument {
  return {
    id: `op:${opId}`,
    section: 'reference',
    kind: 'endpoint',
    title,
    path: `/reference/${opId}`,
    method,
    excerpt: '',
    headings: [],
    body: apiPath,
    params: [],
    responses: [],
    ...extra,
  };
}

/** 4 docs pages, 1 custom page, 22 endpoints: "ref" matches 2 docs and 21 endpoints (two result pages). */
export const TEST_DOCUMENTS: SearchDocument[] = [
  page(1, 'docs', 'Text References', 'Sefaria depends on the ability to refer to segments of text.'),
  page(2, 'docs', 'The Sefaria Linker', 'The Linker recognizes references on a web page and links them.'),
  page(3, 'docs', 'Welcome', 'Explore the documentation of the library.'),
  page(4, 'docs', 'Categories', 'Categories group texts together.'),
  page(5, 'page', 'Contact Us', 'Use this form to contact the engineering team.'),
  endpoint('get-ref', 'get', 'Ref', '/api/ref/{tref}'),
  endpoint('post-find-refs', 'post', 'Find Refs', '/api/find-refs', {
    params: [{ name: 'text', description: 'The text in which to find citations.' }],
  }),
  endpoint('get-name', 'get', 'Name', '/api/name/{name}', {
    responses: [
      { status: '200', description: 'Successful response' },
      { status: '200', description: 'If type=ref, this returns the canonical ref for the submitted text.' },
    ],
  }),
  ...Array.from({ length: 18 }, (_, i) =>
    endpoint(`get-ref-thing-${i}`, 'get', `Ref Thing ${i}`, `/api/ref-things/${i}`)
  ),
  endpoint('get-calendars', 'get', 'Calendars', '/api/calendars', {
    params: [{ name: 'diaspora', description: 'Whether to use the diaspora schedule.' }],
  }),
];

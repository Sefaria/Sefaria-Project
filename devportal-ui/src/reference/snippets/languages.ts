// The code-sample languages of the playground, in live's order: five buttons, then the "More Languages" menu
// with its 18 entries. Libraries and defaults as live, except Node (deviation D-4): Axios, fetch and http only,
// fetch by default, and no ReadMe `api` SDK.

export interface Library {
  /** Key stored in the language preference. */
  id: string;
  /** Label in the library menu and the request card header ("cURL" → "cURL Request"). */
  label: string;
  /** @readme/httpsnippet target and client; `agent` is our own generator (agentPrompt.ts). */
  target: string;
  client: string;
}

export interface Language {
  id: string;
  label: string;
  /** Icon name in icons.tsx. */
  icon: string;
  /** CodeMirror 5 mode used to tokenize the sample; null for plain text. */
  mode: string | object | null;
  libraries: Library[];
  defaultLibrary: string;
}

const lib = (id: string, label: string, target: string, client: string): Library => ({ id, label, target, client });

export const PRIMARY_LANGUAGES: Language[] = [
  {
    id: 'shell',
    label: 'Shell',
    icon: 'shell',
    mode: 'shell',
    libraries: [lib('curl', 'cURL', 'shell', 'curl'), lib('httpie', 'HTTPie', 'shell', 'httpie')],
    defaultLibrary: 'curl',
  },
  {
    id: 'node',
    label: 'Node',
    icon: 'node',
    mode: 'javascript',
    libraries: [
      lib('axios', 'Axios', 'node', 'axios'),
      lib('fetch', 'fetch', 'node', 'fetch'),
      lib('http', 'http', 'node', 'native'),
    ],
    defaultLibrary: 'fetch',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    icon: 'ruby',
    mode: 'ruby',
    libraries: [lib('native', '', 'ruby', 'native')],
    defaultLibrary: 'native',
  },
  {
    id: 'php',
    label: 'PHP',
    icon: 'php',
    mode: 'php',
    libraries: [lib('curl', 'cURL', 'php', 'curl'), lib('guzzle', 'Guzzle', 'php', 'guzzle')],
    defaultLibrary: 'guzzle',
  },
  {
    id: 'python',
    label: 'Python',
    icon: 'python',
    mode: 'python',
    libraries: [lib('requests', '', 'python', 'requests')],
    defaultLibrary: 'requests',
  },
];

const single = (
  id: string,
  label: string,
  icon: string,
  mode: string | object | null,
  target: string,
  client: string
): Language => ({
  id,
  label,
  icon,
  mode,
  libraries: [lib(client, '', target, client)],
  defaultLibrary: client,
});

export const MORE_LANGUAGES: Language[] = [
  single('agent', 'Agent Prompt', 'robot', null, 'agent', 'prompt'),
  single('c', 'C', 'c', 'text/x-csrc', 'c', 'libcurl'),
  {
    id: 'csharp',
    label: 'C#',
    icon: 'csharp',
    mode: 'text/x-csharp',
    libraries: [
      lib('httpclient', 'HttpClient', 'csharp', 'httpclient'),
      lib('restsharp', 'RestSharp', 'csharp', 'restsharp'),
    ],
    defaultLibrary: 'restsharp',
  },
  single('cplusplus', 'C++', 'cplusplus', 'text/x-c++src', 'c', 'libcurl'),
  single('clojure', 'Clojure', 'clojure', 'clojure', 'clojure', 'clj_http'),
  single('crystal', 'Crystal', 'crystal', 'crystal', 'crystal', 'native'),
  single('go', 'Go', 'go', 'go', 'go', 'native'),
  single('http', 'HTTP', 'http', 'http', 'http', 'http1.1'),
  {
    id: 'java',
    label: 'Java',
    icon: 'java',
    mode: 'text/x-java',
    libraries: [
      lib('asynchttp', 'AsyncHttp', 'java', 'asynchttp'),
      lib('nethttp', 'java.net.http', 'java', 'nethttp'),
      lib('okhttp', 'OkHttp', 'java', 'okhttp'),
      lib('unirest', 'Unirest', 'java', 'unirest'),
    ],
    defaultLibrary: 'okhttp',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    icon: 'javascript',
    mode: 'javascript',
    libraries: [
      lib('axios', 'Axios', 'javascript', 'axios'),
      lib('fetch', 'fetch', 'javascript', 'fetch'),
      lib('jquery', 'jQuery', 'javascript', 'jquery'),
      lib('xhr', 'XMLHttpRequest', 'javascript', 'xhr'),
    ],
    defaultLibrary: 'fetch',
  },
  single('json', 'JSON', 'json', { name: 'javascript', json: true }, 'json', 'native'),
  single('kotlin', 'Kotlin', 'kotlin', 'text/x-kotlin', 'kotlin', 'okhttp'),
  single('objectivec', 'Objective-C', 'objectivec', 'text/x-objectivec', 'objc', 'nsurlsession'),
  single('ocaml', 'OCaml', 'ocaml', 'text/x-ocaml', 'ocaml', 'cohttp'),
  {
    id: 'powershell',
    label: 'PowerShell',
    icon: 'powershell',
    mode: 'powershell',
    libraries: [
      lib('restmethod', 'Invoke-RestMethod', 'powershell', 'restmethod'),
      lib('webrequest', 'Invoke-WebRequest', 'powershell', 'webrequest'),
    ],
    defaultLibrary: 'webrequest',
  },
  single('r', 'R', 'r', 'r', 'r', 'httr'),
  single('rust', 'Rust', 'rust', 'rust', 'rust', 'reqwest'),
  single('swift', 'Swift', 'swift', 'swift', 'swift', 'urlsession'),
];

export const ALL_LANGUAGES: Language[] = [...PRIMARY_LANGUAGES, ...MORE_LANGUAGES];

const SHELL = PRIMARY_LANGUAGES[0] as Language;

export function findLanguage(id: string): Language {
  return ALL_LANGUAGES.find((l) => l.id === id) ?? SHELL;
}

export function findLibrary(language: Language, id: string | undefined): Library {
  const found =
    language.libraries.find((l) => l.id === id) ?? language.libraries.find((l) => l.id === language.defaultLibrary);
  return found ?? (language.libraries[0] as Library);
}

/** The request card's header text: "cURL Request" for a language with a library menu, else "Request". */
export function requestLabel(language: Language, library: Library): string {
  return language.libraries.length > 1 ? `${library.label} Request` : 'Request';
}
